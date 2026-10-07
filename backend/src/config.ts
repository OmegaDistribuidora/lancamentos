import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url) });
dotenv.config();

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function origins(value: string | undefined): string[] {
  return (value || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  timezone: 'America/Fortaleza',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lancamentos',
  databaseSsl: (process.env.PGSSLMODE || 'disable').toLowerCase() !== 'disable',
  corsOrigins: origins(process.env.CORS_ALLOWED_ORIGINS),
  authSecret: process.env.AUTH_TOKEN_SECRET || 'lancamentos-local-dev-secret-change-me',
  admin: {
    login: (process.env.ADMIN_LOGIN || 'admin').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    nome: process.env.ADMIN_NOME || 'Administrador',
  },
  sso: {
    enabled: bool(process.env.ECOSYSTEM_SSO_ENABLED, false),
    issuer: process.env.ECOSYSTEM_SSO_ISSUER || 'ecosistema-omega',
    audience: process.env.ECOSYSTEM_SSO_AUDIENCE || 'lancamentos',
    secret: (process.env.ECOSYSTEM_SSO_SHARED_SECRET || '').trim(),
  },
  catalogSyncToken: (process.env.CATALOG_SYNC_TOKEN || '').trim(),
};

if (config.nodeEnv === 'production') {
  if (!process.env.AUTH_TOKEN_SECRET || config.authSecret.length < 32) throw new Error('AUTH_TOKEN_SECRET deve ter ao menos 32 caracteres em produção.');
  if (!process.env.ADMIN_PASSWORD || config.admin.password === 'Admin@123') throw new Error('ADMIN_PASSWORD seguro é obrigatório em produção.');
  if (!process.env.CORS_ALLOWED_ORIGINS) throw new Error('CORS_ALLOWED_ORIGINS é obrigatório em produção.');
  if (config.sso.enabled && config.sso.secret.length < 32) throw new Error('ECOSYSTEM_SSO_SHARED_SECRET deve ter ao menos 32 caracteres quando o SSO está habilitado.');
  if (config.catalogSyncToken.length < 32) throw new Error('CATALOG_SYNC_TOKEN deve ter ao menos 32 caracteres em produção.');
}

process.env.TZ = config.timezone;
