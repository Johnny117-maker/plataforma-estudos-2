-- Classificação resiliente de provas em segundo plano.
--
-- O navegador cria um job e pode ser fechado. Os lotes ficam numa Supabase
-- Queue (pgmq), enquanto a Edge Function `analise-worker` consome, persiste
-- cada resultado e reprograma tentativas que sofrerem rate limit.

begin;

create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
begin
  if to_regclass('pgmq.q_analise_classificacao') is null then
    perform pgmq.create('analise_classificacao');
  end if;
end;
$$;

create table if not exists public.analise_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  status text not null default 'pendente'
    check (status in (
      'pendente', 'processando', 'aguardando_batch', 'concluido',
      'concluido_com_falhas', 'falhou', 'cancelado'
    )),
  modo_solicitado text not null default 'auto'
    check (modo_solicitado in ('auto', 'fila', 'batch')),
  modo_efetivo text not null default 'fila'
    check (modo_efetivo in ('fila', 'batch', 'fila_fallback')),
  usar_groq boolean not null default false,
  taxonomia text not null,
  documentos_snapshot jsonb not null default '[]'::jsonb,
  total_itens integer not null default 0 check (total_itens >= 0),
  itens_concluidos integer not null default 0 check (itens_concluidos >= 0),
  itens_falhos integer not null default 0 check (itens_falhos >= 0),
  total_lotes integer not null default 0 check (total_lotes >= 0),
  lotes_concluidos integer not null default 0 check (lotes_concluidos >= 0),
  lotes_falhos integer not null default 0 check (lotes_falhos >= 0),
  provedores jsonb not null default '{"gemini_flash_lite":0,"gemini_flash":0,"groq":0}'::jsonb,
  batch_job_name text,
  batch_state text,
  erro text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.analise_lotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  user_id uuid not null,
  ordem integer not null,
  status text not null default 'pendente'
    check (status in (
      'pendente', 'processando', 'aguardando_limite', 'aguardando_batch',
      'aguardando_refino', 'concluido', 'falhou', 'cancelado'
    )),
  payload jsonb not null,
  resultado jsonb,
  itens_quantidade integer not null check (itens_quantidade between 1 and 40),
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 8 check (max_tentativas between 1 and 20),
  provedor text,
  modelo text,
  queue_msg_id bigint,
  proxima_tentativa timestamptz,
  erro text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analise_lotes_job_owner_fk
    foreign key (job_id, user_id) references public.analise_jobs(id, user_id) on delete cascade,
  unique (job_id, ordem),
  unique (id, job_id, user_id)
);

create index if not exists analise_jobs_user_created_idx
  on public.analise_jobs (user_id, created_at desc);
create index if not exists analise_jobs_status_idx
  on public.analise_jobs (status, updated_at)
  where status in ('pendente', 'processando', 'aguardando_batch');
create index if not exists analise_lotes_job_ordem_idx
  on public.analise_lotes (job_id, ordem);
create index if not exists analise_lotes_status_retry_idx
  on public.analise_lotes (status, proxima_tentativa)
  where status in ('pendente', 'aguardando_limite', 'aguardando_refino');

drop trigger if exists analise_jobs_updated_at on public.analise_jobs;
create trigger analise_jobs_updated_at
before update on public.analise_jobs
for each row execute function public.set_updated_at();

drop trigger if exists analise_lotes_updated_at on public.analise_lotes;
create trigger analise_lotes_updated_at
before update on public.analise_lotes
for each row execute function public.set_updated_at();

alter table public.analise_jobs enable row level security;
alter table public.analise_lotes enable row level security;
alter table public.analise_jobs force row level security;
alter table public.analise_lotes force row level security;

drop policy if exists analise_jobs_select_owner on public.analise_jobs;
create policy analise_jobs_select_owner on public.analise_jobs
for select to authenticated using (user_id = auth.uid());

drop policy if exists analise_lotes_select_owner on public.analise_lotes;
create policy analise_lotes_select_owner on public.analise_lotes
for select to authenticated using (user_id = auth.uid());

revoke all on public.analise_jobs from public, anon, authenticated;
revoke all on public.analise_lotes from public, anon, authenticated;
grant select on public.analise_jobs to authenticated;
grant select on public.analise_lotes to authenticated;

-- Recalcula o progresso a partir dos lotes. Assim, uma interrupção entre a
-- gravação do resultado e a atualização do job não deixa números divergentes.
create or replace function public.recalcular_progresso_analise_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_lotes integer;
  v_lotes_concluidos integer;
  v_lotes_falhos integer;
  v_itens_concluidos integer;
  v_itens_falhos integer;
  v_em_andamento integer;
  v_status text;
begin
  select
    count(*)::integer,
    count(*) filter (where status = 'concluido')::integer,
    count(*) filter (where status = 'falhou')::integer,
    coalesce(sum(itens_quantidade) filter (where status = 'concluido'), 0)::integer,
    coalesce(sum(itens_quantidade) filter (where status = 'falhou'), 0)::integer,
    count(*) filter (where status not in ('concluido', 'falhou', 'cancelado'))::integer
  into v_total_lotes, v_lotes_concluidos, v_lotes_falhos,
       v_itens_concluidos, v_itens_falhos, v_em_andamento
  from public.analise_lotes
  where job_id = p_job_id;

  select status into v_status from public.analise_jobs where id = p_job_id for update;
  if v_status is null or v_status = 'cancelado' then return; end if;

  if v_em_andamento = 0 then
    if v_lotes_falhos = 0 then v_status := 'concluido';
    elsif v_lotes_concluidos > 0 then v_status := 'concluido_com_falhas';
    else v_status := 'falhou';
    end if;
  elsif v_status not in ('aguardando_batch') then
    v_status := 'processando';
  end if;

  update public.analise_jobs
  set total_lotes = v_total_lotes,
      lotes_concluidos = v_lotes_concluidos,
      lotes_falhos = v_lotes_falhos,
      itens_concluidos = v_itens_concluidos,
      itens_falhos = v_itens_falhos,
      status = v_status,
      started_at = case
        when v_status in ('processando', 'aguardando_batch') then coalesce(started_at, now())
        else started_at
      end,
      finished_at = case
        when v_status in ('concluido', 'concluido_com_falhas', 'falhou') then coalesce(finished_at, now())
        else null
      end
  where id = p_job_id;
end;
$$;

create or replace function public.trg_recalcular_progresso_analise_job()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalcular_progresso_analise_job(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists analise_lotes_recalcular_job on public.analise_lotes;
create trigger analise_lotes_recalcular_job
after insert or update or delete on public.analise_lotes
for each row execute function public.trg_recalcular_progresso_analise_job();

-- Cria o job e publica as mensagens de forma atômica: se qualquer lote for
-- inválido, nem o job nem mensagens parciais permanecem no banco.
create or replace function public.criar_job_classificacao(
  p_nome text,
  p_lotes jsonb,
  p_taxonomia text,
  p_documentos_snapshot jsonb,
  p_modo text default 'auto',
  p_usar_groq boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pgmq, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id uuid;
  v_lote_id uuid;
  v_lote jsonb;
  v_ordem integer;
  v_quantidade integer;
  v_total integer := 0;
  v_modo text;
  v_msg_id bigint;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado'; end if;
  if p_modo not in ('auto', 'fila', 'batch') then raise exception 'Modo de processamento inválido'; end if;
  if jsonb_typeof(p_lotes) <> 'array' or jsonb_array_length(p_lotes) < 1 then
    raise exception 'Informe pelo menos um lote';
  end if;
  if jsonb_array_length(p_lotes) > 500 then raise exception 'Máximo de 500 lotes por job'; end if;
  if octet_length(p_lotes::text) > 12 * 1024 * 1024 then
    raise exception 'Os lotes ultrapassam 12 MB; divida a análise em dois jobs';
  end if;
  if length(trim(coalesce(p_taxonomia, ''))) < 10 or length(p_taxonomia) > 30000 then
    raise exception 'Taxonomia inválida';
  end if;
  if jsonb_typeof(p_documentos_snapshot) <> 'array' then raise exception 'Snapshot inválido'; end if;
  if octet_length(p_documentos_snapshot::text) > 12 * 1024 * 1024 then
    raise exception 'A seleção ultrapassa 12 MB; divida a análise em dois jobs';
  end if;

  for v_lote in select value from jsonb_array_elements(p_lotes)
  loop
    if jsonb_typeof(v_lote->'questoes') <> 'array' then raise exception 'Lote sem questões'; end if;
    v_quantidade := jsonb_array_length(v_lote->'questoes');
    if v_quantidade < 1 or v_quantidade > 40 then raise exception 'Cada lote deve ter entre 1 e 40 questões'; end if;
    v_total := v_total + v_quantidade;
  end loop;
  if v_total > 10000 then raise exception 'Máximo de 10.000 conteúdos por job'; end if;

  v_modo := case
    when p_modo = 'batch' then 'batch'
    when p_modo = 'fila' then 'fila'
    when v_total >= 800 then 'batch'
    else 'fila'
  end;

  insert into public.analise_jobs (
    user_id, nome, modo_solicitado, modo_efetivo, usar_groq, taxonomia,
    documentos_snapshot, total_itens, total_lotes
  ) values (
    v_user_id, left(coalesce(nullif(trim(p_nome), ''), 'Classificação de provas'), 160),
    p_modo, v_modo, coalesce(p_usar_groq, false), p_taxonomia,
    p_documentos_snapshot, v_total, jsonb_array_length(p_lotes)
  ) returning id into v_job_id;

  v_ordem := 0;
  for v_lote in select value from jsonb_array_elements(p_lotes)
  loop
    v_quantidade := jsonb_array_length(v_lote->'questoes');
    insert into public.analise_lotes (
      job_id, user_id, ordem, status, payload, itens_quantidade
    ) values (
      v_job_id, v_user_id, v_ordem,
      case when v_modo = 'batch' then 'aguardando_batch' else 'pendente' end,
      v_lote, v_quantidade
    ) returning id into v_lote_id;

    if v_modo = 'fila' then
      select pgmq.send(
        'analise_classificacao',
        jsonb_build_object('tipo', 'classificar_lote', 'job_id', v_job_id, 'lote_id', v_lote_id)
      ) into v_msg_id;
      update public.analise_lotes set queue_msg_id = v_msg_id where id = v_lote_id;
    end if;
    v_ordem := v_ordem + 1;
  end loop;

  if v_modo = 'batch' then
    select pgmq.send(
      'analise_classificacao',
      jsonb_build_object('tipo', 'enviar_batch', 'job_id', v_job_id)
    ) into v_msg_id;
  end if;

  return v_job_id;
end;
$$;

create or replace function public.cancelar_job_classificacao(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.analise_jobs
  set status = 'cancelado', finished_at = now(), erro = 'Cancelado pelo usuário'
  where id = p_job_id and user_id = auth.uid()
    and status not in ('concluido', 'concluido_com_falhas', 'falhou', 'cancelado');
  if not found then return false; end if;
  update public.analise_lotes
  set status = 'cancelado', finished_at = now(), erro = 'Cancelado pelo usuário'
  where job_id = p_job_id and user_id = auth.uid()
    and status not in ('concluido', 'falhou', 'cancelado');
  return true;
end;
$$;

-- RPCs internas: somente o service_role da Edge Function pode tocar a fila.
-- A pgmq não é exposta ao navegador e não precisa de políticas próprias.
create or replace function public.worker_ler_fila(p_quantidade integer default 1)
returns table (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language sql
security definer
set search_path = pgmq, public, pg_temp
as $$
  select q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message
  from pgmq.read('analise_classificacao', 360, greatest(1, least(coalesce(p_quantidade, 1), 5))) q;
$$;

create or replace function public.worker_concluir_mensagem(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public, pg_temp
as $$
  select pgmq.delete('analise_classificacao', p_msg_id);
$$;

create or replace function public.worker_descartar_mensagem(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public, pg_temp
as $$
  select pgmq.archive('analise_classificacao', p_msg_id);
$$;

create or replace function public.worker_reagendar_mensagem(
  p_msg_id bigint,
  p_mensagem jsonb,
  p_atraso_segundos integer default 30
)
returns bigint
language plpgsql
security definer
set search_path = pgmq, public, pg_temp
as $$
declare
  v_novo_id bigint;
begin
  if not pgmq.delete('analise_classificacao', p_msg_id) then
    raise exception 'Mensagem % não encontrada para reagendamento', p_msg_id;
  end if;
  select pgmq.send(
    'analise_classificacao', p_mensagem,
    greatest(1, least(coalesce(p_atraso_segundos, 30), 3600))
  ) into v_novo_id;
  return v_novo_id;
end;
$$;

create or replace function public.worker_publicar_mensagem(
  p_mensagem jsonb,
  p_atraso_segundos integer default 0
)
returns bigint
language sql
security definer
set search_path = pgmq, public, pg_temp
as $$
  select pgmq.send(
    'analise_classificacao', p_mensagem,
    greatest(0, least(coalesce(p_atraso_segundos, 0), 3600))
  );
$$;

create or replace function public.worker_incrementar_provedor(
  p_job_id uuid,
  p_chave text,
  p_quantidade integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_chave not in ('gemini_flash_lite', 'gemini_flash', 'groq') then
    raise exception 'Provedor inválido';
  end if;
  update public.analise_jobs
  set provedores = jsonb_set(
    provedores,
    array[p_chave],
    to_jsonb(coalesce((provedores->>p_chave)::integer, 0) + greatest(coalesce(p_quantidade, 0), 0)),
    true
  )
  where id = p_job_id;
end;
$$;

revoke all on function public.recalcular_progresso_analise_job(uuid) from public, anon, authenticated;
revoke all on function public.trg_recalcular_progresso_analise_job() from public, anon, authenticated;
revoke all on function public.criar_job_classificacao(text,jsonb,text,jsonb,text,boolean) from public, anon;
revoke all on function public.cancelar_job_classificacao(uuid) from public, anon;
revoke all on function public.worker_ler_fila(integer) from public, anon, authenticated;
revoke all on function public.worker_concluir_mensagem(bigint) from public, anon, authenticated;
revoke all on function public.worker_descartar_mensagem(bigint) from public, anon, authenticated;
revoke all on function public.worker_reagendar_mensagem(bigint,jsonb,integer) from public, anon, authenticated;
revoke all on function public.worker_publicar_mensagem(jsonb,integer) from public, anon, authenticated;
revoke all on function public.worker_incrementar_provedor(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.criar_job_classificacao(text,jsonb,text,jsonb,text,boolean) to authenticated;
grant execute on function public.cancelar_job_classificacao(uuid) to authenticated;
grant execute on function public.worker_ler_fila(integer) to service_role;
grant execute on function public.worker_concluir_mensagem(bigint) to service_role;
grant execute on function public.worker_descartar_mensagem(bigint) to service_role;
grant execute on function public.worker_reagendar_mensagem(bigint,jsonb,integer) to service_role;
grant execute on function public.worker_publicar_mensagem(jsonb,integer) to service_role;
grant execute on function public.worker_incrementar_provedor(uuid,text,integer) to service_role;

notify pgrst, 'reload schema';
commit;
