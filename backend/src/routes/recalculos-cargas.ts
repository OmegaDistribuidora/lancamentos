import type { FastifyInstance } from 'fastify';
import { isAdmin } from '../auth.js';
import { pool } from '../db/pool.js';
import { badRequest, forbidden, HttpError, positiveId } from '../http.js';
import type { AuthUser } from '../types.js';
import { fetchCarga } from './cargas.js';

type RecalculationResult = {
  updated: boolean;
  saleBefore: number;
  saleAfter: number;
  costBefore: number;
  costAfter: number;
  grossProfitBefore: number;
  grossProfitAfter: number;
  netProfitBefore: number;
  netProfitAfter: number;
};

const JOB_SELECT = `select id,competencia::text,status,total_cargas as "totalCargas",
  cargas_processadas as "cargasProcessadas",cargas_atualizadas as "cargasAtualizadas",
  cargas_sem_alteracao as "cargasSemAlteracao",cargas_com_erro as "cargasComErro",
  usuario_nome as "usuarioNome",resumo,erro,iniciado_em as "iniciadoEm",concluido_em as "concluidoEm"
  from recalculos_cargas`;

function currentMonthFortaleza(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}`;
}

function closedCompetence(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) badRequest('Competência inválida.');
  if (raw >= currentMonthFortaleza()) badRequest('Selecione um mês já encerrado.');
  return `${raw}-01`;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number): number { return Math.round(value * 100) / 100; }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function financialSnapshot(summary: Record<string, unknown>, netProfit: number) {
  const totals = (summary.totais || {}) as Record<string, unknown>;
  return {
    vendaWinThor: rounded(number(totals.valor)),
    custoWinThor: rounded(number(totals.custo)),
    lucroBruto: rounded(number(totals.lucro)),
    lucroLiquido: rounded(netProfit),
    itensWinThor: number(totals.itens),
  };
}

function diff(before: Record<string, number>, after: Record<string, number>, snapshotChanged: boolean) {
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) changes[key] = { de: before[key], para: after[key] };
  }
  if (snapshotChanged && !Object.keys(changes).length) changes.dadosWinThor = { de: 'Retrato anterior', para: 'Retrato atualizado' };
  return changes;
}

async function fetchFreshCargo(numeroCarga: number, details: boolean) {
  try {
    return await fetchCarga(numeroCarga, details, true);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    return fetchCarga(numeroCarga, details, true);
  }
}

async function recalculateOne(numeroLancamento: number, numeroCarga: number, user: AuthUser): Promise<RecalculationResult> {
  const [summary, details] = await Promise.all([
    fetchFreshCargo(numeroCarga, false),
    fetchFreshCargo(numeroCarga, true),
  ]);
  const currentTotals = (summary.totais || {}) as Record<string, unknown>;
  const grossProfit = Number(currentTotals.lucro);
  if (!Number.isFinite(grossProfit)) throw new Error('O WinThor não retornou um lucro válido.');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await client.query(`select numero_lancamento_carga,resumo_carga,detalhes_carga,total_despesas::float8 as "totalDespesas",
      lucro_carga::float8 as "lucroCarga",lucro_final::float8 as "lucroFinal"
      from lancamentos_cargas where numero_lancamento_carga=$1 and excluido_em is null for update`, [numeroLancamento]);
    if (!locked.rowCount) throw new Error('Lançamento removido durante o recálculo.');
    const row = locked.rows[0] as Record<string, unknown>;
    const oldSummary = row.resumo_carga as Record<string, unknown>;
    const oldDetails = row.detalhes_carga as Record<string, unknown>;
    const netProfit = rounded(grossProfit - number(row.totalDespesas));
    const snapshotChanged = canonical(oldSummary) !== canonical(summary) || canonical(oldDetails) !== canonical(details);
    const valuesChanged = rounded(number(row.lucroCarga)) !== rounded(grossProfit) || rounded(number(row.lucroFinal)) !== netProfit;
    const oldFinancial = financialSnapshot(oldSummary, number(row.lucroFinal));
    const newFinancial = financialSnapshot(summary, netProfit);

    if (snapshotChanged || valuesChanged) {
      await client.query(`update lancamentos_cargas set resumo_carga=$1::jsonb,detalhes_carga=$2::jsonb,
        lucro_carga=$3,lucro_final=$4,atualizado_em=now() where numero_lancamento_carga=$5`,
      [JSON.stringify(summary),JSON.stringify(details),rounded(grossProfit),netProfit,numeroLancamento]);
      await client.query(`insert into auditoria_lancamentos_cargas
        (numero_lancamento_carga,acao,usuario_id,usuario_nome,dados_anteriores,dados_novos,alteracoes)
        values($1,'EDICAO',$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
      [numeroLancamento,user.id,user.nomeExibicao,JSON.stringify(oldFinancial),JSON.stringify(newFinancial),JSON.stringify(diff(oldFinancial,newFinancial,snapshotChanged))]);
    }
    await client.query('commit');
    return {
      updated: snapshotChanged || valuesChanged,
      saleBefore: oldFinancial.vendaWinThor, saleAfter: newFinancial.vendaWinThor,
      costBefore: oldFinancial.custoWinThor, costAfter: newFinancial.custoWinThor,
      grossProfitBefore: oldFinancial.lucroBruto, grossProfitAfter: newFinancial.lucroBruto,
      netProfitBefore: oldFinancial.lucroLiquido, netProfitAfter: newFinancial.lucroLiquido,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

async function runRecalculation(jobId: number, competence: string, user: AuthUser): Promise<void> {
  const summary = {
    vendaAntes: 0, vendaDepois: 0, custoAntes: 0, custoDepois: 0,
    lucroBrutoAntes: 0, lucroBrutoDepois: 0, lucroLiquidoAntes: 0, lucroLiquidoDepois: 0,
    erros: [] as Array<{ numeroCarga: number; mensagem: string }>,
  };
  try {
    const loads = await pool.query(`select numero_lancamento_carga::int as "numeroLancamento",numero_carga::int as "numeroCarga"
      from lancamentos_cargas where excluido_em is null and data_lancamento >= $1::date
      and data_lancamento < ($1::date + interval '1 month') order by numero_lancamento_carga`, [competence]);
    await pool.query(`update recalculos_cargas set total_cargas=$1 where id=$2`, [loads.rowCount || 0,jobId]);
    let next = 0;
    const workers = Array.from({ length: Math.min(2, loads.rowCount || 0) }, async () => {
      while (true) {
        const index = next++;
        if (index >= loads.rows.length) return;
        const load = loads.rows[index] as { numeroLancamento: number; numeroCarga: number };
        let updated = false;
        let failed = false;
        try {
          const result = await recalculateOne(load.numeroLancamento,load.numeroCarga,user);
          updated = result.updated;
          summary.vendaAntes += result.saleBefore; summary.vendaDepois += result.saleAfter;
          summary.custoAntes += result.costBefore; summary.custoDepois += result.costAfter;
          summary.lucroBrutoAntes += result.grossProfitBefore; summary.lucroBrutoDepois += result.grossProfitAfter;
          summary.lucroLiquidoAntes += result.netProfitBefore; summary.lucroLiquidoDepois += result.netProfitAfter;
        } catch (error) {
          failed = true;
          summary.erros.push({ numeroCarga: load.numeroCarga, mensagem: error instanceof Error ? error.message : 'Erro desconhecido.' });
        }
        await pool.query(`update recalculos_cargas set cargas_processadas=cargas_processadas+1,
          cargas_atualizadas=cargas_atualizadas+$1,cargas_sem_alteracao=cargas_sem_alteracao+$2,
          cargas_com_erro=cargas_com_erro+$3 where id=$4`,
        [updated ? 1 : 0,!updated && !failed ? 1 : 0,failed ? 1 : 0,jobId]);
      }
    });
    await Promise.all(workers);
    const totals = Object.fromEntries(Object.entries(summary).map(([key,value]) => [key,Array.isArray(value) ? value : rounded(value)]));
    const status = summary.erros.length ? 'CONCLUIDO_COM_ERROS' : 'CONCLUIDO';
    await pool.query(`update recalculos_cargas set status=$1,resumo=$2::jsonb,concluido_em=now() where id=$3`, [status,JSON.stringify(totals),jobId]);
  } catch (error) {
    await pool.query(`update recalculos_cargas set status='FALHOU',erro=$1,resumo=$2::jsonb,concluido_em=now() where id=$3`,
      [error instanceof Error ? error.message : 'Erro desconhecido.',JSON.stringify(summary),jobId]);
  }
}

export async function registerCargoRecalculationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/recalculos-cargas', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden('Apenas o Admin pode recalcular cargas.');
    const { rows } = await pool.query(`${JOB_SELECT} order by iniciado_em desc limit 12`);
    return { atual: rows.find((item) => item.status === 'PROCESSANDO') || null, historico: rows };
  });

  app.get('/api/admin/recalculos-cargas/:id', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden('Apenas o Admin pode recalcular cargas.');
    const id = positiveId((request.params as { id: string }).id,'Recálculo');
    const { rows } = await pool.query(`${JOB_SELECT} where id=$1`, [id]);
    if (!rows[0]) throw new HttpError(404,'Recálculo não encontrado.');
    return rows[0];
  });

  app.post('/api/admin/recalculos-cargas', async (request, reply) => {
    const user = request.authUser!;
    if (!isAdmin(user)) forbidden('Apenas o Admin pode recalcular cargas.');
    const competence = closedCompetence((request.body as { competencia?: unknown } | undefined)?.competencia);
    await pool.query(`update recalculos_cargas set status='FALHOU',erro='Processamento interrompido antes da conclusão.',concluido_em=now()
      where status='PROCESSANDO' and iniciado_em < now() - interval '2 hours'`);
    let inserted;
    try {
      inserted = await pool.query(`insert into recalculos_cargas (competencia,status,usuario_id,usuario_nome)
        values($1,'PROCESSANDO',$2,$3) returning id::int`, [competence,user.id,user.nomeExibicao]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new HttpError(409,'Já existe um recálculo de cargas em andamento.');
      throw error;
    }
    const jobId = Number(inserted.rows[0].id);
    setImmediate(() => { void runRecalculation(jobId,competence,user); });
    reply.status(202);
    return { id: jobId, competencia: competence, status: 'PROCESSANDO' };
  });
}
