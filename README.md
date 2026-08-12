# Plataforma de Estudos

Aplicação web pessoal para organizar cronogramas, tarefas, matérias, questões, notas em blocos, datas importantes e análises comparativas de provas.

## Estado atual

Esta versão inclui:

- autenticação pelo Supabase;
- cronogramas em lista, Kanban, calendário e timeline;
- criação, importação, duplicação e reorganização atômicas;
- perguntas de múltipla escolha, verdadeiro/falso e dissertativas;
- upload simultâneo de até 20 provas PDF, DOCX, TXT ou Markdown;
- upload separado de provas e gabaritos, vínculo automático por instituição/ano/semestre e correção manual;
- extração local, seleção por arquivo e por conteúdo, classificação em lotes por IA e cruzamento de assuntos;
- banco reutilizável com prevenção de duplicatas, origem da questão, versão do gabarito e fila de revisão;
- simulados aleatórios, por prova, por matéria ou priorizando erros e questões ainda não respondidas;
- combinação de questões, trechos extraídos e conteúdos complementares de uma ou várias provas;
- persistência de documentos, questões classificadas e frequências;
- geração automática de cronograma com prioridade baseada na recorrência;
- gerador adaptativo em cinco etapas, com disponibilidade por dia, meta de acertos e prévia;
- fases proporcionais ao prazo, margem de 15%, revisões D+1/D+7/D+30, redações e simulados;
- registro de desempenho, revisão extra D+2 e reorganização semanal sem mover tarefas fixas;
- Supabase Queue com classificação persistente em segundo plano;
- Flash-Lite como classificador principal, Flash para conteúdo visual/ambíguo, Batch para alto volume e Groq opcional;
- notas hierárquicas em blocos;
- RLS, integridade multiusuário, testes, lint, CI e carregamento por rota.

PDFs compostos por imagens são encaminhados ao Gemini para OCR; gráficos, tabelas e figuras também podem ser descritos pelo modelo visual.

## Arquitetura

```mermaid
flowchart TD
  UI[React + Vite] --> LOCAL[PDF.js + Mammoth]
  UI --> SDK[Supabase SDK]
  SDK --> DB[PostgreSQL + RLS + RPCs]
  DB --> QUEUE[Supabase Queue]
  QUEUE --> WORKER[Worker assíncrono]
  WORKER --> GEMINI[Gemini Lite, Flash e Batch]
  WORKER --> GROQ[Groq opcional]
```

- O navegador extrai e segmenta os documentos.
- O worker recebe lotes persistidos; nenhuma chave de IA chega ao navegador.
- Operações com várias inserções são executadas por funções PostgreSQL transacionais.
- O frontend nunca escolhe o `user_id` usado pelas RPCs; ele é obtido de `auth.uid()`.

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm 10+
- projeto Supabase
- Supabase CLI para aplicar migrações e publicar a função
- chaves gratuitas da Groq e do Gemini para classificação, OCR e análise visual

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
3. `202608110001_cronograma_sem_ia.sql`: fallback quando a classificação ainda não terminou.
4. `202608110002_cache_classificacao.sql`: cache por hash das questões.
5. `202608110003_cronograma_adaptativo.sql`: disponibilidade, prioridades, desempenho, revisões e RPCs adaptativas.
6. `202608110004_analise_assincrona.sql`: jobs, lotes, Supabase Queue, RLS e RPCs do worker.
7. `202608110005_banco_questoes_provas.sql`: provas, versões de gabarito, publicação de questões e testes persistentes.

O primeiro arquivo copia `data_alvo` para `data_final` e `ritmo_horas_dia` para `horas_por_dia` antes de remover as colunas antigas. Se encontrar relações pertencentes a usuários diferentes, a migração para com uma mensagem em vez de alterar silenciosamente os dados.

Consulte [docs/SUPABASE.md](docs/SUPABASE.md) antes de aplicar em produção.

## Edge Function

Configure os segredos e publique:

```bash
supabase secrets set GEMINI_API_KEY="SUA_CHAVE_GEMINI"
supabase secrets set GEMINI_FLASH_LITE_MODEL="gemini-3.5-flash-lite" GEMINI_FLASH_MODEL="gemini-3.5-flash"
supabase secrets set GROQ_API_KEY="SUA_CHAVE_GROQ"
supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://seu-dominio.com"
supabase functions deploy ia
supabase functions deploy analise-worker
```

`GROQ_API_KEY` é opcional. Depois do deploy, configure o cron com
`supabase/setup/CONFIGURAR_ANALISE_WORKER_CRON.sql`. Consulte
[INSTALACAO_ANALISE_ASSINCRONA.md](INSTALACAO_ANALISE_ASSINCRONA.md).

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
3. Selecione **Próximo arquivo: prova** e envie os cadernos.
4. Selecione **Próximo arquivo: gabarito** e envie os respectivos gabaritos.
5. Confira o vínculo sugerido em cada prova e corrija respostas detectadas quando necessário.
6. Abra **Revisar e escolher conteúdos** em cada arquivo.
7. Marque uma ou várias questões/trechos, edite o texto quando necessário ou use **Adicionar conteúdo**.
8. Escolha **Automático**, **Fila rápida** ou **Gemini Batch** e clique em **Classificar em segundo plano**.
9. Resolva as pendências indicadas e clique em **Publicar no banco de questões**.
10. Abra **Perguntas e respostas**, escolha prova/matéria/estratégia e gere um teste.
11. Para o cronograma, salve os conteúdos e continue pelo assistente de planejamento.

Quando a numeração das questões não é reconhecida, o texto é dividido automaticamente em trechos selecionáveis de até 3.000 caracteres. Somente os arquivos e conteúdos escolhidos são enviados para classificação e persistidos na análise; conteúdos desmarcados não influenciam a frequência nem o cronograma.

O peso usado na priorização combina quantidade de questões e presença em documentos diferentes. Assim, repetição dentro de uma única prova não vale o mesmo que recorrência em várias provas.

### Classificação resiliente

O frontend cria o job e pode ser fechado. Cada lote permanece na Supabase Queue até o resultado estar salvo.

- Flash-Lite classifica até 24 conteúdos textuais por lote.
- Flash recebe lotes visuais e refina somente classificações abaixo de 0,62.
- O modo automático escolhe Gemini Batch a partir de 800 conteúdos.
- Batch incompleto, expirado ou indisponível volta para a fila rápida sem perder lotes concluídos.
- Groq acelera opcionalmente parte dos lotes textuais; qualquer falha segue pelo Gemini.
- `429` respeita atraso e retomada, sem clique do usuário.
- Snapshot, contadores e resultados persistem para restauração após recarregar a página.

## Segurança

- Todas as tabelas de usuário usam RLS forçado.
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
  functions/ia/        roteador protegido dos provedores
  functions/analise-worker/ consumidor da fila e orquestrador Batch
  migrations/          schema e RPCs versionados
  setup/               configuração segura do cron no Vault
docs/                  arquitetura e implantação
```

## Deploy

O workflow em `.github/workflows/deploy.yml` executa lint, testes e build antes do GitHub Pages. Cadastre os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no GitHub.

O `base` do Vite está configurado como `/plataforma-estudos/`. Ajuste `vite.config.js` caso o nome do repositório ou o domínio seja diferente.

## Limitações conhecidas

- OCR e análise visual dependem da cota gratuita configurada no Gemini.
- A classificação depende da disponibilidade e da cota do provedor de IA.
- Questões que dependem de imagens, gráficos ou tabelas são marcadas para revisão humana.
- A migração precisa ser validada em um projeto Supabase de homologação antes de ser aplicada ao banco principal.
