# Importação manual das provas FATEC

## Instalação

1. Extraia o ZIP dentro da pasta `plataforma-estudos-2`, mantendo as pastas `src/lib` e `src/pages`.
2. Se o Windows perguntar, confirme a substituição dos arquivos existentes.
3. Inicie normalmente:

   ```powershell
   npm run dev
   ```

4. Entre na plataforma e abra **Importar HTMLs / Importar dados**.
5. Na seção **Importar provas FATEC manualmente**, selecione os oito PDFs de provas e gabaritos.
6. Clique em **Conferir e importar os PDFs** e mantenha a página aberta até 100%.

## Resultado esperado

- 4 provas conferidas;
- 238 questões processadas;
- 66 questões com recurso visual completo;
- nenhuma questão ignorada;
- questões já existentes aparecem como duplicadas e não são copiadas novamente.

Se o banco contém exatamente as 21 questões da tentativa anterior, o resultado esperado é **217 novas + 21 já existentes**.

## Como esta rota funciona

- Não utiliza Gemini, Groq nem o `analise-worker`.
- A resposta e a disciplina são obtidas do gabarito correspondente.
- A estrutura de todos os PDFs é validada antes da primeira publicação.
- Gráficos, tabelas, mapas, diagramas e figuras são renderizados no navegador e enviados ao bucket privado `questoes-imagens`.
- Quando há um gráfico principal e um ícone decorativo, o recorte une o painel visual completo.
- Questões cujas alternativas são desenhos ou gráficos mantêm cinco escolhas A–E, vinculadas à imagem completa.
- A publicação é feita prova por prova e pode ser repetida; o banco deduplica as questões já existentes.

Não é necessário implantar novamente a função `analise-worker` para usar esta importação.
