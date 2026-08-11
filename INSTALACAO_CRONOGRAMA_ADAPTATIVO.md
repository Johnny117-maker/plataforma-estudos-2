# Instalação do cronograma adaptativo

## 1. Atualizar o código

Extraia o pacote na raiz do projeto e permita substituir os arquivos existentes.
Não copie nenhum `.env` entre computadores; use o `.env.example` como modelo.

```powershell
cd C:\Users\jhgarcia\Projeto-estudos\plataforma-estudos-2
npm ci
npm run check
```

## 2. Aplicar o banco

Faça backup e valide primeiro em homologação.

```powershell
npx supabase login
npx supabase link --project-ref mbrjvcjyypymexadodnh
npx supabase db push --dry-run
npx supabase db push
```

A migration `202608110003_cronograma_adaptativo.sql` adiciona:

- disponibilidade semanal;
- prioridades por assunto;
- desempenho por tarefa;
- revisões e vínculos D+1/D+7/D+30;
- histórico de reorganizações;
- criação, desempenho e reorganização transacionais.

## 3. Configurar as IAs no servidor

```powershell
npx supabase secrets set GROQ_API_KEY="SUA_CHAVE_GROQ"
npx supabase secrets set GEMINI_API_KEY="SUA_CHAVE_GEMINI"
npx supabase secrets set GROQ_LLAMA_MODEL="llama-3.1-8b-instant" GROQ_GPT_OSS_MODEL="openai/gpt-oss-20b" GEMINI_MODEL="gemini-3.5-flash-lite"
npx supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://SEU_USUARIO.github.io"
npx supabase functions deploy ia
```

As chaves ficam somente nos secrets do Supabase. Elas não devem entrar no `.env`, GitHub ou frontend.

## 4. Fluxo de uso

1. Abra **Analisar múltiplas provas**.
2. Envie as provas, revise a extração e classifique a seleção.
3. No **Gerador adaptativo**, informe objetivo e data da prova.
4. Configure minutos e horário de cada dia da semana.
5. Ajuste o desempenho atual por assunto.
6. Confira a prévia e confirme.
7. Na aba **Hoje**, registre tempo, questões e acertos.
8. Use **Reorganizar cronograma** quando houver atrasos ou após a revisão semanal.

Resultado abaixo de 60% cria revisão extra D+2. Resultado de 60% a 79% mantém as revisões normais; a partir de 80%, nenhuma carga extra é criada.

## 5. Publicar

```powershell
git add .
git commit -m "Adiciona cronograma adaptativo com desempenho e revisoes"
git push origin main
```
