-- Imagens originais recortadas das questões. O bucket é privado e cada
-- usuário acessa somente a própria pasta.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('questoes-imagens', 'questoes-imagens', false, 5242880, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists questoes_imagens_select_owner on storage.objects;
create policy questoes_imagens_select_owner on storage.objects
for select to authenticated
using (
  bucket_id = 'questoes-imagens'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists questoes_imagens_insert_owner on storage.objects;
create policy questoes_imagens_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'questoes-imagens'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists questoes_imagens_update_owner on storage.objects;
create policy questoes_imagens_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'questoes-imagens'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'questoes-imagens'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists questoes_imagens_delete_owner on storage.objects;
create policy questoes_imagens_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'questoes-imagens'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.vincular_imagens_perguntas(p_imagens jsonb)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_afetadas integer := 0;
  v_total integer := 0;
  v_caminho text;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_imagens) <> 'array' or jsonb_array_length(p_imagens) > 1000 then
    raise exception 'Lista de imagens inválida';
  end if;

  for v_item in select value from jsonb_array_elements(p_imagens) loop
    v_caminho := nullif(trim(v_item->>'imagem_url'), '');
    if v_caminho is null
      or length(v_caminho) > 500
      or v_caminho not like v_user::text || '/%' then
      continue;
    end if;

    update public.perguntas p
    set imagem_url = v_caminho
    from public.provas_banco prova
    where p.prova_id = prova.id
      and p.user_id = v_user
      and prova.user_id = v_user
      and prova.hash_sha256 = nullif(v_item->>'hash_sha256', '')
      and p.numero_original = nullif(v_item->>'numero', '')::integer;
    get diagnostics v_afetadas = row_count;
    v_total := v_total + v_afetadas;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.vincular_imagens_perguntas(jsonb) from public, anon;
grant execute on function public.vincular_imagens_perguntas(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

