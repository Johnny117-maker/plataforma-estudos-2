# Implantação e atualização do Supabase

## Antes de começar

1. Crie um projeto de homologação.
2. Exporte um backup do banco atual.
3. Confirme que todos os usuários e registros importantes estão presentes no backup.
4. Aplique as migrações primeiro em homologação.

## O que a migração altera

- cria as tabelas de análise de provas;
- consolida os campos `data_final` e `horas_por_dia`;
- normaliza questões verdadeiro/falso;
- verifica relações entre usuários;
- substitui FKs simples obrigatórias por FKs compostas;
- adiciona constraints de datas, horas, JSON e domínios;
- recria índices compostos;
- força RLS em todas as tabelas;
- recria views com `security_invoker`;
- instala RPCs transacionais.

As colunas antigas `data_alvo` e `ritmo_horas_dia` são removidas somente depois da cópia dos valores.

## Aplicar com CLI

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Não edite migrações que já foram aplicadas. Para mudanças futuras, crie outro arquivo com timestamp maior.

## Verificações depois da migração

No SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, viewname
from pg_views
where schemaname = 'public';
```

Teste com dois usuários diferentes. Cada usuário deve enxergar somente seus próprios registros, inclusive por views e RPCs.

## Funções de banco

| Função | Finalidade |
|---|---|
| `criar_cronograma_completo` | Cria cronograma, fases e tarefas em uma transação |
| `duplicar_cronograma_atomico` | Duplica cronograma e dependências |
| `aplicar_reorganizacao_cronograma` | Atualiza ordem e datas sem estado parcial |
| `salvar_analise_provas` | Salva análise, documentos, questões e frequências |
| `gerar_cronograma_da_analise` | Gera fases e tarefas priorizadas pela recorrência |

Todas exigem sessão autenticada e derivam o dono de `auth.uid()`.

## Edge Function

```bash
supabase secrets set GROQ_API_KEY=SUA_CHAVE
supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://seu-dominio.com
supabase functions deploy ia
```

Não use `--no-verify-jwt`.

## Reversão

Migrações de estrutura e remoção de colunas não devem ser revertidas manualmente em produção. Se a homologação apontar incompatibilidade, não aplique no banco principal. Se uma aplicação já concluída precisar ser desfeita, restaure o backup em um projeto separado e valide os dados antes de trocar o ambiente.
