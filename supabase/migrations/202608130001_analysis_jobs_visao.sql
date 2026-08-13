-- Pipeline de análise de prova por visão (etapa 1: base).
--
-- O navegador sobe o PDF e uma renderização PNG de cada página para o bucket
-- privado `provas-visao` e cria um registro em `analysis_jobs` com status
-- 'pending'. Um worker (etapa seguinte) baixa os arquivos, envia texto + imagem
-- ao modelo de visão e persiste as questões estruturadas.

begin;

-- Bucket privado: cada usuário só acessa a própria pasta ({uid}/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provas-visao', 'provas-visao', false, 26214400, array['application/pdf', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists provas_visao_select_owner on storage.objects;
create policy provas_visao_select_owner on storage.objects
for select to authenticated
using (
  bucket_id = 'provas-visao'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists provas_visao_insert_owner on storage.objects;
create policy provas_visao_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'provas-visao'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists provas_visao_update_owner on storage.objects;
create policy provas_visao_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'provas-visao'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'provas-visao'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists provas_visao_delete_owner on storage.objects;
create policy provas_visao_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'provas-visao'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Jobs de análise por visão.
create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  storage_prefix text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error', 'canceled')),
  total_paginas integer not null default 0 check (total_paginas >= 0),
  paginas_processadas integer not null default 0 check (paginas_processadas >= 0),
  resultado jsonb not null default '[]'::jsonb,
  erro text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists analysis_jobs_user_created_idx
  on public.analysis_jobs (user_id, created_at desc);
create index if not exists analysis_jobs_status_idx
  on public.analysis_jobs (status, updated_at)
  where status in ('pending', 'processing');

drop trigger if exists analysis_jobs_updated_at on public.analysis_jobs;
create trigger analysis_jobs_updated_at
before update on public.analysis_jobs
for each row execute function public.set_updated_at();

alter table public.analysis_jobs enable row level security;
alter table public.analysis_jobs force row level security;

drop policy if exists analysis_jobs_select_owner on public.analysis_jobs;
create policy analysis_jobs_select_owner on public.analysis_jobs
for select to authenticated using (user_id = auth.uid());

revoke all on public.analysis_jobs from public, anon, authenticated;
grant select on public.analysis_jobs to authenticated;

-- Criação do job: o cliente nunca escolhe user_id nem status, e o prefixo
-- precisa começar pela pasta do próprio usuário (mesmo isolamento do bucket).
create or replace function public.criar_analysis_job(
  p_nome text,
  p_storage_prefix text,
  p_total_paginas integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if coalesce(trim(p_storage_prefix), '') = '' then raise exception 'storage_prefix obrigatório'; end if;
  if split_part(p_storage_prefix, '/', 1) <> v_user::text then
    raise exception 'storage_prefix fora da pasta do usuário';
  end if;
  if coalesce(p_total_paginas, 0) < 1 or p_total_paginas > 500 then
    raise exception 'total_paginas deve estar entre 1 e 500';
  end if;

  insert into public.analysis_jobs (user_id, nome, storage_prefix, total_paginas, status)
  values (
    v_user,
    left(coalesce(nullif(trim(p_nome), ''), 'Prova'), 160),
    p_storage_prefix,
    p_total_paginas,
    'pending'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.criar_analysis_job(text, text, integer) from public, anon;
grant execute on function public.criar_analysis_job(text, text, integer) to authenticated;

commit;
