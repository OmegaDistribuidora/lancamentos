import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes } from 'node:crypto';
import { pool } from './pool.js';
import { config } from '../config.js';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export async function migrate(): Promise<void> {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const catalogsPath = fileURLToPath(new URL('./catalogos-fixos.json', import.meta.url));
  const sql = await readFile(schemaPath, 'utf8');
  const catalogs = JSON.parse(await readFile(catalogsPath, 'utf8')) as {
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
    await client.query(
      `insert into usuarios (nome_exibicao, login, senha_hash, perfil)
       values ($1, $2, $3, 'ADMIN') on conflict (login) do nothing`,
      [config.admin.nome, config.admin.login, hashPassword(config.admin.password)],
    );
    const sedesFixas = ['Ômega Barroso', 'Ômega Cariri', 'Ômega Matriz', 'Du Chico', 'Orion', 'Fco Jose', 'J2A', 'Reallea', 'Galileia', 'Chiara', 'Rizo'];
    await client.query(`
      insert into sedes (nome, ativo)
      select nome, true from unnest($1::text[]) nome
      on conflict (nome) do update set ativo=true
    `, [sedesFixas]);
    await client.query(`update sedes set ativo=false where not (nome=any($1::text[]))`, [sedesFixas]);
    const centrosFixos = ['Administrativo', 'Comercial', 'Logística'];
    await client.query(`
      insert into centros_custo (nome, ativo)
      select nome, true from unnest($1::text[]) nome
      on conflict (nome) do update set ativo=true
    `, [centrosFixos]);
    await client.query(`update centros_custo set ativo=false where not (nome=any($1::text[]))`, [centrosFixos]);
    await client.query(`
      insert into grupos_contas (codigo, nome, cor, ativo)
      select x.codigo, x.nome, x.cor, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, cor text)
      on conflict (codigo) where codigo is not null
      do update set nome=excluded.nome, cor=excluded.cor, ativo=true
    `, [JSON.stringify(catalogs.grupos)]);
    await client.query(`
      insert into contas (codigo, grupo_conta_id, nome, ativo)
      select x.codigo, g.id, x.nome, true
      from jsonb_to_recordset($1::jsonb) as x(codigo text, nome text, grupocodigo text)
      join grupos_contas g on g.codigo=x.grupocodigo
      on conflict (codigo) where codigo is not null
      do update set grupo_conta_id=excluded.grupo_conta_id, nome=excluded.nome, ativo=true
    `, [JSON.stringify(catalogs.contas)]);
    await client.query(`update contas set ativo=false where codigo is null or not (codigo=any($1::text[]))`, [catalogs.contas.map((item) => item.codigo)]);
    await client.query(`update grupos_contas set ativo=false where codigo is null or not (codigo=any($1::text[]))`, [catalogs.grupos.map((item) => item.codigo)]);
    await client.query(`
      insert into usuario_sedes (usuario_id, sede_id)
      select u.id, s.id from usuarios u cross join sedes s where u.login = $1
      on conflict do nothing
    `, [config.admin.login]);
    await client.query(`
      insert into usuario_centros_custo (usuario_id, centro_custo_id)
      select u.id, c.id from usuarios u cross join centros_custo c where u.login = $1
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
