# Análise de provas por visão (pipeline assíncrona)

Handoff da pipeline que analisa PDFs de prova **escaneados/imagem** com um modelo
de visão, extraindo questões estruturadas e recortando os elementos visuais.

## Causa do problema anterior

- A extração dependia 100% da **camada de texto** do PDF (no navegador). Provas
  **escaneadas ou em imagem** não têm camada de texto, então **não podiam ser
  analisadas** — não havia extração por visão no servidor.
- Ao construir a visão, o **primeiro teste end-to-end** revelou dois defeitos
  reais: (1) um **429 do Gemini** (cota gratuita) **derrubava o job inteiro**,
  porque qualquer erro do provedor era tratado como fatal; (2) rodar visão em
  **todas** as páginas é caro e desnecessário para provas com texto nativo.
- Um bloqueio de infraestrutura: duas migrações compartilhavam o número
  `202608110003`, quebrando o `supabase db push` (duplicate key no histórico).

## Arquitetura adotada

Renderização **no navegador** (o Deno do edge não rasteriza PDF — sem canvas
nativo), processamento assíncrono no worker, roteamento em duas camadas para
gastar visão só onde precisa.

```
Navegador (/provas-visao)
  ├─ avalia o PDF: texto nativo → orienta a usar /provas (texto, grátis)
  ├─ escaneado → renderiza cada página em PNG (180–220 DPI)
  ├─ sobe PDF + PNGs ao bucket privado provas-visao
  └─ cria analysis_jobs (pending) + acorda o worker
                    │
Worker (edge: analise-visao-worker) — cron 1/min + auto-continuação
  ├─ reivindica job (claim atômico FOR UPDATE SKIP LOCKED)
  ├─ baixa PDF, extrai texto por página (unpdf, sem canvas nativo)
  └─ por página (orçamento de páginas/tempo, 3s de ritmo):
       ├─ texto nativo (≥200 chars) → extração SÓ TEXTO (Flash-Lite, barato)
       └─ escaneada → VISÃO (Gemini Flash: texto+imagem) + recorte (ImageScript)
                        → salva recortes no bucket
     ↳ 429 → pausa (não falha); cron/auto-continuação retomam sem perder nada
```

## Arquivos criados

- `src/lib/provaVisao.js` — render de páginas, upload, criação de job, avaliação
  texto-nativo/escaneado, helpers puros (DPI, caminhos, bbox→pixels, resumo).
- `src/lib/provaVisao.test.js` — testes dos helpers puros.
- `src/pages/AnalisarProvaVisao.jsx` — tela de upload, avaliação, progresso.
- `supabase/functions/analise-visao-worker/index.ts` — o worker.
- `supabase/migrations/202608130001_analysis_jobs_visao.sql`
- `supabase/migrations/202608130002_analysis_worker.sql`
- `supabase/setup/CONFIGURAR_ANALISE_VISAO_WORKER_CRON.sql`

## Arquivos modificados

- `src/App.jsx` — rota `/provas-visao`.
- `src/components/Sidebar.jsx` — link "Analisar Prova (visão)".
- `supabase/config.toml` — registra `analise-visao-worker` (`verify_jwt = true`).
- `supabase/migrations/202608110003_cronograma_adaptativo.sql` → renomeado para
  `202608110006_cronograma_adaptativo.sql` (corrige o número duplicado).

## Migrations adicionadas

1. `202608130001_analysis_jobs_visao.sql` — bucket privado `provas-visao` (RLS
   por pasta de usuário), tabela `analysis_jobs` (RLS forçado, writes revogados),
   RPC `criar_analysis_job` (security definer, força `user_id`/`status`).
2. `202608130002_analysis_worker.sql` — RPCs `reivindicar_analysis_job`,
   `anexar_pagina_analysis_job`, `falhar_analysis_job` (só `service_role`).
3. (correção) rename de `202608110003_cronograma_adaptativo` para `202608110006`,
   com `supabase migration repair` reconciliando o histórico remoto.

## Variáveis de ambiente necessárias

**Frontend (`.env`):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Secrets da Edge Function (Supabase):**
- `GEMINI_API_KEY` (obrigatório)
- `GEMINI_FLASH_MODEL` (visão), `GEMINI_FLASH_LITE_MODEL` ou `GEMINI_MODEL` (texto)
- `GROQ_API_KEY` (opcional): usado no caminho **só-texto** (cota separada do
  Gemini); se ausente ou limitado, o worker cai para o Gemini Flash-Lite.
  `GROQ_GPT_OSS_MODEL` ajusta o modelo (padrão `openai/gpt-oss-20b`).
- `ALLOWED_ORIGINS`
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

**Vault (criados pelo SQL do cron):**
- `analise_visao_worker_project_url`, `analise_visao_worker_publishable_key`

## Comandos que preciso executar

```bash
# 1. migrações (bucket + tabela + RPCs)
supabase db push

# 2. deploy do worker
supabase functions deploy analise-visao-worker

# 3. cron: editar SEU_PROJECT_REF e a anon key e rodar no SQL Editor:
#    supabase/setup/CONFIGURAR_ANALISE_VISAO_WORKER_CRON.sql

# 4. frontend (ou via CI do GitHub Pages ao mergear na main):
npm run build
```

## Como iniciar o worker

- **Automático:** o cron chama o worker a cada minuto.
- **Sob demanda:** o cliente chama `acordarWorkerVisao()` logo após criar o job.
- **Manual:** `POST {PROJECT_URL}/functions/v1/analise-visao-worker` com a anon
  key nos headers `apikey` e `Authorization: Bearer`.
- O worker se **auto-continua** (re-invoca) quando um job não cabe numa execução.

## Como acompanhar um job

- **Na tela** `/provas-visao`: a lista de jobs atualiza sozinha (polling) com
  status e páginas processadas.
- **Por SQL:**
  ```sql
  select id, status, paginas_processadas, total_paginas, erro
  from public.analysis_jobs order by created_at desc;
  ```
- O resultado por página fica em `analysis_jobs.resultado` (JSONB), cada questão
  com `origem` (`texto_nativo` | `visao`), `alternativas` e `imagens` (recortes).

## Testes realizados e resultados

- **Spike no runtime Deno** (proxy do edge): recorte com ImageScript OK;
  extração de texto com `unpdf` OK e **sem dependência nativa** (o `pdfjs` cru
  arrastava `@napi-rs/canvas`, incompatível com o edge — por isso `unpdf`).
- **`npm run check`**: lint OK, **71 testes** OK, build OK.
- **`deno check`** no worker: type-clean.
- **End-to-end em homologação** (1 prova, 24 páginas): **25 questões** extraídas
  (5 alternativas cada), **8 recortes** salvos no Storage, página 1 (capa)
  corretamente com 0 questões. **429 tratado**: o job pausou em 9/24 sem perder
  progresso, em vez de falhar. Storage confirmado: 1 PDF + 24 PNGs + 8 recortes.

## Limitações que ainda existem

- **Cota gratuita do Gemini** é o gargalo de throughput: 429 pausa o job; ele
  avança em "gotas" (poucas páginas/min) e pode depender do reset diário. Um
  **tier pago** remove esse limite.
- A avaliação no upload é **por PDF** (média de caracteres/página); PDFs **mistos**
  são roteados pela média — mas, uma vez na visão, o **híbrido por página** já
  trata cada página individualmente.
- A extração de página com texto nativo ainda usa **1 chamada Flash-Lite por
  página** (barata, mas não gratuita).
- O worker (Deno) **não tem teste unitário** (como as outras edge functions);
  validado por spike + `deno check` + teste e2e real.
- A **precisão dos bboxes** dos recortes não foi verificada visualmente.
- O **PDF de teste** em `.../Provas e Gabaritos/teste/` tem **texto nativo**;
  para exercitar a visão de verdade, use um PDF **escaneado**.

## Passo a passo para colocar a solução online

1. Configurar secrets: `GEMINI_API_KEY`, `GEMINI_FLASH_MODEL`,
   `GEMINI_FLASH_LITE_MODEL` (ou `GEMINI_MODEL`), `ALLOWED_ORIGINS`.
2. `supabase db push` (aplica as migrações).
3. `supabase functions deploy analise-visao-worker`.
4. Editar e rodar `supabase/setup/CONFIGURAR_ANALISE_VISAO_WORKER_CRON.sql`.
5. Publicar o frontend (merge na `main` dispara o `deploy.yml`, ou `npm run build`).
6. Testar com um **PDF escaneado** em `/provas-visao` e acompanhar o job.
