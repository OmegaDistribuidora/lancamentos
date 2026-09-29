import type { FastifyInstance } from 'fastify';
import { isPrivileged } from '../auth.js';
import { pool } from '../db/pool.js';
import { dateOnly, forbidden, positiveId } from '../http.js';

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auditoria', async (request) => {
    if (!isPrivileged(request.authUser!)) forbidden('Auditoria disponível apenas para perfis gestores.');
    const q = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.numero) { params.push(positiveId(q.numero, 'Lançamento')); where.push(`a.numero_lancamento=$${params.length}`); }
    if (q.data) { params.push(dateOnly(q.data, 'Data')); where.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`); }
    const clause = where.length ? `where ${where.join(' and ')}` : '';
    const { rows } = await pool.query(`
      select a.id, a.numero_lancamento as "numeroLancamento", a.acao, a.usuario_nome as usuario,
        a.dados_anteriores as "dadosAnteriores", a.dados_novos as "dadosNovos", a.alteracoes,
        a.ocorrido_em as "ocorridoEm"
      from auditoria_lancamentos a ${clause} order by a.ocorrido_em desc limit 300`, params);
    return { content: rows };
  });
}
