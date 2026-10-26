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
    const whereCargas: string[] = [];
    const whereCentros: string[] = [];
    const whereCatalogos: string[] = [];
    if (q.numero) {
      params.push(positiveId(q.numero, 'Lançamento'));
      whereLancamentos.push(`a.numero_lancamento=$${params.length}`);
      whereCargas.push(`a.numero_lancamento_carga=$${params.length}`);
      whereCentros.push('false');
      whereCatalogos.push('false');
    }
    if (q.data) {
      params.push(dateOnly(q.data, 'Data'));
      whereLancamentos.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
      whereCargas.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
      whereCentros.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
      whereCatalogos.push(`(a.ocorrido_em at time zone 'America/Fortaleza')::date=$${params.length}`);
    }
    const clauseLancamentos = whereLancamentos.length ? `where ${whereLancamentos.join(' and ')}` : '';
    const clauseCargas = whereCargas.length ? `where ${whereCargas.join(' and ')}` : '';
    const clauseCentros = whereCentros.length ? `where ${whereCentros.join(' and ')}` : '';
    const clauseCatalogos = whereCatalogos.length ? `where ${whereCatalogos.join(' and ')}` : '';
    const { rows } = await pool.query(`
      select * from (
        select a.id,'LANCAMENTO'::text as "entidadeTipo",a.numero_lancamento as "numeroLancamento",
          null::bigint as "centroCustoId",null::bigint as "catalogoEntidadeId",null::text as codigo,
          a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",a.alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_lancamentos a ${clauseLancamentos}${clauseLancamentos ? ' and' : ' where'} not exists(select 1 from despesas_cargas dc where dc.numero_lancamento=a.numero_lancamento)
        union all
        select a.id,'LANCAMENTO_CARGA'::text as "entidadeTipo",a.numero_lancamento_carga as "numeroLancamento",
          null::bigint as "centroCustoId",null::bigint as "catalogoEntidadeId",null::text as codigo,
          a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",a.alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_lancamentos_cargas a ${clauseCargas}
        union all
        select a.id,'CENTRO_CUSTO'::text as "entidadeTipo",null::bigint as "numeroLancamento",
          a.centro_custo_id as "centroCustoId",null::bigint as "catalogoEntidadeId",null::text as codigo,
          a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",a.alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_centros_custo a ${clauseCentros}
        union all
        select a.id,a.entidade_tipo as "entidadeTipo",null::bigint as "numeroLancamento",
          null::bigint as "centroCustoId",a.entidade_id as "catalogoEntidadeId",a.codigo,
          a.acao,a.usuario_nome as usuario,
          a.dados_anteriores as "dadosAnteriores",a.dados_novos as "dadosNovos",null::jsonb as alteracoes,
          a.ocorrido_em as "ocorridoEm"
        from auditoria_catalogos a ${clauseCatalogos}
      ) eventos order by "ocorridoEm" desc limit 300`, params);
    return { content: rows };
  });
}
