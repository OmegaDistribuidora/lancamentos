# Lançamentos — Ômega Distribuidora

Sistema web para registro e acompanhamento de despesas. Cada usuário visualiza e gerencia os próprios lançamentos; administradores, gerência administrativa e diretoria visualizam toda a empresa. Inserções, edições e exclusões são auditadas.

## Arquitetura

- `frontend/`: React 19, Vite, Recharts e interface responsiva;
- `backend/`: Fastify com TypeScript, JWT e API REST;
- PostgreSQL: dados, permissões, exclusão lógica e auditoria transacional;
- desenvolvimento: login e senha locais;
- produção: troca do JWT de uso único enviado pelo SSO do Ecossistema Ômega.

Datas e horários de negócio são sempre tratados em `America/Fortaleza`. Os nomes de tabelas e colunas de domínio estão em português.

## Início rápido

Pré-requisitos: Node.js 22+ e Docker Desktop em execução.

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
docker compose up -d postgres
npm install
npm run dev
```

Acesse `http://localhost:5173`. O primeiro acesso local usa os valores de `ADMIN_LOGIN` e `ADMIN_PASSWORD` do `.env` (no exemplo: `admin` / `Admin@123`). Troque essa senha fora do ambiente local.

A API inicia em `http://localhost:8080`, aplica a migração automaticamente e inclui catálogos iniciais para teste. Também é possível executar a migração separadamente:

```powershell
npm run db:migrate
```

## Regras implementadas

- número sequencial automático;
- data e hora do lançamento geradas no servidor no fuso de Fortaleza;
- colaborador derivado da sessão, nunca do formulário;
- data de pagamento preenchida inicialmente com hoje, editável sem permitir datas futuras;
- cada centro de custo pertence a uma sede e o seletor mostra somente os centros da sede escolhida;
- sede e centro de custo limitados às permissões do usuário;
- conta validada contra o grupo de contas escolhido;
- valor positivo com duas casas decimais;
- usuário comum vê, edita e exclui apenas os próprios registros;
- `ADMIN`, `GERENTE_ADMINISTRATIVO` e `DIRETORIA` veem todos os registros;
- exclusão lógica, preservando o registro e o evento de auditoria;
- auditoria com estado anterior, estado novo e de/para de cada campo editado;
- exportação para `.xlsx` e PDF por administrador, gerência administrativa e diretoria;
- gestão administrativa de usuários, perfis, sedes e centros de custo;
- catálogos de grupos e contas sincronizados diretamente de `PCGRUPO` e `PCCONTA` do WinThor: a Ômega Matriz usa o catálogo da matriz e as demais sedes usam o catálogo da filial;
- grupos e contas podem ser ativados ou inativados pelo administrador, sem apagar lançamentos históricos;
- busca por código ou nome nos seletores de grupo e conta, com contas filtradas pelo grupo escolhido;
- 11 sedes fixas da empresa, incluindo `Realleza` com a grafia correta;
- orçamento editável por conta, sede e competência, iniciado em R$ 0,00;
- cada orçamento permanece vigente nos meses seguintes até que um novo valor seja informado;
- orçamento e despesa de cada grupo calculados pela soma de suas contas;
- dashboard iniciado no mês atual e, para perfis gestores, com todas as sedes agregadas;
- gráfico com agrupamento semanal no mês e filtro adaptativo para períodos maiores;
- auditoria visível para administrador, gerência administrativa e diretoria;
- orçamentos visíveis e editáveis por administrador, gerência administrativa e diretoria;
- usuários comuns visualizam somente os próprios lançamentos e não recebem dados de orçamento;
- filtros rápidos de período, sede, colaborador, grupo e contas, com exportação integral do resultado filtrado.

## SSO do Ecossistema Ômega

O contrato é compatível com o fluxo do `payment_control`. O Ecossistema abre o frontend com `#sso=<JWT>` (também é aceito `?sso=`). O frontend envia esse token uma vez para `POST /api/auth/sso/exchange`.

O JWT de entrada deve usar `HS256` e conter:

- `iss`: valor de `ECOSYSTEM_SSO_ISSUER`;
- `aud`: valor de `ECOSYSTEM_SSO_AUDIENCE`;
- `jti`: identificador único para impedir reutilização;
- `exp`: expiração;
- `targetLogin`: login cadastrado neste sistema;
- `ecosystemIsAdmin`: `true` quando o destino for um usuário `ADMIN`.

Em produção, quando `ECOSYSTEM_SSO_ENABLED=true`, o login por senha é desabilitado. Tokens SSO consumidos são registrados no PostgreSQL, o que também impede replay entre réplicas da API.

No Ecossistema Ômega, cadastre o módulo com:

- URL: domínio público HTTPS do frontend;
- SSO habilitado;
- chave SSO: `lancamentos`;
- login externo de cada usuário: exatamente o `login` cadastrado neste sistema.

No serviço do Ecossistema configure:

```text
SSO_ISSUER=ecosistema-omega
SSO_SECRET_LANCAMENTOS=O-MESMO-SEGREDO-DO-BACKEND-COM-32-OU-MAIS-CARACTERES
SSO_AUDIENCE_LANCAMENTOS=lancamentos
SSO_TTL_LANCAMENTOS=45
```

`SSO_TTL_LANCAMENTOS` é opcional e aceita de 15 a 300 segundos. O valor recomendado é 45. O usuário administrador do Ecossistema também precisa ter um login externo mapeado; para acessar um usuário `ADMIN` deste sistema, o token precisa trazer `ecosystemIsAdmin=true`.

## Railway

Crie três serviços no mesmo projeto Railway e use exatamente estes nomes para que as referências abaixo funcionem:

1. `Postgres` — banco PostgreSQL;
2. `Backend` — repositório GitHub com diretório raiz `/backend`;
3. `Frontend` — mesmo repositório com diretório raiz `/frontend`.

Em **Settings → Config as Code**, use `/backend/railway.json` no Backend e `/frontend/railway.json` no Frontend. Gere um domínio público HTTPS para Backend e Frontend. O Postgres pode permanecer apenas na rede privada.

No backend configure:

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
PGSSLMODE=require
TZ=America/Fortaleza
CORS_ALLOWED_ORIGINS=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
AUTH_TOKEN_SECRET=SEGREDO-ALEATORIO-COM-32-OU-MAIS-CARACTERES
ADMIN_LOGIN=admin
ADMIN_PASSWORD=SENHA-INICIAL-FORTE
ADMIN_NOME=Administrador
ECOSYSTEM_SSO_ENABLED=true
ECOSYSTEM_SSO_ISSUER=ecosistema-omega
ECOSYSTEM_SSO_AUDIENCE=lancamentos
ECOSYSTEM_SSO_SHARED_SECRET=O-MESMO-SEGREDO-CONFIGURADO-NO-ECOSSISTEMA
CATALOG_SYNC_TOKEN=OUTRO-SEGREDO-ALEATORIO-COM-32-OU-MAIS-CARACTERES
```

No frontend configure:

```text
VITE_API_BASE_URL=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
```

`PORT` é fornecida automaticamente pelo Railway e não precisa ser criada manualmente. Como variáveis `VITE_*` entram no bundle durante o build, faça um novo deploy do frontend após alterá-las.

Use três segredos diferentes e aleatórios: um para `AUTH_TOKEN_SECRET`, outro para o par `ECOSYSTEM_SSO_SHARED_SECRET`/`SSO_SECRET_LANCAMENTOS` e um terceiro para `CATALOG_SYNC_TOKEN`. Nunca reutilize `SESSION_SECRET` do Ecossistema. Depois de validar o SSO, sele os segredos no painel do Railway.

## Sincronização dos catálogos WinThor

A DAG `lancamentos_catalogos_sync` fica em `airflow/lancamentos_catalogos_sync_dag.py` e executa no minuto 17 de cada hora. Ela consulta somente `PCGRUPO` e `PCCONTA`, sem alterar os bancos Oracle, e envia os dois catálogos para a API idempotente do sistema.

Crie estas conexões no Airflow:

- `lancamentos_oracle_filial`: host, porta, usuário, senha e service name do Oracle da filial;
- `lancamentos_oracle_matriz`: host, porta, usuário, senha e service name do Oracle da matriz;
- `lancamentos_catalog_sync`: host com a URL pública do backend e senha com o mesmo valor de `CATALOG_SYNC_TOKEN`.

O catálogo `MATRIZ` vale somente para a sede Ômega Matriz. O catálogo `FILIAL` vale para todas as demais sedes. O sincronizador grava apenas diferenças reais. Quando uma conta desaparece do Oracle, ela é apagada se nunca tiver sido usada; se existir lançamento relacionado, permanece no histórico com a origem marcada como ausente e fica bloqueada para novos lançamentos e orçamentos. A mesma regra é aplicada aos grupos.

Os grupos da filial `100, 101, 102, 103, 104, 202, 250, 404, 800, 990, 991, 992, 954, 995, 996, 997, 998 e 999` entram inativos por padrão, inclusive se reaparecerem no Oracle. O administrador pode reativá-los na aba Configurações. Alterações manuais de ativação ficam registradas na auditoria.

## Verificações

```powershell
npm run check
npm audit
```

`npm run check` executa TypeScript, ESLint e os dois builds de produção.
