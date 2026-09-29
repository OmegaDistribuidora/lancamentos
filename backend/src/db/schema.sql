create table if not exists sedes (
  id bigserial primary key,
  nome varchar(120) not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists centros_custo (
  id bigserial primary key,
  sede_id bigint not null references sedes(id) on delete cascade,
  nome varchar(160) not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint uq_centros_custo_sede_nome unique (sede_id, nome),
  constraint uq_centros_custo_id_sede unique (id, sede_id)
);

create table if not exists grupos_contas (
  id bigserial primary key,
  codigo varchar(30) not null unique,
  nome varchar(160) not null unique,
  cor varchar(20) not null default '#2563eb',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists contas (
  id bigserial primary key,
  codigo varchar(30) not null unique,
  grupo_conta_id bigint not null references grupos_contas(id),
  nome varchar(180) not null,
  orcamento numeric(14,2) not null default 100.00 check (orcamento >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (grupo_conta_id, nome)
);

create table if not exists usuarios (
  id bigserial primary key,
  nome_exibicao varchar(120) not null,
  login varchar(100) not null unique,
  senha_hash text,
  perfil varchar(40) not null default 'USUARIO'
    check (perfil in ('ADMIN', 'GERENTE_ADMINISTRATIVO', 'DIRETORIA', 'USUARIO')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

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
);

create index if not exists idx_orcamentos_contas_sede_competencia
  on orcamentos_contas(sede_id, competencia);

create table if not exists usuario_sedes (
  usuario_id bigint not null references usuarios(id) on delete cascade,
  sede_id bigint not null references sedes(id) on delete cascade,
  primary key (usuario_id, sede_id)
);

create table if not exists usuario_centros_custo (
  usuario_id bigint not null references usuarios(id) on delete cascade,
  centro_custo_id bigint not null references centros_custo(id) on delete cascade,
  primary key (usuario_id, centro_custo_id)
);

create table if not exists lancamentos (
  numero_lancamento bigserial primary key,
  data_lancamento date not null default ((now() at time zone 'America/Fortaleza')::date),
  hora_lancamento time(0) not null default ((now() at time zone 'America/Fortaleza')::time(0)),
  colaborador_id bigint not null references usuarios(id),
  data_pagamento date not null,
  sede_id bigint not null references sedes(id),
  centro_custo_id bigint not null,
  grupo_conta_id bigint not null references grupos_contas(id),
  conta_id bigint not null references contas(id),
  observacao text not null default '',
  valor numeric(14,2) not null check (valor > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por bigint references usuarios(id),
  constraint fk_lancamentos_centro_sede foreign key (centro_custo_id, sede_id)
    references centros_custo(id, sede_id)
);

create index if not exists idx_lancamentos_colaborador on lancamentos(colaborador_id, criado_em desc);
create index if not exists idx_lancamentos_data_pagamento on lancamentos(data_pagamento desc) where excluido_em is null;
create index if not exists idx_lancamentos_sede on lancamentos(sede_id) where excluido_em is null;

create table if not exists auditoria_lancamentos (
  id bigserial primary key,
  numero_lancamento bigint not null,
  acao varchar(20) not null check (acao in ('INSERCAO', 'EDICAO', 'EXCLUSAO')),
  usuario_id bigint not null references usuarios(id),
  usuario_nome varchar(120) not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  alteracoes jsonb,
  ocorrido_em timestamptz not null default now()
);

create index if not exists idx_auditoria_lancamento on auditoria_lancamentos(numero_lancamento, ocorrido_em desc);

create table if not exists tokens_sso_utilizados (
  identificador varchar(180) primary key,
  expira_em timestamptz not null,
  utilizado_em timestamptz not null default now()
);
