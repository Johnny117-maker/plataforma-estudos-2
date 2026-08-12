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

Esse comando também publica a limpeza controlada do banco e a publicação
atômica das imagens (`202608120003_limpeza_banco_e_imagens_atomicas.sql`).

## Recomeçar o banco depois de uma extração incorreta

Depois de aplicar as migrations e publicar o frontend, abra **Perguntas e
Respostas** e clique em **Limpar banco de questões**. Confirme a mensagem e
digite `LIMPAR`.

A limpeza remove somente perguntas, simulados, respostas, provas, gabaritos e
arquivos do bucket `questoes-imagens` pertencentes ao usuário conectado.
Matérias, cronogramas e análises de provas são preservados.

Questões que dependem de figura só ficam prontas para publicação quando a
figura tiver sido isolada e armazenada. Se o PDF não permitir um recorte
seguro, a questão permanece em revisão e não entra incompleta no quiz.

A migração nova é:

```text
supabase/migrations/202608110005_banco_questoes_provas.sql
```

Ela cria as tabelas de provas, versões do gabarito e testes, acrescenta a origem nas perguntas e mantém os registros antigos.

A migração `202608120001_corrige_search_path_pgcrypto.sql` corrige a resolução da função `digest()` em projetos Supabase que mantêm o `pgcrypto` no schema `extensions`.

A migração `202608120002_imagens_questoes.sql` cria o armazenamento privado dos recortes das questões e a função que associa cada imagem à pergunta publicada.

## 2. Publicar o frontend

```powershell
npm ci
npm run check
git add README.md INSTALACAO_BANCO_QUESTOES.md docs src supabase/migrations
git commit -m "Adiciona banco de questoes extraidas de provas"
git push origin main
```

Não envie o arquivo `.env` ao GitHub.

## 3. Usar a funcionalidade

1. Abra **Analisar múltiplas provas**.
2. Selecione **Próximo arquivo: prova** e envie o caderno.
3. Mantenha marcada a opção **Extrair figuras e gráficos das questões**.
4. Selecione **Próximo arquivo: gabarito** e envie o gabarito correspondente.
5. Confira o gabarito vinculado à prova e a prévia de cada recorte.
6. Classifique as questões em segundo plano.
7. Revise as pendências em vermelho, principalmente questões visuais.
8. Clique em **Publicar no banco de questões**.
9. Abra **Perguntas e respostas** para gerar um teste com as figuras isoladas das questões.

## 4. Regras de publicação

Uma questão só entra no banco quando possui:

- número original;
- enunciado com conteúdo suficiente;
- cinco alternativas;
- resposta A, B, C, D ou E;
- matéria classificada;
- revisão do elemento visual quando necessário.

O hash do enunciado impede que o mesmo usuário importe uma segunda cópia da mesma questão. Quando o gabarito contém retificação, a última resposta encontrada é usada e a versão fica registrada.
