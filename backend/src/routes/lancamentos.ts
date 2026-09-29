import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { isAdmin, isPrivileged } from '../auth.js';
import { badRequest, dateOnly, forbidden, money, notFound, optionalText, positiveId } from '../http.js';
import type { AuthUser } from '../types.js';

const SELECT = `
  select l.numero_lancamento as "numeroLancamento", l.data_lancamento::text as "dataLancamento",
    to_char(l.hora_lancamento, 'HH24:MI') as hora, u.nome_exibicao as colaborador,
    l.colaborador_id as "colaboradorId", l.data_pagamento::text as "dataPagamento",
    s.id as "sedeId", s.nome as sede, cc.id as "centroCustoId", cc.nome as "centroCusto",
    gc.id as "grupoContaId", gc.nome as "grupoConta", gc.cor as "grupoCor",
    c.id as "contaId", c.nome as conta, l.observacao, l.valor::float8 as valor,
    l.criado_em as "criadoEm", l.atualizado_em as "atualizadoEm"
  from lancamentos l
  join usuarios u on u.id=l.colaborador_id join sedes s on s.id=l.sede_id
  join centros_custo cc on cc.id=l.centro_custo_id join grupos_contas gc on gc.id=l.grupo_conta_id
  join contas c on c.id=l.conta_id`;

function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const result: Record<string, { de: unknown; para: unknown }> = {};
  for (const key of ['dataPagamento', 'sedeId', 'centroCustoId', 'grupoContaId', 'contaId', 'observacao', 'valor']) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) result[key] = { de: before[key], para: after[key] };
  }
  return result;
}

async function audit(client: PoolClient, user: AuthUser, numero: number, acao: string, before: unknown, after: unknown, diff: unknown = null) {
  await client.query(
    `insert into auditoria_lancamentos (numero_lancamento, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, alteracoes)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [numero, acao, user.id, user.nomeExibicao, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, diff ? JSON.stringify(diff) : null],
  );
}

async function validateAccess(client: PoolClient, user: AuthUser, payload: Record<string, unknown>) {
  const dataPagamento = dateOnly(payload.dataPagamento, 'Data de pagamento');
  const sedeId = positiveId(payload.sedeId, 'Sede');
  const centroCustoId = positiveId(payload.centroCustoId, 'Centro de custo');
  const grupoContaId = positiveId(payload.grupoContaId, 'Grupo de contas');
  const contaId = positiveId(payload.contaId, 'Conta');
  const allowed = await client.query(
    `select
      exists(select 1 from usuario_sedes where usuario_id=$1 and sede_id=$2) as sede,
      exists(select 1 from usuario_centros_custo where usuario_id=$1 and centro_custo_id=$3) as centro,
      exists(select 1 from contas where id=$4 and grupo_conta_id=$5 and ativo) as conta`,
    [user.id, sedeId, centroCustoId, contaId, grupoContaId],
  );
  if (!isAdmin(user) && !allowed.rows[0]?.sede) badRequest('A sede não está liberada para este usuário.');
  if (!isAdmin(user) && !allowed.rows[0]?.centro) badRequest('O centro de custo não está liberado para este usuário.');
  if (!allowed.rows[0]?.conta) badRequest('A conta não pertence ao grupo selecionado.');
  return { dataPagamento, sedeId, centroCustoId, grupoContaId, contaId, observacao: optionalText(payload.observacao), valor: money(payload.valor) };
}

async function getOne(numero: number, user: AuthUser, client: PoolClient | typeof pool = pool) {
  const params: unknown[] = [numero];
  const ownership = isPrivileged(user) ? '' : 'and l.colaborador_id=$2';
  if (!isPrivileged(user)) params.push(user.id);
  const { rows } = await client.query(`${SELECT} where l.numero_lancamento=$1 and l.excluido_em is null ${ownership}`, params);
  return rows[0] as Record<string, unknown> | undefined;
}

export async function registerLancamentoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lancamentos', async (request) => {
    const user = request.authUser!;
    const q = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page || 1));
    const limit = Math.min(5000, Math.max(1, Number(q.limit || 15)));
    const where = ['l.excluido_em is null'];
    const params: unknown[] = [];
    if (!isPrivileged(user)) { params.push(user.id); where.push(`l.colaborador_id=$${params.length}`); }
    if (q.inicio) { params.push(dateOnly(q.inicio, 'Data inicial')); where.push(`l.data_pagamento >= $${params.length}`); }
    if (q.fim) { params.push(dateOnly(q.fim, 'Data final')); where.push(`l.data_pagamento <= $${params.length}`); }
    if (q.busca?.trim()) { params.push(`%${q.busca.trim()}%`); where.push(`(l.observacao ilike $${params.length} or c.nome ilike $${params.length} or u.nome_exibicao ilike $${params.length})`); }
    if (q.sedeId) { params.push(positiveId(q.sedeId, 'Sede')); where.push(`l.sede_id=$${params.length}`); }
    if (q.grupoContaId) { params.push(positiveId(q.grupoContaId, 'Grupo')); where.push(`l.grupo_conta_id=$${params.length}`); }
    if (q.colaboradorId && isPrivileged(user)) { params.push(positiveId(q.colaboradorId, 'Colaborador')); where.push(`l.colaborador_id=$${params.length}`); }
    const clause = where.join(' and ');
    const summary = await pool.query(`
      select count(*)::int as total,
        coalesce(sum(l.valor),0)::float8 as "valorTotal",
        coalesce(avg(l.valor),0)::float8 as "valorMedio",
        coalesce(max(l.valor),0)::float8 as "maiorValor"
      from lancamentos l
      join usuarios u on u.id=l.colaborador_id
      join contas c on c.id=l.conta_id
      where ${clause}`, params);
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(`${SELECT} where ${clause} order by l.criado_em desc limit $${params.length - 1} offset $${params.length}`, params);
    const resumo = summary.rows[0] || { total: 0, valorTotal: 0, valorMedio: 0, maiorValor: 0 };
    return { content: rows, page, limit, total: resumo.total || 0, resumo };
  });

  app.get('/api/lancamentos/:numero', async (request) => {
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento');
    return getOne(numero, request.authUser!) || notFound('Lançamento não encontrado.');
  });

  app.post('/api/lancamentos', async (request, reply) => {
    const user = request.authUser!;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const data = await validateAccess(client, user, (request.body || {}) as Record<string, unknown>);
      const inserted = await client.query(
        `insert into lancamentos (colaborador_id,data_pagamento,sede_id,centro_custo_id,grupo_conta_id,conta_id,observacao,valor)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning numero_lancamento`,
        [user.id, data.dataPagamento, data.sedeId, data.centroCustoId, data.grupoContaId, data.contaId, data.observacao, data.valor],
      );
      const numero = inserted.rows[0].numero_lancamento as number;
      const created = await getOne(numero, user, client);
      await audit(client, user, numero, 'INSERCAO', null, created);
      await client.query('commit');
      reply.status(201);
      return created;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.put('/api/lancamentos/:numero', async (request) => {
    const user = request.authUser!;
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const before = await getOne(numero, user, client);
      if (!before) notFound('Lançamento não encontrado ou sem acesso.');
      const data = await validateAccess(client, user, (request.body || {}) as Record<string, unknown>);
      await client.query(
        `update lancamentos set data_pagamento=$1,sede_id=$2,centro_custo_id=$3,grupo_conta_id=$4,conta_id=$5,
         observacao=$6,valor=$7,atualizado_em=now() where numero_lancamento=$8`,
        [data.dataPagamento, data.sedeId, data.centroCustoId, data.grupoContaId, data.contaId, data.observacao, data.valor, numero],
      );
      const after = await getOne(numero, user, client);
      const diff = changes(before!, after!);
      if (Object.keys(diff).length) await audit(client, user, numero, 'EDICAO', before, after, diff);
      await client.query('commit');
      return after;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.delete('/api/lancamentos/:numero', async (request, reply) => {
    const user = request.authUser!;
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const before = await getOne(numero, user, client);
      if (!before) notFound('Lançamento não encontrado ou sem acesso.');
      await client.query('update lancamentos set excluido_em=now(), excluido_por=$1, atualizado_em=now() where numero_lancamento=$2', [user.id, numero]);
      await audit(client, user, numero, 'EXCLUSAO', before, null);
      await client.query('commit');
      reply.status(204).send();
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
}
