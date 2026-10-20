import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { canAccessCargoExpenses, isAdmin, isPrivileged } from '../auth.js';
import { badRequest, dateOnly, forbidden, money, notFound, optionalText, positiveId } from '../http.js';
import type { AuthUser } from '../types.js';
import { fetchCarga } from './cargas.js';

function hojeFortaleza(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const SELECT = `
  select l.numero_lancamento as "numeroLancamento", l.data_lancamento::text as "dataLancamento",
    to_char(l.hora_lancamento, 'HH24:MI') as hora, u.nome_exibicao as colaborador,
    l.colaborador_id as "colaboradorId", l.data_pagamento::text as "dataPagamento",
    s.id as "sedeId", s.nome as sede, cc.id as "centroCustoId", cc.nome as "centroCusto",
    gc.id as "grupoContaId", gc.nome as "grupoConta", gc.cor as "grupoCor",
    c.id as "contaId", c.nome as conta, l.observacao, l.valor::float8 as valor,
    (dc.numero_lancamento is not null) as "despesaCarga", dc.numero_carga as "numeroCarga",
    l.criado_em as "criadoEm", l.atualizado_em as "atualizadoEm"
  from lancamentos l
  join usuarios u on u.id=l.colaborador_id join sedes s on s.id=l.sede_id
  join centros_custo cc on cc.id=l.centro_custo_id join grupos_contas gc on gc.id=l.grupo_conta_id
  join contas c on c.id=l.conta_id
  left join despesas_cargas dc on dc.numero_lancamento=l.numero_lancamento`;

const CARGO_ADDITIONAL_FIELDS = [
  'salarioFuncionarios', 'diariasMotoristas', 'diariasAjudantes', 'descarrego', 'avarias',
  'alimentacao', 'ajudanteExtra', 'manutencaoVeiculo', 'outros',
] as const;

type CargoCosts = {
  kmPorLitro: number; valorCombustivel: number; kmInicial: number; kmFinal: number;
  totalPercorrido: number; despesaCombustivel: number; totalDespesas: number;
  lucroCarga: number; lucroFinal: number;
} & Record<(typeof CARGO_ADDITIONAL_FIELDS)[number], number>;

function decimal(value: unknown, field: string, positive = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0) || parsed > 999999999999.99) badRequest(`${field} invalido.`);
  return Math.round(parsed * 1000) / 1000;
}

function cargoCosts(payload: Record<string, unknown>, lucroCarga: number): CargoCosts {
  const kmPorLitro = decimal(payload.kmPorLitro, 'Km/L', true);
  const valorCombustivel = decimal(payload.valorCombustivel, 'Valor do combustivel');
  const kmInicial = decimal(payload.kmInicial, 'Km inicial');
  const kmFinal = decimal(payload.kmFinal, 'Km final');
  if (kmFinal < kmInicial) badRequest('Km final nao pode ser menor que o Km inicial.');
  const adicionais = Object.fromEntries(CARGO_ADDITIONAL_FIELDS.map((field) => [field, decimal(payload[field] ?? 0, field)])) as Record<(typeof CARGO_ADDITIONAL_FIELDS)[number], number>;
  const totalPercorrido = Math.round((kmFinal - kmInicial) * 100) / 100;
  const despesaCombustivel = Math.round(((totalPercorrido / kmPorLitro) * valorCombustivel) * 100) / 100;
  const totalDespesas = Math.round((despesaCombustivel + Object.values(adicionais).reduce((sum, value) => sum + value, 0)) * 100) / 100;
  if (totalDespesas <= 0) badRequest('O total das despesas deve ser maior que zero.');
  return {
    kmPorLitro, valorCombustivel, kmInicial, kmFinal, totalPercorrido, despesaCombustivel,
    ...adicionais, totalDespesas, lucroCarga: Math.round(lucroCarga * 100) / 100,
    lucroFinal: Math.round((lucroCarga - totalDespesas) * 100) / 100,
  } as CargoCosts;
}

async function validateCargoAccess(client: PoolClient, user: AuthUser, payload: Record<string, unknown>) {
  const dataPagamento = dateOnly(payload.dataPagamento, 'Data de pagamento');
  if (dataPagamento > hojeFortaleza()) badRequest('A data de pagamento nao pode ser futura.');
  const sedeId = positiveId(payload.sedeId, 'Sede');
  const result = await client.query(`
    select s.id as "sedeId", cc.id as "centroCustoId", g.id as "grupoContaId", c.id as "contaId",
      exists(select 1 from usuario_sedes where usuario_id=$1 and sede_id=s.id) as "sedePermitida"
    from sedes s
    join centros_custo cc on cc.sede_id=s.id and cc.uso_exclusivo_carga and cc.ativo
    join grupos_contas g on g.catalogo=s.catalogo_contas and g.uso_exclusivo_carga and g.ativo
    join contas c on c.catalogo=s.catalogo_contas and c.grupo_conta_id=g.id and c.uso_exclusivo_carga and c.ativo
    where s.id=$2 and s.ativo limit 1
  `, [user.id, sedeId]);
  const row = result.rows[0];
  if (!row) badRequest('Sede ou conta exclusiva de despesas de carga nao encontrada.');
  if (!isAdmin(user) && !row.sedePermitida) badRequest('A sede nao esta liberada para este usuario.');
  return { dataPagamento, sedeId, centroCustoId: Number(row.centroCustoId), grupoContaId: Number(row.grupoContaId), contaId: Number(row.contaId), observacao: optionalText(payload.observacao) };
}

async function getCargoExpense(numero: number, user: AuthUser, client: PoolClient | typeof pool = pool) {
  const params: unknown[] = [numero];
  const ownership = isPrivileged(user) ? '' : 'and l.colaborador_id=$2';
  if (!isPrivileged(user)) params.push(user.id);
  const { rows } = await client.query(`
    select dc.numero_carga as "numeroCarga", dc.km_por_litro::float8 as "kmPorLitro",
      dc.valor_combustivel::float8 as "valorCombustivel", dc.km_inicial::float8 as "kmInicial",
      dc.km_final::float8 as "kmFinal", dc.total_percorrido::float8 as "totalPercorrido",
      dc.despesa_combustivel::float8 as "despesaCombustivel",
      dc.salario_funcionarios::float8 as "salarioFuncionarios", dc.diarias_motoristas::float8 as "diariasMotoristas",
      dc.diarias_ajudantes::float8 as "diariasAjudantes", dc.descarrego::float8 as descarrego,
      dc.avarias::float8 as avarias, dc.alimentacao::float8 as alimentacao,
      dc.ajudante_extra::float8 as "ajudanteExtra", dc.manutencao_veiculo::float8 as "manutencaoVeiculo",
      dc.outros::float8 as outros, dc.total_despesas::float8 as "totalDespesas",
      dc.lucro_carga::float8 as "lucroCarga", dc.lucro_final::float8 as "lucroFinal",
      dc.resumo_carga as "resumoCarga", dc.detalhes_carga as "detalhesCarga"
    from despesas_cargas dc join lancamentos l on l.numero_lancamento=dc.numero_lancamento
    where dc.numero_lancamento=$1 and l.excluido_em is null ${ownership}
  `, params);
  return rows[0] as Record<string, unknown> | undefined;
}

function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const result: Record<string, { de: unknown; para: unknown }> = {};
  for (const key of ['dataPagamento', 'sedeId', 'centroCustoId', 'grupoContaId', 'contaId', 'observacao', 'valor']) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) result[key] = { de: before[key], para: after[key] };
  }
  return result;
}

function cargoChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const result: Record<string, { de: unknown; para: unknown }> = {};
  const fields = [
    'dataPagamento', 'sedeId', 'centroCustoId', 'observacao', 'valor', 'kmPorLitro', 'valorCombustivel',
    'kmInicial', 'kmFinal', 'totalPercorrido', 'despesaCombustivel', ...CARGO_ADDITIONAL_FIELDS,
    'totalDespesas', 'lucroFinal',
  ];
  for (const key of fields) {
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
  if (dataPagamento > hojeFortaleza()) badRequest('A data de pagamento não pode ser futura.');
  const sedeId = positiveId(payload.sedeId, 'Sede');
  const centroCustoId = positiveId(payload.centroCustoId, 'Centro de custo');
  const grupoContaId = positiveId(payload.grupoContaId, 'Grupo de contas');
  const contaId = positiveId(payload.contaId, 'Conta');
  const allowed = await client.query(
    `select
      exists(select 1 from usuario_sedes where usuario_id=$1 and sede_id=$2) as sede,
      exists(select 1 from sedes where id=$2 and ativo) as "sedeExiste",
      exists(select 1 from centros_custo where id=$3 and sede_id=$2 and ativo and not uso_exclusivo_carga) as "centroDaSede",
      exists(select 1 from usuario_centros_custo where usuario_id=$1 and centro_custo_id=$3) as "centroPermitido",
      exists(
        select 1 from contas c
        join grupos_contas g on g.id=c.grupo_conta_id and g.catalogo=c.catalogo
        join sedes s on s.id=$2 and s.catalogo_contas=c.catalogo
        where c.id=$4 and c.grupo_conta_id=$5 and c.ativo and c.presente_origem and not c.uso_exclusivo_carga
          and g.ativo and g.presente_origem and not g.uso_exclusivo_carga
      ) as conta`,
    [user.id, sedeId, centroCustoId, contaId, grupoContaId],
  );
  if (!allowed.rows[0]?.sedeExiste) badRequest('A sede selecionada não existe ou está inativa.');
  if (!isAdmin(user) && !allowed.rows[0]?.sede) badRequest('A sede não está liberada para este usuário.');
  if (!allowed.rows[0]?.centroDaSede) badRequest('O centro de custo não pertence à sede selecionada.');
  if (!isAdmin(user) && !allowed.rows[0]?.centroPermitido) badRequest('O centro de custo não está liberado para este usuário.');
  if (!allowed.rows[0]?.conta) badRequest('A conta e o grupo selecionados não pertencem ao catálogo desta sede.');
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
    if (q.contaIds) {
      const contaIds = [...new Set(q.contaIds.split(',').filter(Boolean).map((item) => positiveId(item, 'Conta')))];
      if (contaIds.length > 257) badRequest('Quantidade de contas inválida.');
      if (contaIds.length) { params.push(contaIds); where.push(`l.conta_id=any($${params.length}::bigint[])`); }
    }
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

  app.get('/api/lancamentos/:numero/carga', async (request) => {
    const user = request.authUser!;
    if (!canAccessCargoExpenses(user) && !isPrivileged(user)) forbidden('Seu perfil não possui acesso a despesas de carga.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento');
    const lancamento = await getOne(numero, user);
    if (!lancamento) notFound('Lançamento não encontrado ou sem acesso.');
    const despesaCarga = await getCargoExpense(numero, user);
    if (!despesaCarga) notFound('Este lançamento não é uma despesa de carga.');
    return { lancamento, despesaCarga };
  });

  app.post('/api/lancamentos/carga/:numeroCarga', async (request, reply) => {
    const user = request.authUser!;
    if (!canAccessCargoExpenses(user)) forbidden('Seu perfil não possui acesso a despesas de carga.');
    const numeroCarga = positiveId((request.params as { numeroCarga: string }).numeroCarga, 'Número da carga');
    const payload = (request.body || {}) as Record<string, unknown>;
    const existing = await pool.query(`
      select l.numero_lancamento from despesas_cargas dc join lancamentos l on l.numero_lancamento=dc.numero_lancamento
      where dc.numero_carga=$1 and l.excluido_em is null limit 1
    `, [numeroCarga]);
    if (existing.rowCount) badRequest(`A carga ${numeroCarga} já possui uma despesa no lançamento #${existing.rows[0].numero_lancamento}.`);
    const [resumoCarga, detalhesCarga] = await Promise.all([fetchCarga(numeroCarga), fetchCarga(numeroCarga, true)]);
    const lucroCarga = Number((resumoCarga.totais as Record<string, unknown> | undefined)?.lucro);
    if (!Number.isFinite(lucroCarga)) badRequest('O lucro da carga não foi retornado pelo WinThor.');
    const costs = cargoCosts(payload, lucroCarga);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const access = await validateCargoAccess(client, user, payload);
      const duplicate = await client.query(`
        select l.numero_lancamento from despesas_cargas dc join lancamentos l on l.numero_lancamento=dc.numero_lancamento
        where dc.numero_carga=$1 and l.excluido_em is null limit 1
      `, [numeroCarga]);
      if (duplicate.rowCount) badRequest(`A carga ${numeroCarga} já possui uma despesa no lançamento #${duplicate.rows[0].numero_lancamento}.`);
      const inserted = await client.query(
        `insert into lancamentos (colaborador_id,data_pagamento,sede_id,centro_custo_id,grupo_conta_id,conta_id,observacao,valor)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning numero_lancamento`,
        [user.id, access.dataPagamento, access.sedeId, access.centroCustoId, access.grupoContaId, access.contaId, access.observacao, costs.totalDespesas],
      );
      const numero = Number(inserted.rows[0].numero_lancamento);
      await client.query(`
        insert into despesas_cargas (
          numero_lancamento,numero_carga,km_por_litro,valor_combustivel,km_inicial,km_final,total_percorrido,despesa_combustivel,
          salario_funcionarios,diarias_motoristas,diarias_ajudantes,descarrego,avarias,alimentacao,ajudante_extra,manutencao_veiculo,
          outros,total_despesas,lucro_carga,lucro_final,resumo_carga,detalhes_carga
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb)
      `, [
        numero, numeroCarga, costs.kmPorLitro, costs.valorCombustivel, costs.kmInicial, costs.kmFinal,
        costs.totalPercorrido, costs.despesaCombustivel, costs.salarioFuncionarios, costs.diariasMotoristas,
        costs.diariasAjudantes, costs.descarrego, costs.avarias, costs.alimentacao, costs.ajudanteExtra,
        costs.manutencaoVeiculo, costs.outros, costs.totalDespesas, costs.lucroCarga, costs.lucroFinal,
        JSON.stringify(resumoCarga), JSON.stringify(detalhesCarga),
      ]);
      const created = await getOne(numero, user, client);
      await audit(client, user, numero, 'INSERCAO', null, { ...created, ...costs, numeroCarga });
      await client.query('commit');
      reply.status(201);
      return { lancamento: created, despesaCarga: await getCargoExpense(numero, user) };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.put('/api/lancamentos/:numero/carga', async (request) => {
    const user = request.authUser!;
    if (!canAccessCargoExpenses(user) && !isPrivileged(user)) forbidden('Seu perfil não possui acesso a despesas de carga.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Lançamento');
    const payload = (request.body || {}) as Record<string, unknown>;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const beforeLaunch = await getOne(numero, user, client);
      const beforeCargo = await getCargoExpense(numero, user, client);
      if (!beforeLaunch || !beforeCargo) notFound('Despesa de carga não encontrada ou sem acesso.');
      const access = await validateCargoAccess(client, user, payload);
      const costs = cargoCosts(payload, Number(beforeCargo!.lucroCarga));
      await client.query(`
        update lancamentos set data_pagamento=$1,sede_id=$2,centro_custo_id=$3,grupo_conta_id=$4,conta_id=$5,
          observacao=$6,valor=$7,atualizado_em=now() where numero_lancamento=$8
      `, [access.dataPagamento, access.sedeId, access.centroCustoId, access.grupoContaId, access.contaId, access.observacao, costs.totalDespesas, numero]);
      await client.query(`
        update despesas_cargas set km_por_litro=$1,valor_combustivel=$2,km_inicial=$3,km_final=$4,total_percorrido=$5,
          despesa_combustivel=$6,salario_funcionarios=$7,diarias_motoristas=$8,diarias_ajudantes=$9,descarrego=$10,
          avarias=$11,alimentacao=$12,ajudante_extra=$13,manutencao_veiculo=$14,outros=$15,total_despesas=$16,
          lucro_final=$17,atualizado_em=now() where numero_lancamento=$18
      `, [
        costs.kmPorLitro, costs.valorCombustivel, costs.kmInicial, costs.kmFinal, costs.totalPercorrido,
        costs.despesaCombustivel, costs.salarioFuncionarios, costs.diariasMotoristas, costs.diariasAjudantes,
        costs.descarrego, costs.avarias, costs.alimentacao, costs.ajudanteExtra, costs.manutencaoVeiculo,
        costs.outros, costs.totalDespesas, costs.lucroFinal, numero,
      ]);
      const afterLaunch = await getOne(numero, user, client);
      const afterCargo = await getCargoExpense(numero, user, client);
      const before = { ...beforeLaunch, ...beforeCargo, resumoCarga: undefined, detalhesCarga: undefined };
      const after = { ...afterLaunch, ...afterCargo, resumoCarga: undefined, detalhesCarga: undefined };
      const diff = cargoChanges(before, after);
      if (Object.keys(diff).length) await audit(client, user, numero, 'EDICAO', before, after, diff);
      await client.query('commit');
      return { lancamento: afterLaunch, despesaCarga: afterCargo };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
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
      if (before!.despesaCarga) badRequest('Use a edição de despesa de carga para alterar este lançamento.');
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
