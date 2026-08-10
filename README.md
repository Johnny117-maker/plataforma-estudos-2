# Plataforma de Estudos

Aplicação web pessoal para organizar cronogramas, tarefas, matérias, questões, notas em blocos, datas importantes e análises comparativas de provas.

## Estado atual

Esta versão inclui:

- autenticação pelo Supabase;
- cronogramas em lista, Kanban, calendário e timeline;
- criação, importação, duplicação e reorganização atômicas;
- perguntas de múltipla escolha, verdadeiro/falso e dissertativas;
- upload simultâneo de até 20 provas PDF, DOCX, TXT ou Markdown;
- extração local, segmentação, classificação em lotes por IA e cruzamento de assuntos;
- persistência de documentos, questões classificadas e frequências;
- geração automática de cronograma com prioridade baseada na recorrência;
- notas hierárquicas em blocos;
- RLS, integridade multiusuário, testes, lint, CI e carregamento por rota.

PDFs compostos apenas por imagens ainda exigem OCR externo; o sistema os identifica e não envia conteúdo vazio para a IA.

## Arquitetura

```mermaid
flowchart TD
  UI[React + Vite] --> LOCAL[PDF.js + Mammoth]
  UI --> SDK[Supabase SDK]
  SDK --> DB[PostgreSQL + RLS + RPCs]
  SDK --> EDGE[Edge Function IA]
  EDGE --> GROQ[Groq API]
```

- O navegador extrai e segmenta os documentos.
- A Edge Function recebe lotes pequenos e mantém a chave da Groq no servidor.
- Operações com várias inserções são executadas por funções PostgreSQL transacionais.
- O frontend nunca escolhe o `user_id` usado pelas RPCs; ele é obtido de `auth.uid()`.

## Requisitos

- Node.js 20+
- npm 10+
- projeto Supabase
- Supabase CLI para aplicar migrações e publicar a função
- chave de API Groq para as funções de IA

## Instalação

```bash
npm ci
cp .env.example .env
```

Preencha:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

Nunca coloque `service_role`, `GROQ_API_KEY` ou qualquer chave privada no `.env` do frontend.

## Banco de dados

Faça backup do banco antes de atualizar uma instalação existente.

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

As migrações são executadas em ordem:

1. `202608100001_schema_hardened.sql`: tabelas, migração dos campos antigos, constraints, chaves, índices, triggers, RLS e views seguras.
2. `202608100002_transactional_rpcs.sql`: funções transacionais usadas pelo frontend.

O primeiro arquivo copia `data_alvo` para `data_final` e `ritmo_horas_dia` para `horas_por_dia` antes de remover as colunas antigas. Se encontrar relações pertencentes a usuários diferentes, a migração para com uma mensagem em vez de alterar silenciosamente os dados.

Consulte [docs/SUPABASE.md](docs/SUPABASE.md) antes de aplicar em produção.

## Edge Function

Configure os segredos e publique:

```bash
supabase secrets set GROQ_API_KEY=SUA_CHAVE
supabase secrets set ALLOWED_ORIGINS=https://seu-dominio.com
supabase functions deploy ia
```

`ALLOWED_ORIGINS` aceita uma lista separada por vírgulas. A verificação JWT permanece habilitada.

## Desenvolvimento

```bash
npm run dev
```

Verificações disponíveis:

```bash
npm run lint
npm run test
npm run build
npm run check
```

## Análise de provas

1. Cadastre matérias e assuntos para melhorar a correspondência por IDs.
2. Abra **Analisar múltiplas provas**.
3. Envie de 1 a 20 arquivos, com até 25 MB cada.
4. Revise o total de questões e os avisos de segmentação.
5. Clique em **Classificar com IA**.
6. Confira a tabela cruzada de matéria, assunto, número de provas e frequência.
7. Salve a análise.
8. Informe início, fim e horas por dia para gerar o cronograma.

O peso usado na priorização combina quantidade de questões e presença em documentos diferentes. Assim, repetição dentro de uma única prova não vale o mesmo que recorrência em várias provas.

## Segurança

- Todas as 13 tabelas de usuário usam RLS forçado.
- As views utilizam `security_invoker=true`.
- Relações obrigatórias usam chaves compostas com `user_id`.
- Relações opcionais são verificadas por trigger.
- RPCs ignoram `user_id` enviado pelo cliente.
- A Edge Function limita origem, tamanho, timeout, lote e tokens.
- Erros do provedor não são devolvidos integralmente ao navegador.

## Estrutura

```text
src/
  components/          componentes e modais
  lib/                 extração, segmentação, IA, transações e testes
  pages/               páginas carregadas sob demanda
supabase/
  functions/ia/        única Edge Function canônica
  migrations/          schema e RPCs versionados
docs/                  arquitetura e implantação
```

## Deploy

O workflow em `.github/workflows/deploy.yml` executa lint, testes e build antes do GitHub Pages. Cadastre os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no GitHub.

O `base` do Vite está configurado como `/plataforma-estudos/`. Ajuste `vite.config.js` caso o nome do repositório ou o domínio seja diferente.

## Limitações conhecidas

- Sem OCR integrado para PDFs digitalizados.
- A classificação depende da disponibilidade e da cota do provedor de IA.
- Questões que dependem de imagens, gráficos ou tabelas são marcadas para revisão humana.
- A migração precisa ser validada em um projeto Supabase de homologação antes de ser aplicada ao banco principal.
