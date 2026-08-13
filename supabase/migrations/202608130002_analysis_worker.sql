-- Worker do pipeline de visão (etapa 2): claim atômico e progresso.
--
-- O worker roda com service_role. Estas RPCs concentram as transições de estado
-- do job para que uma interrupção entre gravar a página e atualizar o progresso
-- nunca deixe números divergentes.

begin;

-- Reivindica um job para processar: pega o mais antigo 'pending' ou um
-- 'processing' abandonado (sem atualização há 3 min). FOR UPDATE SKIP LOCKED
-- garante que duas execuções do cron não peguem o mesmo job.
create or replace function public.reivindicar_analysis_job()
returns table (
  id uuid,
  user_id uuid,
  storage_prefix text,
  total_paginas integer,
  paginas_processadas integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select j.id into v_id
  from public.analysis_jobs j
  where j.status = 'pending'
     or (j.status = 'processing' and j.updated_at < now() - interval '3 minutes')
  order by j.created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.analysis_jobs
  set status = 'processing',
      started_at = coalesce(started_at, now()),
      erro = null
  where analysis_jobs.id = v_id;

  return query
  select j.id, j.user_id, j.storage_prefix, j.total_paginas, j.paginas_processadas
  from public.analysis_jobs j
  where j.id = v_id;
end;
$$;

-- Anexa o resultado de uma página e avança o progresso. Marca 'done' quando
-- todas as páginas foram processadas.
create or replace function public.anexar_pagina_analysis_job(
  p_job_id uuid,
  p_pagina jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_proc integer;
begin
  update public.analysis_jobs
  set resultado = coalesce(resultado, '[]'::jsonb) || jsonb_build_array(p_pagina),
      paginas_processadas = paginas_processadas + 1
  where id = p_job_id and status = 'processing'
  returning total_paginas, paginas_processadas into v_total, v_proc;

  if v_proc is not null and v_proc >= v_total then
    update public.analysis_jobs
    set status = 'done', finished_at = now()
    where id = p_job_id;
  end if;
end;
$$;

create or replace function public.falhar_analysis_job(
  p_job_id uuid,
  p_erro text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.analysis_jobs
  set status = 'error', erro = left(coalesce(p_erro, 'Falha desconhecida'), 500), finished_at = now()
  where id = p_job_id;
end;
$$;

revoke all on function public.reivindicar_analysis_job() from public, anon, authenticated;
revoke all on function public.anexar_pagina_analysis_job(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.falhar_analysis_job(uuid, text) from public, anon, authenticated;
grant execute on function public.reivindicar_analysis_job() to service_role;
grant execute on function public.anexar_pagina_analysis_job(uuid, jsonb) to service_role;
grant execute on function public.falhar_analysis_job(uuid, text) to service_role;

commit;
