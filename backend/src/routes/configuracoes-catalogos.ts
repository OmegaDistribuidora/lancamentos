import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { isAdmin } from '../auth.js';
import { pool } from '../db/pool.js';
import { badRequest, forbidden, notFound, positiveId } from '../http.js';
import type { AuthUser } from '../types.js';

type Catalogo = 'FILIAL' | 'MATRIZ';

function catalogo(value: unknown): Catalogo {
  const normalized = String(value || 'FILIAL').toUpperCase();
  if (normalized !== 'FILIAL' && normalized !== 'MATRIZ') badRequest('Catálogo inválido.');
  return normalized as Catalogo;
}

function status(value: unknown): boolean {
  if (typeof value !== 'boolean') badRequest('Status inválido.');
  return value as boolean;
}

async function auditar(
  client: PoolClient,
  user: AuthUser,
  tipo: 'GRUPO_CONTA' | 'CONTA',
  item: { id: number; catalogo: string; codigo: string; nome: string; ativo: boolean; presenteOrigem: boolean },
  ativo: boolean,
) {
  await client.query(`
    insert into auditoria_catalogos
      (entidade_tipo,entidade_id,catalogo,codigo,acao,usuario_id,usuario_nome,dados_anteriores,dados_novos)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [
    tipo, item.id, item.catalogo, item.codigo, ativo ? 'ATIVACAO' : 'INATIVACAO',
    user.id, user.nomeExibicao,
    JSON.stringify({ codigo: item.codigo, nome: item.nome, catalogo: item.catalogo, ativo: item.ativo, presenteOrigem: item.presenteOrigem }),
    JSON.stringify({ codigo: item.codigo, nome: item.nome, catalogo: item.catalogo, ativo, presenteOrigem: item.presenteOrigem }),
  ]);
}

export async function registerCatalogConfigurationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/configuracoes/catalogos', async (request) => {
    if (!isAdmin(request.authUser!)) forbidden('Configuração de contas disponível apenas para administradores.');
    const fonte = catalogo((request.query as Record<string, unknown>).catalogo);
    const [grupos, contas] = await Promise.all([
      pool.query(`
        select g.id,g.codigo,g.nome,g.catalogo,g.ativo,g.presente_origem as "presenteOrigem",
          count(c.id)::int as "quantidadeContas",
          count(c.id) filter(where c.ativo and c.presente_origem)::int as "quantidadeContasAtivas",
          (select count(*)::int from lancamentos l where l.grupo_conta_id=g.id) as "quantidadeLancamentos"
        from grupos_contas g left join contas c on c.grupo_conta_id=g.id
        where g.catalogo=$1
        group by g.id order by g.codigo
      `, [fonte]),
      pool.query(`
        select c.id,c.codigo,c.nome,c.catalogo,c.grupo_conta_id as "grupoContaId",
          c.ativo,c.presente_origem as "presenteOrigem",
          (select count(*)::int from lancamentos l where l.conta_id=c.id) as "quantidadeLancamentos"
        from contas c where c.catalogo=$1 order by c.codigo
      `, [fonte]),
    ]);
    return { catalogo: fonte, gruposContas: grupos.rows, contas: contas.rows };
  });

  app.put('/api/configuracoes/catalogos/:tipo/:id/status', async (request) => {
    const user = request.authUser!;
    if (!isAdmin(user)) forbidden('Configuração de contas disponível apenas para administradores.');
    const { tipo, id: rawId } = request.params as { tipo: string; id: string };
    if (tipo !== 'grupos' && tipo !== 'contas') badRequest('Tipo de catálogo inválido.');
    const id = positiveId(rawId, tipo === 'grupos' ? 'Grupo' : 'Conta');
    const ativo = status((request.body as { ativo?: unknown } | undefined)?.ativo);
    const tabela = tipo === 'grupos' ? 'grupos_contas' : 'contas';
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<{ id: number; catalogo: string; codigo: string; nome: string; ativo: boolean; presenteOrigem: boolean }>(`
        select id,catalogo,codigo,nome,ativo,presente_origem as "presenteOrigem"
        from ${tabela} where id=$1 for update
      `, [id]);
      const item = result.rows[0] ?? notFound(tipo === 'grupos' ? 'Grupo não encontrado.' : 'Conta não encontrada.');
      if (ativo && !item.presenteOrigem) badRequest('O cadastro não existe mais no WinThor e não pode ser ativado.');
      if (item.ativo !== ativo) {
        await client.query(`update ${tabela} set ativo=$1 where id=$2`, [ativo, id]);
        await auditar(client, user, tipo === 'grupos' ? 'GRUPO_CONTA' : 'CONTA', item, ativo);
      }
      await client.query('commit');
      return { id, ativo, alterado: item.ativo !== ativo };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });
}
