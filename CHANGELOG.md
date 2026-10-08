# Changelog

## 1.3.1 — 2026-10-08

- correção da entrada de valores em lançamentos para que dígitos adicionais permaneçam na parte inteira;
- centavos passam a ser informados explicitamente após vírgula ou ponto, mantendo frontend e backend consistentes.

## 1.3.0 — 2026-10-07

- catálogo de grupos e contas da matriz importado diretamente de `PCGRUPO` e `PCCONTA`;
- catálogo contábil separado por sede: Ômega Matriz usa a matriz e as demais sedes preservam a filial;
- orçamentos da Ômega Matriz limitados exclusivamente às contas da matriz;
- lançamentos históricos preservados e liberados para realocação auditada ao catálogo correto;
- sincronização horária e idempotente de `PCGRUPO` e `PCCONTA` da matriz e da filial por Airflow;
- remoção segura de contas e grupos ausentes na origem, preservando e bloqueando itens com histórico;
- configuração administrativa para ativar ou inativar grupos e contas individualmente;
- auditoria das ativações e inativações manuais do catálogo contábil.

## 1.2.0 — 2026-09-29

- zeramento único dos orçamentos existentes e novo valor padrão em R$ 0,00;
- auditoria liberada para administração, gerência administrativa e diretoria;
- filtro combinado de grupo e contas, com seleção individual ou múltipla;
- menus dos filtros de lançamentos redesenhados no estilo visual do sistema.

## 1.1.0 — 2026-09-29

- centros de custo vinculados individualmente às sedes, com seleção dependente no lançamento;
- correção do nome da sede `Realleza` e migração segura dos lançamentos existentes;
- bloqueio de datas de pagamento futuras no frontend e na API;
- atualização imediata dos indicadores após salvar lançamentos ou orçamentos.

## 1.0.1 — 2026-09-29

- liberação segura dos domínios `*.up.railway.app` no servidor de preview do frontend;
- ajustes finais de configuração para o primeiro deploy no Railway.

## 1.0.0 — 2026-09-29

- aplicação inicial com frontend React, API Fastify e PostgreSQL;
- lançamentos por usuário, permissões de gestores e auditoria administrativa;
- grupos e contas fixos da base filial;
- orçamentos por conta, sede e competência, com vigência automática para os meses seguintes;
- dashboard, filtros, KPIs e gráficos adaptativos;
- exportação filtrada em Excel e PDF;
- autenticação local para desenvolvimento e SSO delegado do Ecossistema Ômega em produção;
- configuração de deploy independente de frontend e backend no Railway.
