import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { isPrivileged } from '../auth.js';
import { badRequest, dateOnly, positiveId } from '../http.js';

type Period = { inicio: string; fim: string; granularidade: 'dia' | 'semana' | 'mes'; label: string };

function fortalezaToday(): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function iso(date: Date): string { return date.toISOString().slice(0, 10); }
function move(date: Date, days: number): Date { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy; }
function monthStart(date: Date): Date { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function monthEnd(date: Date): Date { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)); }

function resolvePeriod(query: Record<string, string | undefined>): Period {
  const today = fortalezaToday();
  const key = query.periodo || 'mes_atual';
  let inicio: Date;
  let fim: Date;
  let granularidade: Period['granularidade'];
  let label: string;

  if (key === 'personalizado') {
    if (!query.inicio || !query.fim) badRequest('Informe o início e o fim do período.');
    inicio = new Date(`${dateOnly(query.inicio, 'Data inicial')}T12:00:00Z`);
    fim = new Date(`${dateOnly(query.fim, 'Data final')}T12:00:00Z`);
    if (inicio > fim) badRequest('A data inicial deve ser anterior à data final.');
    const days = Math.floor((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
    granularidade = days <= 14 ? 'dia' : days <= 120 ? 'semana' : 'mes';
    label = 'Período personalizado';
  } else if (key === 'hoje') {
    inicio = fim = today; granularidade = 'dia'; label = 'Hoje';
  } else if (key === 'ontem') {
    inicio = fim = move(today, -1); granularidade = 'dia'; label = 'Ontem';
  } else if (key === 'mes_anterior') {
    const previous = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    inicio = monthStart(previous); fim = monthEnd(previous); granularidade = 'semana'; label = 'Mês anterior';
  } else if (key === 'ano_atual') {
    inicio = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    fim = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
    granularidade = 'mes'; label = 'Ano atual';
  } else if (key === 'ultimos_6_meses') {
    inicio = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
    fim = monthEnd(today); granularidade = 'mes'; label = 'Últimos 6 meses';
  } else {
    inicio = monthStart(today); fim = monthEnd(today); granularidade = 'semana'; label = 'Mês atual';
  }
  return { inicio: iso(inicio), fim: iso(fim), granularidade, label };
}

function evolutionSql(granularity: Period['granularidade'], startRef: string, endRef: string, filters: string): string {
  if (granularity === 'mes') return `
    with faixas as (
      select inicio::date, least((inicio + interval '1 month - 1 day')::date, ${endRef}::date) fim
      from generate_series(date_trunc('month', ${startRef}::date), date_trunc('month', ${endRef}::date), interval '1 month') inicio
    )
    select to_char(f.inicio,'YYYY-MM') as label, coalesce(sum(l.valor),0)::float8 as total
    from faixas f left join lancamentos l on l.data_pagamento between f.inicio and f.fim and l.excluido_em is null ${filters}
    group by f.inicio order by f.inicio`;
  if (granularity === 'semana') return `
    with faixas as (
      select inicio::date, least((inicio + interval '6 days')::date, ${endRef}::date) fim
      from generate_series(${startRef}::date, ${endRef}::date, interval '7 days') inicio
    )
    select concat(to_char(f.inicio,'DD/MM'),' – ',to_char(f.fim,'DD/MM')) as label, coalesce(sum(l.valor),0)::float8 as total
    from faixas f left join lancamentos l on l.data_pagamento between f.inicio and f.fim and l.excluido_em is null ${filters}
    group by f.inicio,f.fim order by f.inicio`;
  return `
    with faixas as (select inicio::date from generate_series(${startRef}::date, ${endRef}::date, interval '1 day') inicio)
    select to_char(f.inicio,'DD/MM') as label, coalesce(sum(l.valor),0)::float8 as total
    from faixas f left join lancamentos l on l.data_pagamento=f.inicio and l.excluido_em is null ${filters}
    group by f.inicio order by f.inicio`;
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', async (request) => {
    const user = request.authUser!;
    const privileged = isPrivileged(user);
    const query = request.query as Record<string, string | undefined>;
    const period = resolvePeriod(query);
    const params: unknown[] = [];
    const launchFilters: string[] = [];
    if (!privileged) {
      params.push(user.id);
      launchFilters.push(`and l.colaborador_id=$${params.length}`);
    }
    let budgetSedeFilter = '';
    let sedeId: number | null = null;
    if (query.sedeId) {
      sedeId = positiveId(query.sedeId, 'Sede');
      const exists = await pool.query(`select 1 from sedes where id=$1 and ativo`, [sedeId]);
      if (!exists.rowCount) badRequest('Sede não encontrada.');
      params.push(sedeId);
      launchFilters.push(`and l.sede_id=$${params.length}`);
      budgetSedeFilter = `and s.id=$${params.length}`;
    }
    params.push(period.inicio, period.fim);
    const startRef = `$${params.length - 1}`;
    const endRef = `$${params.length}`;
    const range = `and l.data_pagamento between ${startRef}::date and ${endRef}::date`;
    const filters = launchFilters.join(' ');
    const totalBudget = `(select coalesce(sum(coalesce(o.valor,0)),0)::float8
      from contas c cross join sedes s
      cross join generate_series(date_trunc('month',${startRef}::date),date_trunc('month',${endRef}::date),interval '1 month') mes(competencia)
      left join lateral (
        select historico.valor from orcamentos_contas historico
        where historico.conta_id=c.id and historico.sede_id=s.id and historico.competencia <= mes.competencia::date
        order by historico.competencia desc limit 1
      ) o on true
      where c.ativo and s.ativo ${budgetSedeFilter})`;
    const groupBudget = `(select coalesce(sum(coalesce(o.valor,0)),0)::float8
      from contas c cross join sedes s
      cross join generate_series(date_trunc('month',${startRef}::date),date_trunc('month',${endRef}::date),interval '1 month') mes(competencia)
      left join lateral (
        select historico.valor from orcamentos_contas historico
        where historico.conta_id=c.id and historico.sede_id=s.id and historico.competencia <= mes.competencia::date
        order by historico.competencia desc limit 1
      ) o on true
      where c.grupo_conta_id=g.id and c.ativo and s.ativo ${budgetSedeFilter})`;

    const [cards, evolution, groups, recent] = await Promise.all([
      pool.query(`
        select coalesce(sum(l.valor),0)::float8 as total, count(*)::int as quantidade,
          count(distinct l.grupo_conta_id)::int as categorias,
          ${totalBudget} as "orcamentoTotal"
        from lancamentos l where l.excluido_em is null ${filters} ${range}`, params),
      pool.query(evolutionSql(period.granularidade, startRef, endRef, filters), params),
      pool.query(`
        select g.nome, g.cor, coalesce(sum(l.valor),0)::float8 as total,
          ${groupBudget} as orcamento
        from grupos_contas g left join lancamentos l on l.grupo_conta_id=g.id and l.excluido_em is null ${filters} ${range}
        where g.ativo group by g.id,g.nome,g.cor order by total desc,g.codigo`, params),
      pool.query(`
        select l.numero_lancamento as "numeroLancamento", l.data_pagamento::text as "dataPagamento", c.nome as conta,
          g.nome as "grupoConta", g.cor, u.nome_exibicao as colaborador, l.valor::float8 as valor
        from lancamentos l join contas c on c.id=l.conta_id join grupos_contas g on g.id=l.grupo_conta_id
        join usuarios u on u.id=l.colaborador_id where l.excluido_em is null ${filters} ${range}
        order by l.criado_em desc limit 6`, params),
    ]);

    const cardData = cards.rows[0] as Record<string, unknown>;
    const groupData = groups.rows as Array<Record<string, unknown>>;
    if (!privileged) {
      delete cardData.orcamentoTotal;
      for (const group of groupData) delete group.orcamento;
    }
    return { cards: cardData, evolucao: evolution.rows, grupos: groupData, recentes: recent.rows, periodo: period, sedeId };
  });
}
