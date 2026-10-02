import type { FastifyInstance } from 'fastify';
import { isPrivileged } from '../auth.js';
import { pool } from '../db/pool.js';
import { dateOnly, forbidden, positiveId } from '../http.js';

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auditoria', async (request) => {
    if (!isPrivileged(request.authUser!)) forbidden('Auditoria disponível apenas para perfis gestores.');
    const q = request.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    const whereLancamentos: string[] = [];
    const whereCentros: string[] = [];
    if (q.numero) {
      params.push(positiveId(q.numero, 'Lançamento'));
      whereLancamentos.push(`a.numero_lancamento=$${params.length}`);
      whereCentros.push('false');
    }
    if (q.data) {
      params.push(dateOnly(q.data, 'Data'));
      whereLancamentos.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
      whereCentros.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
    }
    const clauseLancamentos = whereLancamentos.length ? `where ${whereLancamentos.join(' and ')}` : '';
    const clauseCentros = whereCentros.length ? `where ${whereCentros.join(' and ')}` : '';
    const { rows } = await pool.query(`
      select * from (
        select a.id,'LANCAMENTO'::text as "entidadeTipo",a.numero_lancamento as "numeroLancamento",
          null::bigint as "centroCustoId",a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",a.alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_lancamentos a ${clauseLancamentos}
        union all
        select a.id,'CENTRO_CUSTO'::text as "entidadeTipo",null::bigint as "numeroLancamento",
          a.centro_custo_id as "centroCustoId",a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",a.alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_centros_custo a ${clauseCentros}
      ) eventos order by "ocorridoEm" desc limit 300`, params);
    return { content: rows };
  });
}
