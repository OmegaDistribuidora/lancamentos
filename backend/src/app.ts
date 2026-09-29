import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { HttpError } from './http.js';
import { authHook, registerAuthRoutes } from './auth.js';
import { registerCatalogRoutes } from './routes/catalogos.js';
import { registerLancamentoRoutes } from './routes/lancamentos.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAuditRoutes } from './routes/auditoria.js';
import { registerUserRoutes } from './routes/usuarios.js';

export async function createApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, {
    origin(origin, callback) { callback(null, !origin || config.corsOrigins.includes(origin.replace(/\/$/, ''))); },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.addHook('onRequest', authHook);
  app.get('/api/health', async () => ({ status: 'ok', timezone: config.timezone }));
  await registerAuthRoutes(app);
  await registerCatalogRoutes(app);
  await registerLancamentoRoutes(app);
  await registerDashboardRoutes(app);
  await registerAuditRoutes(app);
  await registerUserRoutes(app);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ status: error.status, message: error.message, fields: error.fields });
    if ((error as { code?: string }).code === '23505') return reply.status(409).send({ status: 409, message: 'Já existe um cadastro com estes dados.' });
    if ((error as { code?: string }).code === '23503') return reply.status(400).send({ status: 400, message: 'Uma das opções selecionadas não existe.' });
    const frameworkError = error as { statusCode?: number; message?: string };
    const frameworkStatus = frameworkError.statusCode;
    if (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500) return reply.status(frameworkStatus).send({ status: frameworkStatus, message: frameworkError.message || 'Requisição inválida.' });
    request.log.error(error);
    return reply.status(500).send({ status: 500, message: 'Não foi possível concluir a operação.' });
  });
  return app;
}
