# Análise assíncrona com Supabase Queue e Gemini

Esta atualização substitui a sequência de chamadas controlada pelo navegador por jobs persistentes.

## Arquitetura entregue

```text
Frontend cria job
→ RPC transacional cria lotes
→ Supabase Queue (pgmq)
→ analise-worker
→ Flash-Lite / Flash / Groq opcional
→ resultado gravado por lote
→ tela consulta o progresso e restaura o snapshot
```

O modo automático usa fila rápida até 799 conteúdos e Gemini Batch a partir de 800. O usuário pode forçar qualquer um dos modos.

- Gemini Flash-Lite: classificação textual padrão.
- Gemini Flash: questões visuais e resultados com confiança abaixo de 0,62.
- Gemini Batch: análises muito grandes; se falhar, os lotes pendentes voltam para a fila rápida.
- Groq: acelerador opcional de parte dos lotes textuais; nunca é dependência.

## 1. Instalar e validar o frontend

Na raiz do projeto:

```powershell
npm ci
npm run check
```

## 2. Aplicar a migration

```powershell
npx supabase link --project-ref mbrjvcjyypymexadodnh
npx supabase db push
```

A migration `202608110004_analise_assincrona.sql` cria:

- extensões `pgmq`, `pg_net` e `pg_cron`;
- queue durável `analise_classificacao`;
- tabelas `analise_jobs` e `analise_lotes`;
- RLS de leitura por usuário;
- RPC de criação/cancelamento;
- RPCs internas do worker para ler, concluir, arquivar e reagendar mensagens.

O Supabase Queues exige uma versão do Postgres compatível com `pgmq`. Em projetos Supabase atuais, a extensão já está disponível.

## 3. Configurar as IAs

```powershell
npx supabase secrets set GEMINI_API_KEY="SUA_CHAVE_GEMINI"
npx supabase secrets set GEMINI_FLASH_LITE_MODEL="gemini-3.5-flash-lite"
npx supabase secrets set GEMINI_FLASH_MODEL="gemini-3.5-flash"
```

A Groq é opcional:

```powershell
npx supabase secrets set GROQ_API_KEY="SUA_CHAVE_GROQ"
```

Não coloque nenhuma dessas chaves no `.env` do frontend.

## 4. Publicar as Edge Functions

```powershell
npx supabase functions deploy ia
npx supabase functions deploy analise-worker
```

As duas funções permanecem com `verify_jwt = true`.

## 5. Ativar a retomada automática a cada minuto

Abra:

`supabase/setup/CONFIGURAR_ANALISE_WORKER_CRON.sql`

Substitua:

- `SEU_PROJECT_REF` pelo identificador do projeto;
- `SUA_CHAVE_PUBLICAVEL_OU_ANON` pela mesma chave pública usada em `VITE_SUPABASE_ANON_KEY`.

Execute o arquivo no **SQL Editor** do Supabase. A URL e a chave ficam criptografadas no Vault. Não use a `service_role` nesse script.

O frontend aciona o worker imediatamente e o worker se auto-invoca enquanto houver lotes. O cron é a rede de segurança: se uma instância for encerrada no meio da execução, ele acorda a fila novamente no minuto seguinte.

Documentação oficial usada na implementação:

- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/queues/consuming-messages-with-edge-functions
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/functions/schedule-functions
- https://ai.google.dev/gemini-api/docs/batch-api

## 6. Publicar o frontend

Execute o mesmo processo de deploy já usado pelo projeto depois de confirmar:

```powershell
npm run build
```

## Verificações no Supabase

Jobs recentes:

```sql
select id, nome, status, modo_efetivo, total_itens,
       itens_concluidos, itens_falhos, provedores, updated_at
from public.analise_jobs
order by created_at desc
limit 20;
```

Lotes de um job:

```sql
select ordem, status, tentativas, provedor, modelo, erro
from public.analise_lotes
where job_id = 'UUID_DO_JOB'
order by ordem;
```

Cron:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'processar-analise-queue-cada-minuto';
```

## Comportamento de recuperação

- `429`: mensagem volta à queue com atraso e `proxima_tentativa`.
- Chamadas de IA acima de 70 segundos: são interrompidas e reagendadas automaticamente.
- Encerramento inesperado do worker: lotes em `processando` há mais de três minutos são recolocados na fila.
- Tela aberta com job ativo: envia um pulso ao worker a cada 30 segundos.
- Botão **Retomar agora**: permite acionar a fila manualmente sem criar outro job e sem perder os lotes concluídos.
- Resposta incompleta: o lote é tentado novamente sem apagar os já concluídos.
- Baixa confiança: somente os itens ambíguos são refinados pelo Flash.
- Falha do Groq: o mesmo lote segue pelo Flash-Lite.
- Falha/expiração do Batch: somente lotes pendentes migram para a fila rápida.
- Navegador fechado: job, snapshot, progresso e resultados continuam no banco.

## Se o percentual ficar parado

Depois de atualizar o projeto, publique novamente o worker:

```powershell
npx supabase functions deploy analise-worker
```

Publique também o frontend. Abra **Analisar provas**, localize o processamento ativo e clique em
**Retomar agora**. O mesmo job continuará do percentual salvo; não é necessário enviar as provas ou
criar outra classificação.
