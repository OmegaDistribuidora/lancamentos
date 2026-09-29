# Changelog

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
