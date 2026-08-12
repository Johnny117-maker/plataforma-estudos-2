# Instalação — banco de questões de provas

Esta atualização permite enviar uma prova e seu gabarito, revisar a extração, publicar as questões e reutilizá-las em testes futuros.

## 1. Atualizar o banco

Na raiz do projeto, execute no PowerShell:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

A migração nova é:

```text
supabase/migrations/202608110005_banco_questoes_provas.sql
```

Ela cria as tabelas de provas, versões do gabarito e testes, acrescenta a origem nas perguntas e mantém os registros antigos.

## 2. Publicar o frontend

```powershell
npm ci
npm run check
git add README.md INSTALACAO_BANCO_QUESTOES.md docs src supabase/migrations/202608110005_banco_questoes_provas.sql
git commit -m "Adiciona banco de questoes extraidas de provas"
git push origin main
```

Não envie o arquivo `.env` ao GitHub.

## 3. Usar a funcionalidade

1. Abra **Analisar múltiplas provas**.
2. Selecione **Próximo arquivo: prova** e envie o caderno.
3. Selecione **Próximo arquivo: gabarito** e envie o gabarito correspondente.
4. Confira o gabarito vinculado à prova.
5. Classifique as questões em segundo plano.
6. Revise as pendências em vermelho, principalmente questões visuais.
7. Clique em **Publicar no banco de questões**.
8. Abra **Perguntas e respostas** para gerar um teste.

## 4. Regras de publicação

Uma questão só entra no banco quando possui:

- número original;
- enunciado com conteúdo suficiente;
- cinco alternativas;
- resposta A, B, C, D ou E;
- matéria classificada;
- revisão do elemento visual quando necessário.

O hash do enunciado impede que o mesmo usuário importe uma segunda cópia da mesma questão. Quando o gabarito contém retificação, a última resposta encontrada é usada e a versão fica registrada.
