import type { FastifyInstance } from 'fastify';
import { canAccessCargoExpenses } from '../auth.js';
import { config } from '../config.js';
import { HttpError, forbidden, positiveId } from '../http.js';

export async function fetchCarga(numero: number, detalhes = false): Promise<Record<string, unknown>> {
  if (!config.omegaApi.key) throw new HttpError(503, 'Integracao com o WinThor nao configurada.');
  let response: Response;
  try {
    response = await fetch(`${config.omegaApi.url}/v1/winthor/cargas/${numero}${detalhes ? '/detalhes' : ''}`, {
      headers: { 'X-API-Key': config.omegaApi.key, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.omegaApi.timeoutMs),
    });
  } catch {
    throw new HttpError(503, detalhes ? 'Nao foi possivel acessar os detalhes da carga. Tente novamente em instantes.' : 'Nao foi possivel acessar o WinThor. Tente novamente em instantes.');
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 404) throw new HttpError(404, 'Carga nao encontrada no WinThor.');
  if (!response.ok) throw new HttpError(503, detalhes ? 'Nao foi possivel consultar os detalhes da carga no WinThor.' : 'Nao foi possivel consultar a carga no WinThor.');
  return payload;
}

export async function registerCargoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cargas/:numero', async (request) => {
    if (!canAccessCargoExpenses(request.authUser!)) forbidden('Seu perfil nao possui acesso a consulta de cargas.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Numero da carga');
    return fetchCarga(numero);
  });

  app.get('/api/cargas/:numero/detalhes', async (request) => {
    if (!canAccessCargoExpenses(request.authUser!)) forbidden('Seu perfil nao possui acesso a consulta de cargas.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Numero da carga');
    return fetchCarga(numero, true);
  });
}
