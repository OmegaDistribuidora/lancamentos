import type { FastifyInstance } from 'fastify';
import { hashPassword, isAdmin } from '../auth.js';
import { pool } from '../db/pool.js';
import { badRequest, forbidden, positiveId, text } from '../http.js';
import type { Perfil } from '../types.js';

const PROFILES: Perfil[] = ['ADMIN', 'GERENTE_ADMINISTRATIVO', 'DIRETORIA', 'USUARIO'];

function loginValue(value: unknown): string {
  const login = text(value, 'Login', 100).toLowerCase();
  if (!/^[a-z0-9._-]{2,100}$/.test(login)) badRequest('Login deve usar apenas letras, números, ponto, hífen ou underline.');
  return login;
}

function profileValue(value: unknown): Perfil {
  if (!PROFILES.includes(value as Perfil)) badRequest('Perfil inválido.');
  return value as Perfil;
}

function ids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => positiveId(item, 'Permissão')))];
}

async function saveAccess(client: import('pg').PoolClient, userId: number, sedes: number[], centros: number[]) {
  const valid = await client.query(`
    select
      (select count(*)::int from sedes where id=any($1::bigint[]) and ativo) as sedes,
      (select count(*)::int from centros_custo where id=any($2::bigint[]) and sede_id=any($1::bigint[]) and ativo) as centros
  `, [sedes, centros]);
  if (Number(valid.rows[0]?.sedes) !== sedes.length) badRequest('Uma das sedes selecionadas não existe ou está inativa.');
  if (Number(valid.rows[0]?.centros) !== centros.length) badRequest('Cada centro de custo selecionado deve pertencer a uma das sedes liberadas.');
  await client.query('delete from usuario_sedes where usuario_id=$1', [userId]);
  await client.query('delete from usuario_centros_custo where usuario_id=$1', [userId]);
  for (const id of sedes) await client.query('insert into usuario_sedes (usuario_id,sede_id) values ($1,$2)', [userId, id]);
  for (const id of centros) await client.query('insert into usuario_centros_custo (usuario_id,centro_custo_id) values ($1,$2)', [userId, id]);
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/usuarios', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const { rows } = await pool.query(`
      select u.id,u.nome_exibicao as "nomeExibicao",u.login,u.perfil,u.ativo,
        coalesce(array_agg(distinct us.sede_id) filter(where us.sede_id is not null),'{}') as "sedeIds",
        coalesce(array_agg(distinct uc.centro_custo_id) filter(where uc.centro_custo_id is not null),'{}') as "centroCustoIds"
      from usuarios u left join usuario_sedes us on us.usuario_id=u.id
      left join usuario_centros_custo uc on uc.usuario_id=u.id
      group by u.id order by u.nome_exibicao`);
    return { content: rows };
  });

  app.post('/api/admin/usuarios', async (request, reply) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const body = (request.body || {}) as Record<string, unknown>;
    const nome = text(body.nomeExibicao, 'Nome de exibição', 120);
    const login = loginValue(body.login);
    const perfil = profileValue(body.perfil || 'USUARIO');
    const senha = typeof body.senha === 'string' ? body.senha : '';
    if (senha && senha.length < 8) badRequest('A senha local deve ter pelo menos 8 caracteres.');
    const sedes = ids(body.sedeIds);
    const centros = ids(body.centroCustoIds);
    if (perfil !== 'ADMIN' && !sedes.length) badRequest('Selecione ao menos uma sede para o usuário.');
    if (perfil !== 'ADMIN' && !centros.length) badRequest('Selecione ao menos um centro de custo para o usuário.');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const inserted = await client.query(`insert into usuarios(nome_exibicao,login,senha_hash,perfil) values($1,$2,$3,$4) returning id`, [nome, login, senha ? hashPassword(senha) : null, perfil]);
      const id = inserted.rows[0].id as number;
      await saveAccess(client, id, sedes, centros);
      await client.query('commit'); reply.status(201); return { id, nomeExibicao: nome, login, perfil, ativo: true };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });

  app.put('/api/admin/usuarios/:id', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden();
    const id = positiveId((request.params as { id: string }).id, 'Usuário');
    const body = (request.body || {}) as Record<string, unknown>;
    const nome = text(body.nomeExibicao, 'Nome de exibição', 120);
    const login = loginValue(body.login);
    const perfil = profileValue(body.perfil);
    const senha = typeof body.senha === 'string' ? body.senha : '';
    if (senha && senha.length < 8) badRequest('A senha local deve ter pelo menos 8 caracteres.');
    const ativo = typeof body.ativo === 'boolean' ? body.ativo : true;
    if (id === Number(request.authUser!.id) && (!ativo || perfil !== 'ADMIN')) badRequest('Você não pode remover o próprio acesso administrativo.');
    const sedes = ids(body.sedeIds);
    const centros = ids(body.centroCustoIds);
    if (perfil !== 'ADMIN' && !sedes.length) badRequest('Selecione ao menos uma sede para o usuário.');
    if (perfil !== 'ADMIN' && !centros.length) badRequest('Selecione ao menos um centro de custo para o usuário.');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(`update usuarios set nome_exibicao=$1,login=$2,perfil=$3,ativo=$4,senha_hash=case when $5='' then senha_hash else $6 end,atualizado_em=now() where id=$7`, [nome, login, perfil, ativo, senha, senha ? hashPassword(senha) : null, id]);
      if (!result.rowCount) badRequest('Usuário não encontrado.');
      await saveAccess(client, id, sedes, centros);
      await client.query('commit'); return { id, nomeExibicao: nome, login, perfil, ativo };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  });
}
