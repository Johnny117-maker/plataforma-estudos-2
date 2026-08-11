# Instalação da IA híbrida

Esta atualização usa:

- Groq `llama-3.1-8b-instant` e `openai/gpt-oss-20b` para classificar texto;
- Gemini `gemini-3.5-flash-lite` somente para OCR e leitura de gráficos, tabelas, mapas e figuras;
- extração local para PDF com texto, DOCX, TXT e Markdown;
- cache de classificações já existente no Supabase.

## 1. Substituir os arquivos

Copie os arquivos do pacote para as mesmas pastas do projeto. Não copie chaves para `.env` e não use
`VITE_` nos nomes das chaves privadas.

## 2. Criar as chaves gratuitas

Crie uma chave na Groq e uma chave no Google AI Studio. Guarde ambas fora do Git e não envie as chaves
por mensagem, print ou commit.

## 3. Configurar o Supabase

No PowerShell, dentro do projeto:

```powershell
npx supabase login
npx supabase link --project-ref mbrjvcjyypymexadodnh

npx supabase secrets set GROQ_API_KEY="SUA_CHAVE_GROQ"
npx supabase secrets set GEMINI_API_KEY="SUA_CHAVE_GEMINI"
npx supabase secrets set GROQ_LLAMA_MODEL="llama-3.1-8b-instant" GROQ_GPT_OSS_MODEL="openai/gpt-oss-20b" GEMINI_MODEL="gemini-3.5-flash-lite"
npx supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://SEU_USUARIO.github.io"

npx supabase functions deploy ia
```

Em `ALLOWED_ORIGINS`, use apenas a origem (`https://SEU_USUARIO.github.io`), sem o caminho do
repositório. O `.env` do frontend continua contendo somente `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`.

## 4. Validar e publicar o frontend

```powershell
npm ci
npm run check

git add src/lib/iaService.js
git add src/lib/extrairTexto.js
git add src/lib/documentoVisual.js
git add src/lib/documentoVisual.test.js
git add src/lib/analiseProvas.js
git add src/pages/AnalisarProva.jsx
git add supabase/functions/ia/index.ts
git add README.md docs/SUPABASE.md .env.example INSTALACAO_IA_HIBRIDA.md

git commit -m "Adiciona Groq e Gemini para analise hibrida de provas"
git push origin main
```

## 5. Teste funcional

1. Envie um PDF normal: ele deve ser segmentado localmente e classificado pela Groq.
2. Envie um PDF escaneado: a tela deve mostrar `executando OCR e leitura visual com Gemini`.
3. Envie um PDF que cite gráfico ou figura: apenas as questões visuais devem receber a indicação
   `visual analisado pelo Gemini`.
4. Classifique novamente a mesma prova: as respostas já salvas devem vir do cache.
5. Gere o cronograma e confira matéria, assunto, datas e horas por dia.

## Comportamento dos modelos

Enquanto disponível, os lotes de texto alternam entre Llama e GPT-OSS para aproveitar os limites
gratuitos separados. Se um modelo falhar, a Edge Function tenta o outro automaticamente. A Groq
programou o desligamento do Llama 3.1 8B para 16/08/2026; a partir de 17/08/2026 o frontend passa a
selecionar somente GPT-OSS, sem exigir nova alteração de código.

O Gemini não é chamado em todo documento. Isso preserva a cota gratuita e evita enviar PDFs normais
quando a extração local já é suficiente.
