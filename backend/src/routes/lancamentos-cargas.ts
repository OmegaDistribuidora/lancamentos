import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { canAccessCargoExpenses, isPrivileged } from '../auth.js';
import { pool } from '../db/pool.js';
import { badRequest, dateOnly, forbidden, notFound, optionalText, positiveId } from '../http.js';
import type { AuthUser } from '../types.js';
import { fetchCarga } from './cargas.js';

const CAMPOS_ADICIONAIS = [
  'salarioFuncionarios', 'diariasMotoristas', 'diariasAjudantes', 'descarrego', 'avarias',
  'alimentacao', 'ajudanteExtra', 'manutencaoVeiculo', 'outros',
] as const;

type CustosCarga = {
  kmPorLitro: number; valorCombustivel: number; kmInicial: number; kmFinal: number;
  totalPercorrido: number; despesaCombustivel: number; totalDespesas: number;
  lucroCarga: number; lucroFinal: number;
} & Record<(typeof CAMPOS_ADICIONAIS)[number], number>;

const SELECT_LISTA = `
  select lc.numero_lancamento_carga as "numeroLancamentoCarga",lc.numero_carga as "numeroCarga",
    lc.data_lancamento::text as "dataLancamento",to_char(lc.hora_lancamento,'HH24:MI') as hora,
    lc.colaborador_id as "colaboradorId",u.nome_exibicao as colaborador,
    lc.data_pagamento::text as "dataPagamento",lc.sede_id as "sedeId",s.nome as sede,
    lc.observacao,lc.total_despesas::float8 as "totalDespesas",lc.lucro_carga::float8 as "lucroCarga",
    lc.lucro_final::float8 as "lucroFinal",lc.resumo_carga#>>'{motorista,nome}' as motorista,
    lc.resumo_carga->>'destino' as destino,
    (lc.resumo_carga#>>'{totais,valor}')::float8 as "valorVendaCarga",
    lc.criado_em as "criadoEm",lc.atualizado_em as "atualizadoEm"
  from lancamentos_cargas lc join usuarios u on u.id=lc.colaborador_id join sedes s on s.id=lc.sede_id`;

const SELECT_DETALHE = `
  select base.*,lc.km_por_litro::float8 as "kmPorLitro",lc.valor_combustivel::float8 as "valorCombustivel",
    lc.km_inicial::float8 as "kmInicial",lc.km_final::float8 as "kmFinal",lc.total_percorrido::float8 as "totalPercorrido",
    lc.despesa_combustivel::float8 as "despesaCombustivel",lc.salario_funcionarios::float8 as "salarioFuncionarios",
    lc.diarias_motoristas::float8 as "diariasMotoristas",lc.diarias_ajudantes::float8 as "diariasAjudantes",
    lc.descarrego::float8 as descarrego,lc.avarias::float8 as avarias,lc.alimentacao::float8 as alimentacao,
    lc.ajudante_extra::float8 as "ajudanteExtra",lc.manutencao_veiculo::float8 as "manutencaoVeiculo",
    lc.outros::float8 as outros,lc.resumo_carga as "resumoCarga",lc.detalhes_carga as "detalhesCarga"
  from (${SELECT_LISTA}) base join lancamentos_cargas lc on lc.numero_lancamento_carga=base."numeroLancamentoCarga"`;

function hojeFortaleza(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function decimal(value: unknown, field: string, positive = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0) || parsed > 999999999999.99) badRequest(`${field} inválido.`);
  return Math.round(parsed * 1000) / 1000;
}

function calcularCustos(payload: Record<string, unknown>, lucroCarga: number): CustosCarga {
  const kmPorLitro = decimal(payload.kmPorLitro, 'Km/L', true);
  const valorCombustivel = decimal(payload.valorCombustivel, 'Valor do combustível');
  const kmInicial = decimal(payload.kmInicial, 'Km inicial');
  const kmFinal = decimal(payload.kmFinal, 'Km final');
  if (kmFinal < kmInicial) badRequest('Km final não pode ser menor que o Km inicial.');
  const adicionais = Object.fromEntries(CAMPOS_ADICIONAIS.map((field) => [field, decimal(payload[field] ?? 0, field)])) as Record<(typeof CAMPOS_ADICIONAIS)[number], number>;
  const totalPercorrido = Math.round((kmFinal - kmInicial) * 100) / 100;
  const despesaCombustivel = Math.round(((totalPercorrido / kmPorLitro) * valorCombustivel) * 100) / 100;
  const totalDespesas = Math.round((despesaCombustivel + Object.values(adicionais).reduce((sum, value) => sum + value, 0)) * 100) / 100;
  if (totalDespesas <= 0) badRequest('O total das despesas deve ser maior que zero.');
  return { kmPorLitro, valorCombustivel, kmInicial, kmFinal, totalPercorrido, despesaCombustivel, ...adicionais,
    totalDespesas, lucroCarga: Math.round(lucroCarga * 100) / 100, lucroFinal: Math.round((lucroCarga - totalDespesas) * 100) / 100 } as CustosCarga;
}

async function validarAcessoSede(client: PoolClient, user: AuthUser, payload: Record<string, unknown>) {
  const dataPagamento = dateOnly(payload.dataPagamento, 'Data de pagamento');
  if (dataPagamento > hojeFortaleza()) badRequest('A data de pagamento não pode ser futura.');
  const sedeId = positiveId(payload.sedeId, 'Sede');
  const result = await client.query(`select s.id,exists(select 1 from usuario_sedes us where us.usuario_id=$1 and us.sede_id=s.id) as permitida from sedes s where s.id=$2 and s.ativo`, [user.id, sedeId]);
  if (!result.rowCount) badRequest('A sede selecionada não existe ou está inativa.');
  if (!isPrivileged(user) && !result.rows[0].permitida) badRequest('A sede não está liberada para este usuário.');
  return { dataPagamento, sedeId, observacao: optionalText(payload.observacao) };
}

async function obter(numero: number, user: AuthUser, client: PoolClient | typeof pool = pool) {
  const params: unknown[] = [numero];
  const ownership = isPrivileged(user) ? '' : 'and base."colaboradorId"=$2';
  if (!isPrivileged(user)) params.push(user.id);
  const { rows } = await client.query(`${SELECT_DETALHE} where lc.excluido_em is null and base."numeroLancamentoCarga"=$1 ${ownership}`, params);
  return rows[0] as Record<string, unknown> | undefined;
}

function alteracoes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const result: Record<string, { de: unknown; para: unknown }> = {};
  const fields = ['dataPagamento','sedeId','observacao','kmPorLitro','valorCombustivel','kmInicial','kmFinal','totalPercorrido','despesaCombustivel',...CAMPOS_ADICIONAIS,'totalDespesas','lucroFinal'];
  for (const key of fields) if (String(before[key] ?? '') !== String(after[key] ?? '')) result[key] = { de: before[key], para: after[key] };
  return result;
}

async function auditar(client: PoolClient, user: AuthUser, numero: number, acao: string, before: unknown, after: unknown, diff: unknown = null) {
  await client.query(`insert into auditoria_lancamentos_cargas (numero_lancamento_carga,acao,usuario_id,usuario_nome,dados_anteriores,dados_novos,alteracoes) values($1,$2,$3,$4,$5,$6,$7)`,
    [numero,acao,user.id,user.nomeExibicao,before ? JSON.stringify(before) : null,after ? JSON.stringify(after) : null,diff ? JSON.stringify(diff) : null]);
}

function exigirAcesso(user: AuthUser): void {
  if (!canAccessCargoExpenses(user)) forbidden('Seu usuário não possui acesso aos lançamentos de cargas.');
}

export async function registerCargoLaunchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lancamentos-cargas', async (request) => {
    const user = request.authUser!; exigirAcesso(user);
    const q = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page || 1));
    const limit = Math.min(5000, Math.max(1, Number(q.limit || 15)));
    const where = ['lc.excluido_em is null'];
    const params: unknown[] = [];
    if (!isPrivileged(user)) { params.push(user.id); where.push(`lc.colaborador_id=$${params.length}`); }
    if (q.inicio) { params.push(dateOnly(q.inicio, 'Data inicial')); where.push(`lc.data_pagamento >= $${params.length}`); }
    if (q.fim) { params.push(dateOnly(q.fim, 'Data final')); where.push(`lc.data_pagamento <= $${params.length}`); }
    if (q.sedeId) { params.push(positiveId(q.sedeId, 'Sede')); where.push(`lc.sede_id=$${params.length}`); }
    if (q.colaboradorId && isPrivileged(user)) { params.push(positiveId(q.colaboradorId, 'Colaborador')); where.push(`lc.colaborador_id=$${params.length}`); }
    if (q.busca?.trim()) { params.push(`%${q.busca.trim()}%`); where.push(`(lc.numero_carga::text ilike $${params.length} or lc.observacao ilike $${params.length} or lc.resumo_carga->>'destino' ilike $${params.length} or lc.resumo_carga#>>'{motorista,nome}' ilike $${params.length} or u.nome_exibicao ilike $${params.length})`); }
    const clause = where.join(' and ');
    const summary = await pool.query(`select count(*)::int as total,coalesce(sum(lc.total_despesas),0)::float8 as "valorTotal",coalesce(sum(nullif(lc.resumo_carga#>>'{totais,valor}','')::numeric),0)::float8 as "valorVendaTotal",coalesce(avg(lc.total_despesas),0)::float8 as "valorMedio",coalesce(sum(lc.lucro_final),0)::float8 as "lucroFinal" from lancamentos_cargas lc join usuarios u on u.id=lc.colaborador_id where ${clause}`, params);
    params.push(limit,(page-1)*limit);
    const rows = await pool.query(`${SELECT_LISTA} where ${clause} order by lc.criado_em desc limit $${params.length-1} offset $${params.length}`, params);
    const resumo = summary.rows[0] || { total: 0, valorTotal: 0, valorVendaTotal: 0, valorMedio: 0, lucroFinal: 0 };
    return { content: rows.rows, page, limit, total: resumo.total || 0, resumo };
  });

  app.get('/api/lancamentos-cargas/exportacao', async (request) => {
    const user = request.authUser!; exigirAcesso(user);
    const q = request.query as Record<string, string | undefined>;
    const where = ['lc.excluido_em is null'];
    const params: unknown[] = [];
    if (!isPrivileged(user)) { params.push(user.id); where.push(`base."colaboradorId"=$${params.length}`); }
    if (q.inicio) { params.push(dateOnly(q.inicio, 'Data inicial')); where.push(`base."dataPagamento"::date >= $${params.length}`); }
    if (q.fim) { params.push(dateOnly(q.fim, 'Data final')); where.push(`base."dataPagamento"::date <= $${params.length}`); }
    if (q.sedeId) { params.push(positiveId(q.sedeId, 'Sede')); where.push(`base."sedeId"=$${params.length}`); }
    if (q.colaboradorId && isPrivileged(user)) { params.push(positiveId(q.colaboradorId, 'Colaborador')); where.push(`base."colaboradorId"=$${params.length}`); }
    if (q.busca?.trim()) {
      params.push(`%${q.busca.trim()}%`);
      where.push(`(base."numeroCarga"::text ilike $${params.length} or base.observacao ilike $${params.length} or base.destino ilike $${params.length} or base.motorista ilike $${params.length} or base.colaborador ilike $${params.length})`);
    }
    const { rows } = await pool.query(`${SELECT_DETALHE} where ${where.join(' and ')} order by base."criadoEm" desc`, params);
    return { content: rows, total: rows.length };
  });

  app.get('/api/lancamentos-cargas/:numero', async (request) => {
    const user = request.authUser!; exigirAcesso(user);
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento de carga');
    return await obter(numero,user) || notFound('Lançamento de carga não encontrado.');
  });

  app.post('/api/lancamentos-cargas/carga/:numeroCarga', async (request, reply) => {
    const user = request.authUser!; exigirAcesso(user);
    const numeroCarga = positiveId((request.params as { numeroCarga: string }).numeroCarga, 'Número da carga');
    const payload = (request.body || {}) as Record<string, unknown>;
    const duplicate = await pool.query(`select numero_lancamento_carga from lancamentos_cargas where numero_carga=$1 and excluido_em is null limit 1`, [numeroCarga]);
    if (duplicate.rowCount) badRequest(`A carga ${numeroCarga} já possui o lançamento de carga #${duplicate.rows[0].numero_lancamento_carga}.`);
    const [resumoCarga,detalhesCarga] = await Promise.all([fetchCarga(numeroCarga),fetchCarga(numeroCarga,true)]);
    const lucroCarga = Number((resumoCarga.totais as Record<string, unknown> | undefined)?.lucro);
    if (!Number.isFinite(lucroCarga)) badRequest('O lucro da carga não foi retornado pelo WinThor.');
    const costs = calcularCustos(payload,lucroCarga);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const access = await validarAcessoSede(client,user,payload);
      const inserted = await client.query(`insert into lancamentos_cargas (numero_carga,colaborador_id,data_pagamento,sede_id,observacao,km_por_litro,valor_combustivel,km_inicial,km_final,total_percorrido,despesa_combustivel,salario_funcionarios,diarias_motoristas,diarias_ajudantes,descarrego,avarias,alimentacao,ajudante_extra,manutencao_veiculo,outros,total_despesas,lucro_carga,lucro_final,resumo_carga,detalhes_carga) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb) returning numero_lancamento_carga`,
        [numeroCarga,user.id,access.dataPagamento,access.sedeId,access.observacao,costs.kmPorLitro,costs.valorCombustivel,costs.kmInicial,costs.kmFinal,costs.totalPercorrido,costs.despesaCombustivel,costs.salarioFuncionarios,costs.diariasMotoristas,costs.diariasAjudantes,costs.descarrego,costs.avarias,costs.alimentacao,costs.ajudanteExtra,costs.manutencaoVeiculo,costs.outros,costs.totalDespesas,costs.lucroCarga,costs.lucroFinal,JSON.stringify(resumoCarga),JSON.stringify(detalhesCarga)]);
      const numero = Number(inserted.rows[0].numero_lancamento_carga);
      const created = await obter(numero,user,client);
      await auditar(client,user,numero,'INSERCAO',null,created);
      await client.query('commit'); reply.status(201); return created;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.put('/api/lancamentos-cargas/:numero', async (request) => {
    const user = request.authUser!; exigirAcesso(user);
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento de carga');
    const payload = (request.body || {}) as Record<string, unknown>;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const before = await obter(numero,user,client);
      if (!before) notFound('Lançamento de carga não encontrado ou sem acesso.');
      const access = await validarAcessoSede(client,user,payload);
      const costs = calcularCustos(payload,Number(before!.lucroCarga));
      await client.query(`update lancamentos_cargas set data_pagamento=$1,sede_id=$2,observacao=$3,km_por_litro=$4,valor_combustivel=$5,km_inicial=$6,km_final=$7,total_percorrido=$8,despesa_combustivel=$9,salario_funcionarios=$10,diarias_motoristas=$11,diarias_ajudantes=$12,descarrego=$13,avarias=$14,alimentacao=$15,ajudante_extra=$16,manutencao_veiculo=$17,outros=$18,total_despesas=$19,lucro_final=$20,atualizado_em=now() where numero_lancamento_carga=$21`,
        [access.dataPagamento,access.sedeId,access.observacao,costs.kmPorLitro,costs.valorCombustivel,costs.kmInicial,costs.kmFinal,costs.totalPercorrido,costs.despesaCombustivel,costs.salarioFuncionarios,costs.diariasMotoristas,costs.diariasAjudantes,costs.descarrego,costs.avarias,costs.alimentacao,costs.ajudanteExtra,costs.manutencaoVeiculo,costs.outros,costs.totalDespesas,costs.lucroFinal,numero]);
      const after = await obter(numero,user,client);
      const diff = alteracoes(before!,after!);
      if (Object.keys(diff).length) await auditar(client,user,numero,'EDICAO',before,after,diff);
      await client.query('commit'); return after;
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.delete('/api/lancamentos-cargas/:numero', async (request, reply) => {
    const user = request.authUser!; exigirAcesso(user);
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento de carga');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const before = await obter(numero,user,client);
      if (!before) notFound('Lançamento de carga não encontrado ou sem acesso.');
      await client.query(`update lancamentos_cargas set excluido_em=now(),excluido_por=$1,atualizado_em=now() where numero_lancamento_carga=$2`,[user.id,numero]);
      await auditar(client,user,numero,'EXCLUSAO',before,null);
      await client.query('commit'); reply.status(204).send();
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
}
