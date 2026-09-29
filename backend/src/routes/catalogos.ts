import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { isAdmin, isPrivileged } from '../auth.js';
import { badRequest, forbidden, positiveId, text } from '../http.js';

function competenciaAtual(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}`;
}

function competencia(value: unknown): string {
  const raw = String(value || competenciaAtual());
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) badRequest('Competência inválida.');
  return `${raw}-01`;
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/catalogos', async (request) => {
    const user = request.authUser!;
    const admin = isAdmin(user);
    const [sedes, centros, grupos, contas, colaboradores] = await Promise.all([
      admin
        ? pool.query(`select id, nome from sedes where ativo order by nome`)
        : pool.query(`select s.id, s.nome from sedes s join usuario_sedes us on us.sede_id=s.id where us.usuario_id=$1 and s.ativo order by s.nome`, [user.id]),
      admin
        ? pool.query(`select id, nome, sede_id as "sedeId" from centros_custo where ativo order by sede_id, nome`)
        : pool.query(`
            select c.id, c.nome, c.sede_id as "sedeId"
            from centros_custo c
            join usuario_centros_custo uc on uc.centro_custo_id=c.id
            join usuario_sedes us on us.sede_id=c.sede_id and us.usuario_id=uc.usuario_id
            where uc.usuario_id=$1 and c.ativo order by c.sede_id, c.nome
          `, [user.id]),
      pool.query(`select id, codigo, nome, cor from grupos_contas where ativo order by codigo`),
      pool.query(`select id, codigo, grupo_conta_id as "grupoContaId", nome from contas where ativo order by codigo`),
      isPrivileged(user)
        ? pool.query(`select id, nome_exibicao as nome from usuarios where ativo order by nome_exibicao`)
        : Promise.resolve({ rows: [{ id: user.id, nome: user.nomeExibicao }] }),
    ]);
    return { sedes: sedes.rows, centrosCusto: centros.rows, gruposContas: grupos.rows, contas: contas.rows, colaboradores: colaboradores.rows };
  });

  app.get('/api/orcamentos', async (request) => {
    if (!isPrivileged(request.authUser!)) forbidden('Orçamentos disponíveis apenas para perfis gestores.');
    const query = request.query as Record<string, string | undefined>;
    const month = competencia(query.competencia);
    const sedes = await pool.query(`select id,nome from sedes where ativo order by nome`);
    const defaultSede = sedes.rows.find((item) => item.nome === 'Ômega Matriz') || sedes.rows[0];
    const sedeId = query.sedeId ? positiveId(query.sedeId, 'Sede') : Number(defaultSede?.id);
    if (!sedeId || !sedes.rows.some((item) => Number(item.id) === sedeId)) badRequest('Sede não encontrada.');
    const [grupos, contas] = await Promise.all([
      pool.query(`
        select g.id,g.codigo,g.nome,g.cor,count(c.id)::int as "quantidadeContas",
          coalesce(sum(coalesce(o.valor,100)) filter(where c.ativo),0)::float8 as orcamento
        from grupos_contas g
        left join contas c on c.grupo_conta_id=g.id and c.ativo
        left join lateral (
          select historico.valor
          from orcamentos_contas historico
          where historico.conta_id=c.id and historico.sede_id=$1 and historico.competencia <= $2::date
          order by historico.competencia desc limit 1
        ) o on true
        where g.ativo group by g.id order by g.codigo`, [sedeId, month]),
      pool.query(`
        select c.id,c.codigo,c.nome,c.grupo_conta_id as "grupoContaId",g.nome as "grupoConta",
          coalesce(o.valor,100)::float8 as orcamento,
          to_char(o.competencia,'YYYY-MM') as "competenciaOrigem",
          (o.competencia=$2::date) as "definidoNaCompetencia"
        from contas c join grupos_contas g on g.id=c.grupo_conta_id
        left join lateral (
          select historico.valor,historico.competencia
          from orcamentos_contas historico
          where historico.conta_id=c.id and historico.sede_id=$1 and historico.competencia <= $2::date
          order by historico.competencia desc limit 1
        ) o on true
        where c.ativo order by g.codigo,c.codigo`, [sedeId, month]),
    ]);
    return { gruposContas: grupos.rows, contas: contas.rows, sedes: sedes.rows, sedeId, competencia: month.slice(0, 7) };
  });

  app.get('/api/admin/catalogos', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const [sedes, centros, grupos, contas] = await Promise.all([
      pool.query('select id, nome, ativo from sedes where ativo order by nome'),
      pool.query('select id, nome, sede_id as "sedeId", ativo from centros_custo order by sede_id, nome'),
      pool.query(`select g.id, g.codigo, g.nome, g.cor, g.ativo, coalesce(sum(c.orcamento) filter(where c.ativo),0)::float8 as orcamento
        from grupos_contas g left join contas c on c.grupo_conta_id=g.id where g.codigo is not null group by g.id order by g.codigo`),
      pool.query('select c.id, c.codigo, c.nome, c.grupo_conta_id as "grupoContaId", g.nome as "grupoConta", c.orcamento::float8 as orcamento, c.ativo from contas c join grupos_contas g on g.id=c.grupo_conta_id where c.codigo is not null order by g.codigo,c.codigo'),
    ]);
    return { sedes: sedes.rows, centrosCusto: centros.rows, gruposContas: grupos.rows, contas: contas.rows };
  });

  app.post('/api/admin/catalogos/:tipo', async (request, reply) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const tipo = (request.params as { tipo: string }).tipo;
    const body = (request.body || {}) as Record<string, unknown>;
    const nome = text(body.nome, 'Nome', 180);
    let result;
    if (tipo === 'sedes') forbidden('As sedes são fixas e não podem ser alteradas.');
    else if (tipo === 'centros-custo') forbidden('Os centros de custo são fixos e não podem ser alterados.');
    else if (tipo === 'grupos-contas' || tipo === 'contas') forbidden('Grupos e contas são fixos e sincronizados da base filial.');
    else badRequest('Tipo de cadastro inválido.');
    reply.status(201);
    return result!.rows[0];
  });

  app.put('/api/admin/catalogos/:tipo/:id/status', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const { tipo, id: rawId } = request.params as { tipo: string; id: string };
    const id = positiveId(rawId, 'Cadastro');
    const ativo = (request.body as { ativo?: unknown } | undefined)?.ativo;
    if (typeof ativo !== 'boolean') badRequest('Status inválido.');
    if (tipo === 'sedes' || tipo === 'centros-custo' || tipo === 'grupos-contas' || tipo === 'contas') forbidden('Este catálogo é fixo e não pode ser alterado.');
    const tables: Record<string, string> = {};
    const table = tables[tipo];
    if (!table) badRequest('Tipo de cadastro inválido.');
    await pool.query(`update ${table} set ativo=$1 where id=$2`, [ativo, id]);
    return { id, ativo };
  });

  app.put('/api/orcamentos/contas/:id', async (request) => {
    if (!isPrivileged(request.authUser!)) forbidden('Orçamentos disponíveis apenas para perfis gestores.');
    const id = positiveId((request.params as { id: string }).id, 'Conta');
    const body = request.body as { orcamento?: unknown; sedeId?: unknown; competencia?: unknown } | undefined;
    const raw = body?.orcamento;
    const orcamento = Number(raw);
    if (!Number.isFinite(orcamento) || orcamento < 0 || orcamento > 999999999999.99) badRequest('Orçamento inválido.');
    const sedeId = positiveId(body?.sedeId, 'Sede');
    const month = competencia(body?.competencia);
    const result = await pool.query(`
      insert into orcamentos_contas (conta_id,sede_id,competencia,valor,atualizado_por)
      select c.id,s.id,$1::date,$2,$3 from contas c cross join sedes s
      where c.id=$4 and c.ativo and s.id=$5 and s.ativo
      on conflict (conta_id,sede_id,competencia) do update
      set valor=excluded.valor, atualizado_por=excluded.atualizado_por, atualizado_em=now()
      returning conta_id as id,valor::float8 as orcamento`,
    [month, Math.round(orcamento * 100) / 100, request.authUser!.id, id, sedeId]);
    if (!result.rowCount) badRequest('Conta não encontrada.');
    return result.rows[0];
  });
}
