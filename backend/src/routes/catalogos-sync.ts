import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { badRequest, forbidden, text } from '../http.js';

type Catalogo = 'FILIAL' | 'MATRIZ';
type GrupoEntrada = { codigo: string; nome: string };
type ContaEntrada = { codigo: string; nome: string; grupoCodigo: string };

const GRUPOS_FILIAL_INATIVOS_INICIAIS = new Set([
  '100', '101', '102', '103', '104', '202', '250', '404', '800',
  '954', '990', '991', '992', '995', '996', '997', '998', '999',
]);

function tokenValido(recebido: string): boolean {
  const esperado = config.catalogSyncToken;
  const bufferRecebido = Buffer.from(recebido);
  const bufferEsperado = Buffer.from(esperado);
  if (!esperado || bufferRecebido.length !== bufferEsperado.length) return false;
  return timingSafeEqual(bufferRecebido, bufferEsperado);
}

function catalogoValido(value: unknown): Catalogo {
  if (value !== 'FILIAL' && value !== 'MATRIZ') badRequest('Catálogo inválido.');
  return value as Catalogo;
}

function lista(value: unknown, nome: string, limite: number): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > limite) badRequest(`${nome} inválidos.`);
  return value as Array<Record<string, unknown>>;
}

function entrada(body: Record<string, unknown>) {
  const catalogo = catalogoValido(body.catalogo);
  const grupos = lista(body.grupos, 'Grupos', 500).map<GrupoEntrada>((item) => ({
    codigo: text(item.codigo, 'Código do grupo', 30),
    nome: text(item.nome, 'Nome do grupo', 160),
  }));
  const contas = lista(body.contas, 'Contas', 10_000).map<ContaEntrada>((item) => ({
    codigo: text(item.codigo, 'Código da conta', 30),
    nome: text(item.nome, 'Nome da conta', 180),
    grupoCodigo: text(item.grupoCodigo, 'Código do grupo da conta', 30),
  }));
  if (!grupos.length) badRequest('O catálogo precisa conter ao menos um grupo.');
  const codigosGrupo = new Set(grupos.map((item) => item.codigo));
  const codigosConta = new Set(contas.map((item) => item.codigo));
  if (codigosGrupo.size !== grupos.length) badRequest('Existem códigos de grupo duplicados.');
  if (codigosConta.size !== contas.length) badRequest('Existem códigos de conta duplicados.');
  if (contas.some((item) => !codigosGrupo.has(item.grupoCodigo))) badRequest('Uma conta referencia um grupo ausente do catálogo.');
  return { catalogo, grupos, contas };
}

export async function registerCatalogSyncRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/integracoes/catalogos/sincronizar', async (request) => {
    const token = String(request.headers['x-catalog-sync-token'] || '');
    if (!tokenValido(token)) forbidden('Credencial de sincronização inválida.');
    const { catalogo, grupos, contas } = entrada((request.body || {}) as Record<string, unknown>);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select pg_advisory_xact_lock(hashtext('sincronizacao_catalogos'))`);
      await client.query(`create temp table _sync_grupos(codigo text primary key,nome text not null) on commit drop`);
      await client.query(`create temp table _sync_contas(codigo text primary key,nome text not null,grupo_codigo text not null) on commit drop`);
      await client.query(`insert into _sync_grupos select codigo,nome from jsonb_to_recordset($1::jsonb) as x(codigo text,nome text)`, [JSON.stringify(grupos)]);
      await client.query(`insert into _sync_contas select codigo,nome,"grupoCodigo" from jsonb_to_recordset($1::jsonb) as x(codigo text,nome text,"grupoCodigo" text)`, [JSON.stringify(contas)]);

      const gruposInseridos = await client.query(`
        insert into grupos_contas(catalogo,codigo,nome,ativo,presente_origem)
        select $1::varchar(20),s.codigo,s.nome,
          case when $1::text='FILIAL' and s.codigo=any($2::text[]) then false else true end,
          true
        from _sync_grupos s
        on conflict (catalogo,codigo) where codigo is not null do nothing
      `, [catalogo, [...GRUPOS_FILIAL_INATIVOS_INICIAIS]]);
      const gruposAtualizados = await client.query(`
        update grupos_contas g set nome=s.nome,presente_origem=true
        from _sync_grupos s
        where g.catalogo=$1::varchar(20) and g.codigo=s.codigo
          and (g.nome is distinct from s.nome or not g.presente_origem)
      `, [catalogo]);

      const contasInseridas = await client.query(`
        insert into contas(catalogo,codigo,grupo_conta_id,nome,ativo,presente_origem)
        select $1::varchar(20),s.codigo,g.id,s.nome,true,true
        from _sync_contas s join grupos_contas g on g.catalogo=$1::varchar(20) and g.codigo=s.grupo_codigo
        on conflict (catalogo,codigo) where codigo is not null do nothing
      `, [catalogo]);
      const contasAtualizadas = await client.query(`
        update contas c set nome=s.nome,grupo_conta_id=g.id,presente_origem=true
        from _sync_contas s join grupos_contas g on g.catalogo=$1::varchar(20) and g.codigo=s.grupo_codigo
        where c.catalogo=$1::varchar(20) and c.codigo=s.codigo
          and (c.nome is distinct from s.nome or c.grupo_conta_id<>g.id or not c.presente_origem)
      `, [catalogo]);

      const contasExcluidas = await client.query(`
        delete from contas c
        where c.catalogo=$1::varchar(20)
          and not exists(select 1 from _sync_contas s where s.codigo=c.codigo)
          and not exists(select 1 from lancamentos l where l.conta_id=c.id)
      `, [catalogo]);
      const contasIndisponiveis = await client.query(`
        update contas c set presente_origem=false
        where c.catalogo=$1::varchar(20) and c.presente_origem
          and not exists(select 1 from _sync_contas s where s.codigo=c.codigo)
      `, [catalogo]);
      const gruposExcluidos = await client.query(`
        delete from grupos_contas g
        where g.catalogo=$1::varchar(20)
          and not exists(select 1 from _sync_grupos s where s.codigo=g.codigo)
          and not exists(select 1 from contas c where c.grupo_conta_id=g.id)
          and not exists(select 1 from lancamentos l where l.grupo_conta_id=g.id)
      `, [catalogo]);
      const gruposIndisponiveis = await client.query(`
        update grupos_contas g set presente_origem=false
        where g.catalogo=$1::varchar(20) and g.presente_origem
          and not exists(select 1 from _sync_grupos s where s.codigo=g.codigo)
      `, [catalogo]);

      await client.query('commit');
      return {
        catalogo,
        recebido: { grupos: grupos.length, contas: contas.length },
        alteracoes: {
          gruposInseridos: gruposInseridos.rowCount || 0,
          gruposAtualizados: gruposAtualizados.rowCount || 0,
          gruposExcluidos: gruposExcluidos.rowCount || 0,
          gruposIndisponiveis: gruposIndisponiveis.rowCount || 0,
          contasInseridas: contasInseridas.rowCount || 0,
          contasAtualizadas: contasAtualizadas.rowCount || 0,
          contasExcluidas: contasExcluidas.rowCount || 0,
          contasIndisponiveis: contasIndisponiveis.rowCount || 0,
        },
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });
}
