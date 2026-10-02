import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { isPrivileged } from '../auth.js';
import { pool } from '../db/pool.js';
import { badRequest, forbidden, notFound, positiveId, text } from '../http.js';
import type { AuthUser } from '../types.js';

type Centro = {
  id: number | string;
  nome: string;
  sedeId: number | string;
  sede: string;
  ativo: boolean;
};

function nomeCentro(value: unknown): string {
  return text(value, 'Nome', 160).toLocaleUpperCase('pt-BR');
}

async function sedeAtiva(client: PoolClient, sedeId: number): Promise<void> {
  const result = await client.query(`select 1 from sedes where id=$1 and ativo`, [sedeId]);
  if (!result.rowCount) badRequest('Sede não encontrada ou inativa.');
}

async function centro(client: PoolClient, id: number, somenteAtivo = true): Promise<Centro> {
  const result = await client.query<Centro>(`
    select c.id,c.nome,c.sede_id as "sedeId",s.nome as sede,c.ativo
    from centros_custo c join sedes s on s.id=c.sede_id
    where c.id=$1 ${somenteAtivo ? 'and c.ativo' : ''}
    for update of c
  `, [id]);
  const encontrado = result.rows[0];
  if (!encontrado) return notFound('Centro de custo não encontrado.');
  return encontrado;
}

function alteracoes(antes: Centro, depois: Centro) {
  const diff: Record<string, { de: unknown; para: unknown }> = {};
  for (const campo of ['nome', 'sede'] as const) {
    if (String(antes[campo]) !== String(depois[campo])) diff[campo] = { de: antes[campo], para: depois[campo] };
  }
  return diff;
}

async function auditar(
  client: PoolClient,
  user: AuthUser,
  id: number,
  acao: 'INSERCAO' | 'EDICAO' | 'EXCLUSAO',
  antes: Centro | null,
  depois: Centro | null,
  diff: Record<string, { de: unknown; para: unknown }> | null = null,
): Promise<void> {
  await client.query(`
    insert into auditoria_centros_custo
      (centro_custo_id,acao,usuario_id,usuario_nome,dados_anteriores,dados_novos,alteracoes)
    values ($1,$2,$3,$4,$5,$6,$7)
  `, [
    id, acao, user.id, user.nomeExibicao,
    antes ? JSON.stringify(antes) : null,
    depois ? JSON.stringify(depois) : null,
    diff ? JSON.stringify(diff) : null,
  ]);
}

async function copiarPermissoes(client: PoolClient, origemId: number, destinoId: number, sedeId: number): Promise<void> {
  await client.query(`
    insert into usuario_centros_custo (usuario_id,centro_custo_id)
    select uc.usuario_id,$1
    from usuario_centros_custo uc
    join usuario_sedes us on us.usuario_id=uc.usuario_id and us.sede_id=$2
    where uc.centro_custo_id=$3
    on conflict do nothing
  `, [destinoId, sedeId, origemId]);
}

export async function registerCostCenterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/centros-custo', async (request) => {
    if (!isPrivileged(request.authUser!)) forbidden('Centros de custo disponíveis apenas para perfis gestores.');
    const [sedes, centros] = await Promise.all([
      pool.query(`select id,nome from sedes where ativo order by nome`),
      pool.query(`
        select c.id,c.nome,c.sede_id as "sedeId",s.nome as sede,
          (select count(*)::int from lancamentos l where l.centro_custo_id=c.id) as "quantidadeLancamentos"
        from centros_custo c join sedes s on s.id=c.sede_id
        where c.ativo and s.ativo order by s.nome,c.nome
      `),
    ]);
    return { sedes: sedes.rows, centrosCusto: centros.rows };
  });

  app.post('/api/centros-custo', async (request, reply) => {
    const user = request.authUser!;
    if (!isPrivileged(user)) forbidden('Centros de custo disponíveis apenas para perfis gestores.');
    const body = (request.body || {}) as Record<string, unknown>;
    const sedeId = positiveId(body.sedeId, 'Sede');
    const nome = nomeCentro(body.nome);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select pg_advisory_xact_lock(hashtext('centros_custo_catalogo'))`);
      await sedeAtiva(client, sedeId);
      const existente = await client.query<{ id: number | string; ativo: boolean }>(`
        select id,ativo from centros_custo where sede_id=$1 and upper(nome)=upper($2) for update
      `, [sedeId, nome]);
      if (existente.rows[0]?.ativo) badRequest('Já existe um centro de custo com este nome nesta sede.');
      let id: number;
      if (existente.rows[0]) {
        id = Number(existente.rows[0].id);
        await client.query(`delete from usuario_centros_custo where centro_custo_id=$1`, [id]);
        await client.query(`update centros_custo set nome=$1,ativo=true where id=$2`, [nome, id]);
      } else {
        const result = await client.query<{ id: number | string }>(`
          insert into centros_custo (sede_id,nome,ativo) values ($1,$2,true) returning id
        `, [sedeId, nome]);
        const criado = result.rows[0];
        if (!criado) throw new Error('O centro de custo não foi criado.');
        id = Number(criado.id);
      }
      const depois = await centro(client, id, false);
      await auditar(client, user, id, 'INSERCAO', null, depois);
      await client.query('commit');
      reply.status(201);
      return depois;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  app.put('/api/centros-custo/:id', async (request) => {
    const user = request.authUser!;
    if (!isPrivileged(user)) forbidden('Centros de custo disponíveis apenas para perfis gestores.');
    const id = positiveId((request.params as { id: string }).id, 'Centro de custo');
    const body = (request.body || {}) as Record<string, unknown>;
    const sedeId = positiveId(body.sedeId, 'Sede');
    const nome = nomeCentro(body.nome);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select pg_advisory_xact_lock(hashtext('centros_custo_catalogo'))`);
      const antes = await centro(client, id);
      await sedeAtiva(client, sedeId);
      if (Number(antes.sedeId) === sedeId && antes.nome.toLocaleUpperCase('pt-BR') === nome) {
        await client.query('commit');
        return antes;
      }
      const existente = await client.query<{ id: number | string; ativo: boolean }>(`
        select id,ativo from centros_custo
        where sede_id=$1 and upper(nome)=upper($2) and id<>$3 for update
      `, [sedeId, nome, id]);
      if (existente.rows[0]?.ativo) badRequest('Já existe um centro de custo com este nome nesta sede.');
      const uso = await client.query(`select 1 from lancamentos where centro_custo_id=$1 limit 1`, [id]);
      let destinoId = id;
      if (uso.rowCount || existente.rows[0]) {
        if (existente.rows[0]) {
          destinoId = Number(existente.rows[0].id);
          await client.query(`delete from usuario_centros_custo where centro_custo_id=$1`, [destinoId]);
          await client.query(`update centros_custo set nome=$1,ativo=true where id=$2`, [nome, destinoId]);
        } else {
          const inserido = await client.query<{ id: number | string }>(`
            insert into centros_custo (sede_id,nome,ativo) values ($1,$2,true) returning id
          `, [sedeId, nome]);
          const criado = inserido.rows[0];
          if (!criado) throw new Error('A nova versão do centro de custo não foi criada.');
          destinoId = Number(criado.id);
        }
        await copiarPermissoes(client, id, destinoId, sedeId);
        await client.query(`delete from usuario_centros_custo where centro_custo_id=$1`, [id]);
        await client.query(`update centros_custo set ativo=false where id=$1`, [id]);
      } else {
        await client.query(`update centros_custo set sede_id=$1,nome=$2 where id=$3`, [sedeId, nome, id]);
        await client.query(`
          delete from usuario_centros_custo uc
          where uc.centro_custo_id=$1
            and not exists (
              select 1 from usuario_sedes us where us.usuario_id=uc.usuario_id and us.sede_id=$2
            )
        `, [id, sedeId]);
      }
      const depois = await centro(client, destinoId, false);
      await auditar(client, user, destinoId, 'EDICAO', antes, depois, alteracoes(antes, depois));
      await client.query('commit');
      return depois;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete('/api/centros-custo/:id', async (request, reply) => {
    const user = request.authUser!;
    if (!isPrivileged(user)) forbidden('Centros de custo disponíveis apenas para perfis gestores.');
    const id = positiveId((request.params as { id: string }).id, 'Centro de custo');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const antes = await centro(client, id);
      await client.query(`delete from usuario_centros_custo where centro_custo_id=$1`, [id]);
      await client.query(`update centros_custo set ativo=false where id=$1`, [id]);
      await auditar(client, user, id, 'EXCLUSAO', antes, null);
      await client.query('commit');
      reply.status(204).send();
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });
}
