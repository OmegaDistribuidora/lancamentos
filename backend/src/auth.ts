import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { HttpError, badRequest } from './http.js';
import type { AuthUser, Perfil } from './types.js';

type UserRow = { id: number; login: string; nomeExibicao: string; perfil: Perfil; senhaHash: string | null };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algorithm, salt, rawHash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !rawHash) return false;
  const expected = Buffer.from(rawHash, 'hex');
  const received = scryptSync(password, salt, 64);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function findUser(login: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `select id, login, nome_exibicao as "nomeExibicao", perfil, senha_hash as "senhaHash"
     from usuarios where lower(login) = lower($1) and ativo = true limit 1`,
    [login],
  );
  return rows[0] || null;
}

function asAuthUser(row: UserRow): AuthUser {
  return { id: row.id, login: row.login, nomeExibicao: row.nomeExibicao, perfil: row.perfil };
}

function sign(user: AuthUser): string {
  return jwt.sign({ login: user.login }, config.authSecret, {
    algorithm: 'HS256', subject: String(user.id), expiresIn: '12h',
  });
}

export function isPrivileged(user: AuthUser): boolean {
  return ['ADMIN', 'GERENTE_ADMINISTRATIVO', 'DIRETORIA'].includes(user.perfil);
}

export function isAdmin(user: AuthUser): boolean {
  return user.perfil === 'ADMIN';
}

async function profile(user: AuthUser) {
  const [sedes, centros] = await Promise.all([
    pool.query(`select s.id, s.nome from sedes s join usuario_sedes us on us.sede_id=s.id where us.usuario_id=$1 and s.ativo order by s.nome`, [user.id]),
    pool.query(`select c.id, c.nome, c.sede_id as "sedeId" from centros_custo c join usuario_centros_custo uc on uc.centro_custo_id=c.id where uc.usuario_id=$1 and c.ativo order by c.sede_id, c.nome`, [user.id]),
  ]);
  return { ...user, podeVerTodos: isPrivileged(user), podeAdministrar: isAdmin(user), sedes: sedes.rows, centrosCusto: centros.rows };
}

function unauthorized(reply: FastifyReply): void {
  reply.status(401).send({ status: 401, message: 'Sessão inválida ou expirada.' });
}

export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.url.startsWith('/api/') || request.method === 'OPTIONS') return;
  if (request.url === '/api/health' || request.url === '/api/auth/login' || request.url === '/api/auth/sso/exchange'
    || request.url === '/api/integracoes/catalogos/sincronizar') return;
  const raw = request.headers.authorization;
  if (!raw?.startsWith('Bearer ')) return unauthorized(reply);
  try {
    const payload = jwt.verify(raw.slice(7), config.authSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const row = await findUser(String(payload.login || ''));
    if (!row) return unauthorized(reply);
    request.authUser = asAuthUser(row);
  } catch {
    return unauthorized(reply);
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request) => {
    if (config.nodeEnv === 'production' && config.sso.enabled) throw new HttpError(404, 'Use o acesso pelo Ecossistema Ômega.');
    const body = request.body as Record<string, unknown> | undefined;
    const login = String(body?.login || '').trim().toLowerCase();
    const password = String(body?.senha || '');
    const row = login ? await findUser(login) : null;
    if (!row || !verifyPassword(password, row.senhaHash)) throw new HttpError(401, 'Login ou senha inválidos.');
    const user = asAuthUser(row);
    return { token: sign(user), usuario: await profile(user) };
  });

  app.post('/api/auth/sso/exchange', async (request) => {
    if (!config.sso.enabled || !config.sso.secret) throw new HttpError(404, 'Login SSO não está habilitado.');
    const token = String((request.body as { token?: unknown } | undefined)?.token || '').trim();
    if (!token) badRequest('Token SSO é obrigatório.');
    let payload: jwt.JwtPayload & { targetLogin?: string; ecosystemIsAdmin?: boolean };
    try {
      payload = jwt.verify(token, config.sso.secret, {
        algorithms: ['HS256'], issuer: config.sso.issuer, audience: config.sso.audience,
      }) as typeof payload;
    } catch {
      throw new HttpError(401, 'Token SSO inválido ou expirado.');
    }
    if (!payload.jti || !payload.exp || !payload.targetLogin) throw new HttpError(401, 'Token SSO incompleto.');
    const row = await findUser(payload.targetLogin);
    if (!row) throw new HttpError(401, 'Usuário não cadastrado ou inativo.');
    if (row.perfil === 'ADMIN' && payload.ecosystemIsAdmin !== true) throw new HttpError(403, 'O SSO não autoriza acesso administrativo.');
    const claimed = await pool.query(
      `insert into tokens_sso_utilizados (identificador, expira_em) values ($1, to_timestamp($2))
       on conflict do nothing returning identificador`, [payload.jti, payload.exp],
    );
    if (!claimed.rowCount) throw new HttpError(401, 'Token SSO já utilizado.');
    void pool.query('delete from tokens_sso_utilizados where expira_em < now()');
    const user = asAuthUser(row);
    return { token: sign(user), usuario: await profile(user) };
  });

  app.get('/api/auth/me', async (request) => profile(request.authUser!));
}
