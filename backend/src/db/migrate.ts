import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes } from 'node:crypto';
import { pool } from './pool.js';
import { config } from '../config.js';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

const centrosPorSede: Record<string, string[]> = {
  'Ômega Barroso': ['GERAL', 'OFICINA', 'CANTINA', 'COMERCIAL', 'FINANCEIRO', 'LOGÍSTICA'],
  'Ômega Cariri': ['GERAL', 'LOGÍSTICA', 'COMERCIAL'],
  'Ômega Matriz': ['GERAL', 'MARCENARIA', 'ESCRITÓRIO DE LICITAÇÃO', 'METALÚRGICA', 'ALIMENTAÇÃO PRONTA'],
  'Du Chico': ['GERAL', 'FRENTE DE LOJA', 'ADMINISTRATIVO'],
  Orion: ['GERAL'],
  'Fco Jose': ['GERAL'],
  J2A: ['GERAL'],
  Realleza: ['GERAL'],
  Galileia: ['GERAL'],
  Chiara: ['GERAL'],
  Rizo: ['GERAL'],
};

const gruposRemovidos = [
  '100', '101', '102', '103', '104', '202', '250', '404', '800',
  '954', '990', '991', '992', '995', '996', '997', '998', '999',
];

function centroNormalizado(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('pt-BR');
}

export async function migrate(): Promise<void> {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const catalogsPath = fileURLToPath(new URL('./catalogos-fixos.json', import.meta.url));
  const matrixCatalogsPath = fileURLToPath(new URL('./catalogos-matriz.json', import.meta.url));
  const sql = await readFile(schemaPath, 'utf8');
  const catalogs = JSON.parse(await readFile(catalogsPath, 'utf8')) as {
    grupos: Array<{ codigo: string; nome: string; cor: string }>;
    contas: Array<{ codigo: string; nome: string; grupocodigo: string }>;
  };
  const matrixCatalogs = JSON.parse(await readFile(matrixCatalogsPath, 'utf8')) as {
    grupos: Array<{ codigo: string; nome: string; cor: string }>;
    contas: Array<{ codigo: string; nome: string; grupocodigo: string }>;
  };
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('lancamentos_migrations'))`);
    await client.query(`create table if not exists migracoes (versao varchar(80) primary key, executada_em timestamptz not null default now())`);
    const applied = await client.query(`select 1 from migracoes where versao='001_schema_inicial'`);
    if (!applied.rowCount) {
      await client.query(sql);
      await client.query(`insert into migracoes (versao) values ('001_schema_inicial')`);
    }
    const catalogMigration = await client.query(`select 1 from migracoes where versao='002_catalogos_fixos_omega'`);
    if (!catalogMigration.rowCount) {
      await client.query(`alter table grupos_contas add column if not exists codigo varchar(30)`);
      await client.query(`alter table contas add column if not exists codigo varchar(30)`);
      await client.query(`create unique index if not exists uq_grupos_contas_codigo on grupos_contas(codigo) where codigo is not null`);
      await client.query(`create unique index if not exists uq_contas_codigo on contas(codigo) where codigo is not null`);
      await client.query(`insert into migracoes (versao) values ('002_catalogos_fixos_omega')`);
    }
    const budgetMigration = await client.query(`select 1 from migracoes where versao='003_sedes_e_orcamentos'`);
    if (!budgetMigration.rowCount) {
      await client.query(`alter table contas add column if not exists orcamento numeric(14,2) not null default 100.00`);
      await client.query(`alter table contas drop constraint if exists contas_orcamento_check`);
      await client.query(`alter table contas add constraint contas_orcamento_check check (orcamento >= 0)`);
      await client.query(`insert into migracoes (versao) values ('003_sedes_e_orcamentos')`);
    }
    const monthlyBudgetMigration = await client.query(`select 1 from migracoes where versao='004_orcamentos_por_sede_competencia'`);
    if (!monthlyBudgetMigration.rowCount) {
      await client.query(`
        create table if not exists orcamentos_contas (
          id bigserial primary key,
          conta_id bigint not null references contas(id) on delete cascade,
          sede_id bigint not null references sedes(id) on delete cascade,
          competencia date not null check (competencia = date_trunc('month', competencia)::date),
          valor numeric(14,2) not null default 100.00 check (valor >= 0),
          atualizado_por bigint references usuarios(id),
          criado_em timestamptz not null default now(),
          atualizado_em timestamptz not null default now(),
          unique (conta_id, sede_id, competencia)
        )
      `);
      await client.query(`create index if not exists idx_orcamentos_contas_sede_competencia on orcamentos_contas(sede_id, competencia)`);
      await client.query(`
        insert into orcamentos_contas (conta_id, sede_id, competencia, valor)
        select c.id, s.id, date_trunc('month', now() at time zone 'America/Fortaleza')::date, c.orcamento
        from contas c cross join sedes s where c.ativo and s.ativo
        on conflict (conta_id, sede_id, competencia) do nothing
      `);
      await client.query(`insert into migracoes (versao) values ('004_orcamentos_por_sede_competencia')`);
    }
    const zeroBudgetMigration = await client.query(`select 1 from migracoes where versao='006_zerar_orcamentos_iniciais'`);
    if (!zeroBudgetMigration.rowCount) {
      await client.query(`alter table contas alter column orcamento set default 0.00`);
      await client.query(`alter table orcamentos_contas alter column valor set default 0.00`);
      await client.query(`update contas set orcamento=0`);
      await client.query(`update orcamentos_contas set valor=0, atualizado_em=now()`);
      await client.query(`insert into migracoes (versao) values ('006_zerar_orcamentos_iniciais')`);
    }
    await client.query(
      `insert into usuarios (nome_exibicao, login, senha_hash, perfil)
       values ($1, $2, $3, 'ADMIN') on conflict (login) do nothing`,
      [config.admin.nome, config.admin.login, hashPassword(config.admin.password)],
    );
    await client.query(`update sedes set nome='Realleza' where nome='Reallea' and not exists (select 1 from sedes where nome='Realleza')`);
    const sedesFixas = ['Ômega Barroso', 'Ômega Cariri', 'Ômega Matriz', 'Du Chico', 'Orion', 'Fco Jose', 'J2A', 'Realleza', 'Galileia', 'Chiara', 'Rizo'];
    await client.query(`
      insert into sedes (nome, ativo)
      select nome, true from unnest($1::text[]) nome
      on conflict (nome) do update set ativo=true
    `, [sedesFixas]);
    await client.query(`update sedes set ativo=false where not (nome=any($1::text[]))`, [sedesFixas]);
    const costCenterMigration = await client.query(`select 1 from migracoes where versao='005_centros_custo_por_sede'`);
    if (!costCenterMigration.rowCount) {
      await client.query(`alter table centros_custo add column if not exists sede_id bigint references sedes(id) on delete cascade`);
      await client.query(`alter table centros_custo drop constraint if exists centros_custo_nome_key`);
      await client.query(`create unique index if not exists uq_centros_custo_sede_nome on centros_custo(sede_id, nome)`);

      const pares = Object.entries(centrosPorSede).flatMap(([sede, centros]) => centros.map((nome) => ({ sede, nome })));
      await client.query(`
        insert into centros_custo (sede_id, nome, ativo)
        select s.id, x.nome, true
        from jsonb_to_recordset($1::jsonb) as x(sede text, nome text)
        join sedes s on s.nome=x.sede
        on conflict (sede_id, nome) do update set ativo=true
      `, [JSON.stringify(pares)]);

      const centrosAtivos = await client.query<{ id: number; sedeId: number; nome: string }>(`
        select id, sede_id as "sedeId", nome from centros_custo where sede_id is not null and ativo
      `);
      const centrosLegados = await client.query<{ id: number; nome: string }>(`
        select id, nome from centros_custo where sede_id is null
      `);
      const lancamentosLegados = await client.query<{ sedeId: number; centroCustoId: number }>(`
        select distinct sede_id as "sedeId", centro_custo_id as "centroCustoId"
        from lancamentos where centro_custo_id = any($1::bigint[])
      `, [centrosLegados.rows.map((item) => item.id)]);
      const nomeLegado = new Map(centrosLegados.rows.map((item) => [Number(item.id), item.nome]));
      for (const item of lancamentosLegados.rows) {
        const sedeId = Number(item.sedeId);
        const antigo = nomeLegado.get(Number(item.centroCustoId)) || '';
        const daSede = centrosAtivos.rows.filter((centro) => Number(centro.sedeId) === sedeId);
        const equivalente = daSede.find((centro) => centroNormalizado(centro.nome) === centroNormalizado(antigo));
        const geral = daSede.find((centro) => centroNormalizado(centro.nome) === 'GERAL');
        const destino = equivalente || geral;
        if (!destino) throw new Error(`Centro de custo GERAL não encontrado para a sede ${sedeId}.`);
        await client.query(`update lancamentos set centro_custo_id=$1 where sede_id=$2 and centro_custo_id=$3`, [destino.id, sedeId, item.centroCustoId]);
      }

      await client.query(`delete from usuario_centros_custo`);
      await client.query(`
        insert into usuario_centros_custo (usuario_id, centro_custo_id)
        select us.usuario_id, c.id
        from usuario_sedes us join centros_custo c on c.sede_id=us.sede_id and c.ativo
        on conflict do nothing
      `);
      await client.query(`delete from centros_custo where sede_id is null`);
      await client.query(`alter table centros_custo alter column sede_id set not null`);
      await client.query(`
        do $$ begin
          if not exists (select 1 from pg_constraint where conname='uq_centros_custo_id_sede') then
            alter table centros_custo add constraint uq_centros_custo_id_sede unique (id, sede_id);
          end if;
          if not exists (select 1 from pg_constraint where conname='fk_lancamentos_centro_sede') then
            alter table lancamentos add constraint fk_lancamentos_centro_sede
              foreign key (centro_custo_id, sede_id) references centros_custo(id, sede_id);
          end if;
        end $$
      `);
      await client.query(`insert into migracoes (versao) values ('005_centros_custo_por_sede')`);
    }
    const costCenterAuditMigration = await client.query(`select 1 from migracoes where versao='008_auditoria_centros_custo'`);
    if (!costCenterAuditMigration.rowCount) {
      await client.query(`
        create table if not exists auditoria_centros_custo (
          id bigserial primary key,
          centro_custo_id bigint not null,
          acao varchar(20) not null check (acao in ('INSERCAO', 'EDICAO', 'EXCLUSAO')),
          usuario_id bigint not null references usuarios(id),
          usuario_nome varchar(120) not null,
          dados_anteriores jsonb,
          dados_novos jsonb,
          alteracoes jsonb,
          ocorrido_em timestamptz not null default now()
        )
      `);
      await client.query(`create index if not exists idx_auditoria_centros_custo on auditoria_centros_custo(centro_custo_id, ocorrido_em desc)`);
      await client.query(`insert into migracoes (versao) values ('008_auditoria_centros_custo')`);
    }
    const catalogBySiteMigration = await client.query(`select 1 from migracoes where versao='009_catalogos_por_sede'`);
    if (!catalogBySiteMigration.rowCount) {
      await client.query(`alter table sedes add column if not exists catalogo_contas varchar(20) not null default 'FILIAL'`);
      await client.query(`alter table grupos_contas add column if not exists catalogo varchar(20) not null default 'FILIAL'`);
      await client.query(`alter table contas add column if not exists catalogo varchar(20) not null default 'FILIAL'`);
      await client.query(`alter table sedes drop constraint if exists sedes_catalogo_contas_check`);
      await client.query(`alter table sedes add constraint sedes_catalogo_contas_check check (catalogo_contas in ('FILIAL','MATRIZ'))`);
      await client.query(`alter table grupos_contas drop constraint if exists grupos_contas_catalogo_check`);
      await client.query(`alter table grupos_contas add constraint grupos_contas_catalogo_check check (catalogo in ('FILIAL','MATRIZ'))`);
      await client.query(`alter table contas drop constraint if exists contas_catalogo_check`);
      await client.query(`alter table contas add constraint contas_catalogo_check check (catalogo in ('FILIAL','MATRIZ'))`);
      await client.query(`alter table grupos_contas drop constraint if exists grupos_contas_codigo_key`);
      await client.query(`alter table grupos_contas drop constraint if exists grupos_contas_nome_key`);
      await client.query(`alter table contas drop constraint if exists contas_codigo_key`);
      await client.query(`alter table contas drop constraint if exists contas_grupo_conta_id_nome_key`);
      await client.query(`drop index if exists uq_grupos_contas_codigo`);
      await client.query(`drop index if exists uq_contas_codigo`);
      await client.query(`create unique index if not exists uq_grupos_contas_catalogo_codigo on grupos_contas(catalogo,codigo) where codigo is not null`);
      await client.query(`create unique index if not exists uq_grupos_contas_catalogo_nome on grupos_contas(catalogo,nome)`);
      await client.query(`create unique index if not exists uq_contas_catalogo_codigo on contas(catalogo,codigo) where codigo is not null`);
      await client.query(`update sedes set catalogo_contas=case when nome='Ômega Matriz' then 'MATRIZ' else 'FILIAL' end`);
      await client.query(`
        delete from orcamentos_contas o
        using contas c, sedes s
        where o.conta_id=c.id and o.sede_id=s.id and c.catalogo<>s.catalogo_contas
      `);
      await client.query(`insert into migracoes (versao) values ('009_catalogos_por_sede')`);
    }
    await client.query(`
      insert into grupos_contas (catalogo, codigo, nome, cor, ativo)
      select 'FILIAL', x.codigo, x.nome, x.cor, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, cor text)
      on conflict (catalogo, codigo) where codigo is not null
      do nothing
    `, [JSON.stringify(catalogs.grupos)]);
    await client.query(`
      insert into contas (catalogo, codigo, grupo_conta_id, nome, ativo)
      select 'FILIAL', x.codigo, g.id, x.nome, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, grupocodigo text)
      join grupos_contas g on g.catalogo='FILIAL' and g.codigo=x.grupocodigo
      on conflict (catalogo, codigo) where codigo is not null
      do nothing
    `, [JSON.stringify(catalogs.contas)]);
    const catalogCleanupMigration = await client.query(`select 1 from migracoes where versao='007_remover_grupos_obsoletos'`);
    if (!catalogCleanupMigration.rowCount) {
      await client.query(`
        update contas c set ativo=true
        from grupos_contas g
        where g.id=c.grupo_conta_id and g.catalogo='FILIAL' and g.codigo=any($1::text[])
      `, [gruposRemovidos]);
      await client.query(`update grupos_contas set ativo=false where catalogo='FILIAL' and codigo=any($1::text[])`, [gruposRemovidos]);
      await client.query(`insert into migracoes (versao) values ('007_remover_grupos_obsoletos')`);
    }
    await client.query(`
      insert into grupos_contas (catalogo, codigo, nome, cor, ativo)
      select 'MATRIZ', x.codigo, x.nome, x.cor, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, cor text)
      on conflict (catalogo, codigo) where codigo is not null
      do nothing
    `, [JSON.stringify(matrixCatalogs.grupos)]);
    await client.query(`
      insert into contas (catalogo, codigo, grupo_conta_id, nome, ativo)
      select 'MATRIZ', x.codigo, g.id, x.nome, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, grupocodigo text)
      join grupos_contas g on g.catalogo='MATRIZ' and g.codigo=x.grupocodigo
      on conflict (catalogo, codigo) where codigo is not null
      do nothing
    `, [JSON.stringify(matrixCatalogs.contas)]);
    const catalogSyncMigration = await client.query(`select 1 from migracoes where versao='010_sincronizacao_catalogos'`);
    if (!catalogSyncMigration.rowCount) {
      await client.query(`drop index if exists uq_grupos_contas_catalogo_nome`);
      await client.query(`alter table grupos_contas add column if not exists presente_origem boolean not null default true`);
      await client.query(`alter table contas add column if not exists presente_origem boolean not null default true`);
      await client.query(`update grupos_contas set presente_origem=true`);
      await client.query(`update contas set presente_origem=true`);
      await client.query(`
        update contas c set ativo=true
        from grupos_contas g
        where g.id=c.grupo_conta_id and g.catalogo='FILIAL' and g.codigo=any($1::text[])
      `, [gruposRemovidos]);
      await client.query(`update grupos_contas set ativo=false where catalogo='FILIAL' and codigo=any($1::text[])`, [gruposRemovidos]);
      await client.query(`
        create table if not exists auditoria_catalogos (
          id bigserial primary key,
          entidade_tipo varchar(20) not null check (entidade_tipo in ('GRUPO_CONTA', 'CONTA')),
          entidade_id bigint not null,
          catalogo varchar(20) not null,
          codigo varchar(30) not null,
          acao varchar(20) not null check (acao in ('ATIVACAO', 'INATIVACAO')),
          usuario_id bigint not null references usuarios(id),
          usuario_nome varchar(120) not null,
          dados_anteriores jsonb,
          dados_novos jsonb,
          ocorrido_em timestamptz not null default now()
        )
      `);
      await client.query(`create index if not exists idx_auditoria_catalogos on auditoria_catalogos(entidade_tipo,entidade_id,ocorrido_em desc)`);
      await client.query(`insert into migracoes (versao) values ('010_sincronizacao_catalogos')`);
    }
    await client.query(`
      insert into usuario_sedes (usuario_id, sede_id)
      select u.id, s.id from usuarios u cross join sedes s where u.login = $1
      on conflict do nothing
    `, [config.admin.login]);
    await client.query(`
      insert into usuario_centros_custo (usuario_id, centro_custo_id)
      select u.id, c.id
      from usuarios u
      join usuario_sedes us on us.usuario_id=u.id
      join centros_custo c on c.sede_id=us.sede_id and c.ativo
      where u.login = $1
      on conflict do nothing
    `, [config.admin.login]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(async () => { console.log('Banco migrado com sucesso.'); await pool.end(); })
    .catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
}
