-- Cache de classificação por hash de conteúdo.
--
-- Hoje cada análise reclassifica tudo do zero. Com uma prova isso é lento; com
-- dez, é inviável no free tier do Groq. Aqui cada questão passa pela IA uma
-- única vez: o hash do texto vira chave, e qualquer análise futura do mesmo
-- usuário reaproveita o resultado.
--
-- Reusa `questoes_extraidas`, que já guarda tudo que interessa. Só acrescenta
-- a coluna do hash, o índice e a função de consulta.

begin;

alter table public.questoes_extraidas
  add column if not exists hash_conteudo text;

-- Calcula o mesmo hash usado pelo frontend em todo INSERT/UPDATE. Assim o
-- cache é realmente alimentado pela RPC salvar_analise_provas sem precisar
-- confiar que cada cliente enviará o campo manualmente.
create or replace function public.preencher_hash_questao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_texto text;
begin
  v_texto := trim(lower(regexp_replace(coalesce(new.enunciado, ''), '\s+', ' ', 'g')));
  new.hash_conteudo := case
    when length(v_texto) >= 40 then encode(digest(v_texto, 'sha256'), 'hex')
    else null
  end;
  return new;
end;
$$;

drop trigger if exists questoes_preencher_hash on public.questoes_extraidas;
create trigger questoes_preencher_hash
before insert or update of enunciado on public.questoes_extraidas
for each row execute function public.preencher_hash_questao();

-- Preenche o que já existe, para não perder o trabalho de classificação já
-- feito. O hash é do texto normalizado, não do enunciado cru: espaços e caixa
-- variam entre extrações do mesmo PDF e não deveriam gerar entradas distintas.
update public.questoes_extraidas
set enunciado = enunciado
where hash_conteudo is null;

create index if not exists questoes_hash_conteudo_idx
  on public.questoes_extraidas (user_id, hash_conteudo)
  where hash_conteudo is not null and materia_nome <> 'Não classificada';

-- Consulta o cache. Devolve, para cada hash pedido, a classificação mais
-- recente daquele usuário. `security invoker` mantém o RLS: ninguém enxerga
-- a classificação de outro.
create or replace function public.buscar_classificacoes_cache(p_hashes text[])
returns table (
  hash_conteudo text,
  materia_id uuid,
  subgenero_id uuid,
  materia_nome text,
  assunto_nome text,
  dificuldade text,
  confianca numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select distinct on (q.hash_conteudo)
    q.hash_conteudo, q.materia_id, q.subgenero_id,
    q.materia_nome, q.assunto_nome, q.dificuldade, q.confianca
  from questoes_extraidas q
  where q.user_id = auth.uid()
    and q.hash_conteudo = any(p_hashes)
    and q.materia_nome <> 'Não classificada'
  order by q.hash_conteudo, q.created_at desc;
$$;

revoke all on function public.buscar_classificacoes_cache(text[]) from public, anon;
grant execute on function public.buscar_classificacoes_cache(text[]) to authenticated;

revoke all on function public.preencher_hash_questao() from public, anon;

notify pgrst, 'reload schema';
commit;
