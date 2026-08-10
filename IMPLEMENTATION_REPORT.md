# Relatório de implementação

## Atualização: cronograma por conteúdo selecionado

O analisador de provas agora permite combinar um ou mais conteúdos de um ou mais arquivos antes de gerar o cronograma:

- novos envios são acrescentados à análise atual;
- arquivos duplicados são identificados por SHA-256 e ignorados;
- cada arquivo pode ser incluído ou excluído;
- cada questão ou trecho pode ser selecionado individualmente;
- o texto selecionado pode ser revisado e editado;
- conteúdos complementares podem ser adicionados ao arquivo;
- documentos sem questões reconhecidas são divididos em trechos de até 3.000 caracteres;
- somente a seleção é classificada, persistida e considerada nas frequências;
- o cronograma continua sendo criado pela RPC transacional existente.

Não foi necessária uma nova migration. Os conteúdos utilizam `questoes_extraidas` e registram sua origem em `metadados.origem` como `questao_detectada`, `trecho_extraido` ou `conteudo_adicionado`.

## Escopo concluído

| Item | Resultado |
|---|---|
| 1. Migrações Supabase | 13 tabelas protegidas, RLS forçado, FKs compostas, triggers, constraints, índices e views seguras |
| 2. Edge Function | Fonte única, UTF-8 corrigido, JWT, CORS, validação, timeout, limites e classificação em lotes |
| 3. Transações | 5 RPCs atômicas para criar, duplicar, reorganizar, salvar análise e gerar cronograma |
| 4. Quiz | Verdadeiro/falso persistido corretamente e dissertativas com resposta escrita e autoavaliação |
| 5. Múltiplas provas | Até 20 arquivos, extração sequencial, segmentação e cruzamento entre documentos |
| 6. IA e persistência | Classificação por matéria/assunto/dificuldade/confiança e armazenamento completo |
| 7. Cronograma automático | Priorização pela recorrência e geração transacional |
| 8. Qualidade | ESLint, Vitest, CI, CSS responsivo e divisão por rota |
| 9. Limpeza e README | Sem `.env`, `.git`, `node_modules`, cache, scripts de sobrescrita ou Edge Function duplicada no pacote |

## Validações executadas

- `npm run lint`: aprovado sem erros ou avisos.
- `npm run test`: 3 arquivos e 5 testes aprovados.
- `npm run build`: 135 módulos transformados e build concluído.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Edge Function TypeScript: sintaxe transformada com sucesso.
- Migrações: transações e delimitadores de blocos verificados estruturalmente.

## Observação operacional

As migrações não foram aplicadas ao projeto Supabase real porque este pacote não contém acesso administrativo ao ambiente. A aplicação em produção deve passar primeiro por backup e homologação, conforme `docs/SUPABASE.md`.
