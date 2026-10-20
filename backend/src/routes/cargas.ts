import type { FastifyInstance } from 'fastify';
import { canAccessCargoExpenses } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError, forbidden, positiveId } from '../http.js';

export async function fetchCarga(numero: number, detalhes = false): Promise<Record<string, unknown>> {
  if (!config.omegaApi.key) throw new HttpError(503, 'Integracao com o WinThor nao configurada.');
  let response: Response;
  try {
    response = await fetch(`${config.omegaApi.url}/v1/winthor/cargas/${numero}${detalhes ? '/detalhes' : ''}`, {
      headers: { 'X-API-Key': config.omegaApi.key, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.omegaApi.timeoutMs),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new HttpError(503, timeout
      ? 'API Ômega indisponível: a consulta ao Oracle excedeu o tempo limite.'
      : 'API Ômega offline ou inacessível: não foi possível conectar ao serviço de consulta do Oracle.');
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 404) throw new HttpError(404, 'Carga nao encontrada no WinThor.');
  if (!response.ok) {
    const detail = typeof payload.message === 'string' ? ` ${payload.message}` : '';
    throw new HttpError(503, `API Ômega respondeu com erro HTTP ${response.status}.${detail}`.trim());
  }
  return payload;
}

export async function registerCargoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cargas/:numero', async (request) => {
    if (!canAccessCargoExpenses(request.authUser!)) forbidden('Seu perfil nao possui acesso a consulta de cargas.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Numero da carga');
    const existing = await pool.query(`
      select l.numero_lancamento from despesas_cargas dc join lancamentos l on l.numero_lancamento=dc.numero_lancamento
      where dc.numero_carga=$1 and l.excluido_em is null limit 1
    `, [numero]);
    if (existing.rowCount) throw new HttpError(409, `A carga ${numero} já possui despesa lançada no lançamento #${existing.rows[0].numero_lancamento}.`);
    return fetchCarga(numero);
  });

  app.get('/api/cargas/:numero/detalhes', async (request) => {
    if (!canAccessCargoExpenses(request.authUser!)) forbidden('Seu perfil nao possui acesso a consulta de cargas.');
    const numero = positiveId((request.params as { numero: string }).numero, 'Numero da carga');
    return fetchCarga(numero, true);
  });
}
