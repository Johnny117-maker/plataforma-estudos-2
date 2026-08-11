# Correções — cronograma baseado em provas

Este pacote contém somente os arquivos que precisam ser substituídos no projeto
`plataforma-estudos-2`.

## O que foi corrigido

- falha do limitador local quando uma única chamada ultrapassa 2.500 tokens;
- classificação de várias provas usando o contexto correto de cada documento;
- continuação da classificação quando o cache ainda não estiver publicado;
- preenchimento automático do cache por hash no PostgreSQL;
- Edge Function de classificação com lotes menores e resposta JSON controlada;
- caminho do GitHub Pages alterado para `/plataforma-estudos-2/`.

## 1. Substituir os arquivos

Copie o conteúdo deste pacote por cima da raiz do seu projeto, preservando as
pastas. Os arquivos são:

- `src/lib/iaService.js`
- `src/pages/AnalisarProva.jsx`
- `supabase/functions/ia/index.ts`
- `supabase/migrations/202608110002_cache_classificacao.sql`
- `vite.config.js`

Não copie nenhum `.env` para o GitHub.

## 2. Configurar o frontend

Na raiz do projeto, crie `.env` com apenas as chaves públicas:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

Não coloque `GROQ_API_KEY` nem `service_role` nesse arquivo.

## 3. Aplicar banco e Edge Function

Abra o PowerShell na raiz do projeto:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase secrets set GROQ_API_KEY="SUA_CHAVE_GROQ" ALLOWED_ORIGINS="https://SEU_USUARIO.github.io"
npx supabase functions deploy ia
```

Em `ALLOWED_ORIGINS`, informe somente a origem, sem o caminho do repositório.

## 4. Verificar

```powershell
npm ci
npm run lint
npm test -- --run
npm run build
```

## 5. Enviar ao GitHub

```powershell
git status
git add src/lib/iaService.js src/pages/AnalisarProva.jsx supabase/functions/ia/index.ts supabase/migrations/202608110002_cache_classificacao.sql vite.config.js
git commit -m "Corrige analise de provas e geracao de cronograma"
git push origin main
```

Evite `git add .` enquanto existirem dezenas de alterações causadas somente por
CRLF/LF.
