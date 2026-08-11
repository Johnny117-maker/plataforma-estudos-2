begin;

-- Configuração geral do cronograma adaptativo.
alter table public.cronogramas add column if not exists objetivo text;
alter table public.cronogramas add column if not exists vestibular text;
alter table public.cronogramas add column if not exists data_inicio date;
alter table public.cronogramas add column if not exists meta_acertos integer;
alter table public.cronogramas add column if not exists total_questoes_meta integer not null default 60;
alter table public.cronogramas add column if not exists status text not null default 'ativo';
alter table public.cronogramas add column if not exists versao_gerador text;
alter table public.cronogramas add column if not exists configuracao jsonb not null default '{}'::jsonb;

-- Metadados usados pelo gerador, pelo registro de desempenho e pela reorganização.
alter table public.tarefas add column if not exists assunto_nome text;
alter table public.tarefas add column if not exists tipo text not null default 'teoria';
alter table public.tarefas add column if not exists data_original date;
alter table public.tarefas add column if not exists duracao_minutos integer;
alter table public.tarefas add column if not exists questoes_meta integer not null default 0;
alter table public.tarefas add column if not exists prioridade_score numeric(5,2) not null default 50;
alter table public.tarefas add column if not exists fixa boolean not null default false;
alter table public.tarefas add column if not exists origem_tarefa_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tarefas_id_user_key') then
    alter table public.tarefas add constraint tarefas_id_user_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cronogramas_status_check') then
    alter table public.cronogramas add constraint cronogramas_status_check
      check (status in ('rascunho','ativo','pausado','concluido','arquivado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cronogramas_meta_check') then
    alter table public.cronogramas add constraint cronogramas_meta_check
      check (meta_acertos is null or meta_acertos >= 0 and meta_acertos <= total_questoes_meta);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cronogramas_periodo_check') then
    alter table public.cronogramas add constraint cronogramas_periodo_check
      check (data_inicio is null or data_final is null or data_inicio <= data_final);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tarefas_duracao_check') then
    alter table public.tarefas add constraint tarefas_duracao_check
      check (duracao_minutos is null or duracao_minutos > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tarefas_questoes_meta_check') then
    alter table public.tarefas add constraint tarefas_questoes_meta_check check (questoes_meta >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tarefas_prioridade_score_check') then
    alter table public.tarefas add constraint tarefas_prioridade_score_check
      check (prioridade_score >= 0 and prioridade_score <= 150);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tarefas_origem_owner_fk') then
    alter table public.tarefas add constraint tarefas_origem_owner_fk
      foreign key (origem_tarefa_id, user_id) references public.tarefas(id, user_id) on delete cascade;
  end if;
end $$;

create table if not exists public.cronograma_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  minutos_disponiveis integer not null default 0 check (minutos_disponiveis between 0 and 1440),
  horario_inicio time,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cronograma_id, dia_semana),
  foreign key (cronograma_id, user_id) references public.cronogramas(id, user_id) on delete cascade
);

create table if not exists public.assunto_prioridades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid not null,
  materia_id uuid references public.materias(id) on delete set null,
  subgenero_id uuid references public.subgeneros(id) on delete set null,
  materia_nome text not null,
  assunto_nome text not null,
  total_questoes integer not null default 0,
  total_documentos integer not null default 0,
  frequencia_score numeric(5,2) not null default 0,
  desempenho_percentual numeric(5,2) not null default 50,
  importancia numeric(5,2) not null default 70,
  tempo_sem_revisao numeric(5,2) not null default 50,
  prerequisito numeric(5,2) not null default 50,
  ajuste_usuario numeric(5,2) not null default 0,
  prioridade_score numeric(5,2) not null,
  prioridade text not null,
  incluir boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cronograma_id, materia_nome, assunto_nome),
  foreign key (cronograma_id, user_id) references public.cronogramas(id, user_id) on delete cascade,
  check (prioridade in ('baixa','media','alta')),
  check (prioridade_score between 0 and 100),
  check (desempenho_percentual between 0 and 100)
);

create table if not exists public.desempenho_tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tarefa_id uuid not null,
  tempo_realizado_minutos integer check (tempo_realizado_minutos is null or tempo_realizado_minutos >= 0),
  questoes_realizadas integer not null default 0 check (questoes_realizadas >= 0),
  acertos integer not null default 0 check (acertos >= 0 and acertos <= questoes_realizadas),
  percentual_acerto numeric(5,2) generated always as (
    case when questoes_realizadas > 0 then round(100.0 * acertos / questoes_realizadas, 2) else null end
  ) stored,
  nivel_confianca smallint check (nivel_confianca is null or nivel_confianca between 1 and 5),
  dificuldade_percebida smallint check (dificuldade_percebida is null or dificuldade_percebida between 1 and 5),
  energia smallint check (energia is null or energia between 1 and 5),
  observacoes text,
  concluida_em timestamptz not null default now(),
  foreign key (tarefa_id, user_id) references public.tarefas(id, user_id) on delete cascade
);

create table if not exists public.revisoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid not null,
  tarefa_origem_id uuid not null,
  tarefa_revisao_id uuid not null,
  intervalo_dias integer not null check (intervalo_dias > 0),
  data_prevista date not null,
  status text not null default 'pendente' check (status in ('pendente','concluida','cancelada')),
  created_at timestamptz not null default now(),
  unique (tarefa_origem_id, tarefa_revisao_id),
  foreign key (cronograma_id, user_id) references public.cronogramas(id, user_id) on delete cascade,
  foreign key (tarefa_origem_id, user_id) references public.tarefas(id, user_id) on delete cascade,
  foreign key (tarefa_revisao_id, user_id) references public.tarefas(id, user_id) on delete cascade
);

create table if not exists public.reorganizacoes_cronograma (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid not null,
  motivo text not null default 'manual',
  resumo jsonb not null default '{}'::jsonb,
  alteracoes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (cronograma_id, user_id) references public.cronogramas(id, user_id) on delete cascade
);

create index if not exists disponibilidade_cronograma_idx on public.cronograma_disponibilidade(user_id, cronograma_id, dia_semana);
create index if not exists prioridades_cronograma_score_idx on public.assunto_prioridades(user_id, cronograma_id, prioridade_score desc);
create index if not exists desempenho_tarefa_data_idx on public.desempenho_tarefas(user_id, tarefa_id, concluida_em desc);
create index if not exists revisoes_cronograma_data_idx on public.revisoes(user_id, cronograma_id, data_prevista, status);
create index if not exists reorganizacoes_cronograma_data_idx on public.reorganizacoes_cronograma(user_id, cronograma_id, created_at desc);
create index if not exists tarefas_adaptativas_idx on public.tarefas(user_id, cronograma_id, status, data_prazo, prioridade_score desc);

do $$ declare v_table text; p record; begin
  foreach v_table in array array['cronograma_disponibilidade','assunto_prioridades','desempenho_tarefas','revisoes','reorganizacoes_cronograma'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    for p in select policyname from pg_policies where schemaname='public' and tablename=v_table loop
      execute format('drop policy if exists %I on public.%I', p.policyname, v_table);
    end loop;
    execute format('create policy "owner_all" on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)', v_table);
    execute format('revoke all on public.%I from anon', v_table);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['cronograma_disponibilidade','assunto_prioridades'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Salva cronograma, disponibilidade, prioridades, fases, tarefas e revisões
-- em uma transação. O cronograma só é ativado depois de todas as inserções.
create or replace function public.criar_cronograma_adaptativo(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cronograma uuid;
  v_fase uuid;
  v_tarefa_id uuid;
  v_cron jsonb := p_payload->'cronograma';
  v_item jsonb;
  v_fase_json jsonb;
  v_tarefa jsonb;
  v_revisao jsonb;
  v_map jsonb := '{}'::jsonb;
  v_origem uuid;
  v_tarefa_revisao uuid;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_payload->'fases') <> 'array' or jsonb_array_length(p_payload->'fases') <> 4 then
    raise exception 'O cronograma adaptativo deve possuir quatro fases';
  end if;
  if jsonb_typeof(p_payload->'disponibilidade') <> 'array' or jsonb_array_length(p_payload->'disponibilidade') <> 7 then
    raise exception 'Informe a disponibilidade dos sete dias da semana';
  end if;
  if nullif(v_cron->>'data_inicio','')::date > nullif(v_cron->>'data_final','')::date then
    raise exception 'Período do cronograma inválido';
  end if;

  insert into public.cronogramas(
    user_id, nome, descricao, objetivo, vestibular, cor, categoria, ativo, status,
    data_inicio, data_final, meta_acertos, total_questoes_meta, analise_id,
    versao_gerador, configuracao
  ) values (
    v_user, left(coalesce(nullif(trim(v_cron->>'nome'),''),'Cronograma adaptativo'),160),
    nullif(v_cron->>'descricao',''), nullif(v_cron->>'objetivo',''),
    left(coalesce(nullif(v_cron->>'vestibular',''),'FATEC'),100),
    coalesce(nullif(v_cron->>'cor',''),'#C9963F'), 'estudos', false, 'rascunho',
    nullif(v_cron->>'data_inicio','')::date, nullif(v_cron->>'data_final','')::date,
    nullif(v_cron->>'meta_acertos','')::integer, coalesce(nullif(v_cron->>'total_questoes_meta','')::integer,60),
    nullif(v_cron->>'analise_id','')::uuid, coalesce(nullif(v_cron->>'versao_gerador',''),'adaptativo-v1'),
    coalesce(v_cron->'configuracao','{}'::jsonb)
  ) returning id into v_cronograma;

  for v_item in select value from jsonb_array_elements(p_payload->'disponibilidade') loop
    insert into public.cronograma_disponibilidade(
      user_id, cronograma_id, dia_semana, minutos_disponiveis, horario_inicio, ativo
    ) values (
      v_user, v_cronograma, (v_item->>'dia_semana')::smallint,
      coalesce((v_item->>'minutos_disponiveis')::integer,0), nullif(v_item->>'horario_inicio','')::time,
      coalesce((v_item->>'ativo')::boolean,true)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'prioridades','[]'::jsonb)) loop
    insert into public.assunto_prioridades(
      user_id, cronograma_id, materia_id, subgenero_id, materia_nome, assunto_nome,
      total_questoes, total_documentos, frequencia_score, desempenho_percentual,
      importancia, tempo_sem_revisao, prerequisito, ajuste_usuario,
      prioridade_score, prioridade, incluir
    ) values (
      v_user, v_cronograma, nullif(v_item->>'materia_id','')::uuid, nullif(v_item->>'subgenero_id','')::uuid,
      left(v_item->>'materia',120), left(v_item->>'assunto',160), coalesce((v_item->>'questoes')::integer,0),
      coalesce((v_item->>'documentos')::integer,0), coalesce((v_item->>'frequencia_score')::numeric,0),
      coalesce((v_item->>'desempenho_percentual')::numeric,50), coalesce((v_item->>'importancia')::numeric,70),
      coalesce((v_item->>'tempo_sem_revisao')::numeric,50), coalesce((v_item->>'prerequisito')::numeric,50),
      coalesce((v_item->>'ajuste_usuario')::numeric,0), (v_item->>'prioridade_score')::numeric,
      coalesce(v_item->>'prioridade','media'), coalesce((v_item->>'incluir')::boolean,true)
    );
  end loop;

  for v_fase_json in select value from jsonb_array_elements(p_payload->'fases') loop
    insert into public.fases(user_id,cronograma_id,nome,descricao,cor,peso,ordem,data_inicio,data_prazo)
    values (
      v_user, v_cronograma, left(v_fase_json->>'nome',160), nullif(v_fase_json->>'descricao',''),
      coalesce(nullif(v_fase_json->>'cor',''),'#C9963F'), coalesce((v_fase_json->>'peso')::numeric,1),
      coalesce((v_fase_json->>'ordem')::integer,0), (v_fase_json->>'data_inicio')::date,
      (v_fase_json->>'data_prazo')::date
    ) returning id into v_fase;

    for v_tarefa in select value from jsonb_array_elements(v_fase_json->'tarefas') loop
      insert into public.tarefas(
        user_id,cronograma_id,fase_id,materia_id,assunto_nome,titulo,descricao,tipo,status,
        prioridade,prioridade_score,data_inicio,data_prazo,data_original,duracao_minutos,
        horas_estimadas,questoes_meta,fixa,ordem
      ) values (
        v_user,v_cronograma,v_fase,nullif(v_tarefa->>'materia_id','')::uuid,
        nullif(v_tarefa->>'assunto_nome',''),left(v_tarefa->>'titulo',300),nullif(v_tarefa->>'descricao',''),
        coalesce(nullif(v_tarefa->>'tipo',''),'teoria'),'nao_iniciado',
        coalesce(nullif(v_tarefa->>'prioridade',''),'media'),coalesce((v_tarefa->>'prioridade_score')::numeric,50),
        nullif(v_tarefa->>'data_inicio','')::date,nullif(v_tarefa->>'data_prazo','')::date,
        nullif(v_tarefa->>'data_original','')::date,nullif(v_tarefa->>'duracao_minutos','')::integer,
        nullif(v_tarefa->>'horas_estimadas','')::numeric,coalesce((v_tarefa->>'questoes_meta')::integer,0),
        coalesce((v_tarefa->>'fixa')::boolean,false),coalesce((v_tarefa->>'ordem')::integer,0)
      ) returning id into v_tarefa_id;
      if nullif(v_tarefa->>'local_id','') is not null then
        v_map := v_map || jsonb_build_object(v_tarefa->>'local_id', v_tarefa_id::text);
      end if;
    end loop;
  end loop;

  -- Liga revisões somente depois que todas as tarefas já possuem UUID real.
  for v_revisao in select value from jsonb_array_elements(coalesce(p_payload->'revisoes','[]'::jsonb)) loop
    v_origem := nullif(v_map->>(v_revisao->>'tarefa_origem_local_id'),'')::uuid;
    v_tarefa_revisao := nullif(v_map->>(v_revisao->>'tarefa_revisao_local_id'),'')::uuid;
    if v_origem is null or v_tarefa_revisao is null then raise exception 'Vínculo de revisão inválido'; end if;
    update public.tarefas set origem_tarefa_id = v_origem where id = v_tarefa_revisao and user_id = v_user;
    insert into public.revisoes(
      user_id,cronograma_id,tarefa_origem_id,tarefa_revisao_id,intervalo_dias,data_prevista,status
    ) values (
      v_user,v_cronograma,v_origem,v_tarefa_revisao,(v_revisao->>'intervalo_dias')::integer,
      (v_revisao->>'data_prevista')::date,coalesce(v_revisao->>'status','pendente')
    );
  end loop;

  insert into public.datas_importantes(user_id,cronograma_id,titulo,data,cor,observacao)
  values(v_user,v_cronograma,'Prova — '||coalesce(v_cron->>'vestibular','FATEC'),(v_cron->>'data_final')::date,
         '#F85149','Data fixa preservada durante reorganizações.');

  update public.cronogramas set status='ativo', ativo=true where id=v_cronograma and user_id=v_user;
  return v_cronograma;
end;
$$;

create or replace function public.registrar_desempenho_tarefa(
  p_tarefa_id uuid,
  p_tempo_realizado_minutos integer,
  p_questoes_realizadas integer,
  p_acertos integer,
  p_nivel_confianca integer default null,
  p_dificuldade_percebida integer default null,
  p_energia integer default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tarefa public.tarefas%rowtype;
  v_percentual numeric;
  v_extra uuid;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if coalesce(p_questoes_realizadas,0) < 0 or coalesce(p_acertos,0) < 0 or p_acertos > p_questoes_realizadas then
    raise exception 'Quantidade de questões e acertos inválida';
  end if;
  select * into v_tarefa from public.tarefas where id=p_tarefa_id and user_id=v_user for update;
  if not found then raise exception 'Tarefa não encontrada'; end if;
  v_percentual := case when p_questoes_realizadas > 0 then round(100.0*p_acertos/p_questoes_realizadas,2) else null end;

  insert into public.desempenho_tarefas(
    user_id,tarefa_id,tempo_realizado_minutos,questoes_realizadas,acertos,
    nivel_confianca,dificuldade_percebida,energia,observacoes
  ) values (
    v_user,p_tarefa_id,p_tempo_realizado_minutos,coalesce(p_questoes_realizadas,0),coalesce(p_acertos,0),
    p_nivel_confianca,p_dificuldade_percebida,p_energia,nullif(p_observacoes,'')
  );
  update public.tarefas set status='concluido' where id=p_tarefa_id and user_id=v_user;
  update public.revisoes set status='concluida'
    where tarefa_revisao_id=p_tarefa_id and user_id=v_user;

  -- Desempenho abaixo de 60% cria reforço D+2. Entre 60% e 79%, as revisões
  -- normais permanecem; com 80% ou mais nenhuma carga extra é criada.
  if v_percentual is not null and v_percentual < 60
     and not exists (
       select 1 from public.tarefas
       where origem_tarefa_id=p_tarefa_id and user_id=v_user and tipo='revisao_extra' and status<>'concluido'
     ) then
    insert into public.tarefas(
      user_id,cronograma_id,fase_id,materia_id,assunto_nome,titulo,descricao,tipo,status,
      prioridade,prioridade_score,data_inicio,data_prazo,data_original,duracao_minutos,
      horas_estimadas,questoes_meta,fixa,ordem,origem_tarefa_id
    ) values (
      v_user,v_tarefa.cronograma_id,v_tarefa.fase_id,v_tarefa.materia_id,v_tarefa.assunto_nome,
      left('Reforço D+2: '||v_tarefa.titulo,300),'Criado automaticamente porque o resultado ficou abaixo de 60%.',
      'revisao_extra','nao_iniciado','alta',least(100,v_tarefa.prioridade_score+15),
      current_date+2,current_date+2,current_date+2,30,0.5,greatest(5,v_tarefa.questoes_meta),false,
      v_tarefa.ordem+1,p_tarefa_id
    ) returning id into v_extra;
    insert into public.revisoes(user_id,cronograma_id,tarefa_origem_id,tarefa_revisao_id,intervalo_dias,data_prevista,status)
    values(v_user,v_tarefa.cronograma_id,p_tarefa_id,v_extra,2,current_date+2,'pendente');
  end if;

  return jsonb_build_object('percentual_acerto',v_percentual,'revisao_extra_id',v_extra);
end;
$$;

create or replace function public.aplicar_reorganizacao_adaptativa(
  p_cronograma_id uuid, p_atualizacoes jsonb, p_resumo jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_tarefa public.tarefas%rowtype;
  v_alteracoes jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_atualizacoes)<>'array' or jsonb_array_length(p_atualizacoes)>2000 then
    raise exception 'Atualizações inválidas';
  end if;
  if not exists(select 1 from public.cronogramas where id=p_cronograma_id and user_id=v_user) then
    raise exception 'Cronograma não encontrado';
  end if;

  for v_item in select value from jsonb_array_elements(p_atualizacoes) loop
    select * into v_tarefa from public.tarefas
      where id=(v_item->>'tarefa_id')::uuid and cronograma_id=p_cronograma_id and user_id=v_user for update;
    if not found then raise exception 'Tarefa inválida na reorganização'; end if;
    if v_tarefa.fixa or v_tarefa.status='concluido' then raise exception 'Tarefa fixa ou concluída não pode ser movida'; end if;
    v_alteracoes := v_alteracoes || jsonb_build_array(jsonb_build_object(
      'tarefa_id',v_tarefa.id,'data_anterior',v_tarefa.data_prazo,'data_nova',v_item->>'data_prazo',
      'ordem_anterior',v_tarefa.ordem,'ordem_nova',v_item->>'ordem'
    ));
    update public.tarefas set
      data_prazo=(v_item->>'data_prazo')::date,
      ordem=coalesce((v_item->>'ordem')::integer,ordem),
      prioridade_score=least(150,greatest(0,coalesce((v_item->>'prioridade_score')::numeric,prioridade_score)))
    where id=v_tarefa.id and user_id=v_user;
    v_total := v_total+1;
  end loop;

  update public.fases f set data_inicio=x.min_data,data_prazo=x.max_data
  from (
    select fase_id,min(data_prazo) min_data,max(data_prazo) max_data
    from public.tarefas where cronograma_id=p_cronograma_id and user_id=v_user and fase_id is not null group by fase_id
  ) x where f.id=x.fase_id and f.user_id=v_user;

  insert into public.reorganizacoes_cronograma(user_id,cronograma_id,motivo,resumo,alteracoes)
  values(v_user,p_cronograma_id,'adaptativa',coalesce(p_resumo,'{}'::jsonb),v_alteracoes);
  return v_total;
end;
$$;

-- Mantém a duplicação compatível com cronogramas antigos e adaptativos.
create or replace function public.duplicar_cronograma_atomico(p_cronograma_id uuid,p_novo_nome text)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid:=auth.uid(); v_novo uuid; v_fase record; v_nova_fase uuid;
  v_tarefa record; v_nova_tarefa uuid; v_desempenho record; v_revisao record;
  v_map jsonb:='{}'::jsonb;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  insert into public.cronogramas(
    user_id,nome,descricao,objetivo,vestibular,cor,categoria,ativo,data_inicio,data_final,
    horas_por_dia,analise_id,meta_acertos,total_questoes_meta,status,versao_gerador,configuracao
  ) select
    v_user,left(coalesce(nullif(trim(p_novo_nome),''),nome||' (cópia)'),160),descricao,objetivo,vestibular,
    cor,categoria,ativo,data_inicio,data_final,horas_por_dia,analise_id,meta_acertos,total_questoes_meta,
    status,versao_gerador,configuracao
  from public.cronogramas where id=p_cronograma_id and user_id=v_user returning id into v_novo;
  if v_novo is null then raise exception 'Cronograma não encontrado'; end if;

  insert into public.cronograma_disponibilidade(user_id,cronograma_id,dia_semana,minutos_disponiveis,horario_inicio,ativo)
  select v_user,v_novo,dia_semana,minutos_disponiveis,horario_inicio,ativo
  from public.cronograma_disponibilidade where cronograma_id=p_cronograma_id and user_id=v_user;
  insert into public.assunto_prioridades(
    user_id,cronograma_id,materia_id,subgenero_id,materia_nome,assunto_nome,total_questoes,total_documentos,
    frequencia_score,desempenho_percentual,importancia,tempo_sem_revisao,prerequisito,ajuste_usuario,
    prioridade_score,prioridade,incluir
  ) select
    v_user,v_novo,materia_id,subgenero_id,materia_nome,assunto_nome,total_questoes,total_documentos,
    frequencia_score,desempenho_percentual,importancia,tempo_sem_revisao,prerequisito,ajuste_usuario,
    prioridade_score,prioridade,incluir
  from public.assunto_prioridades where cronograma_id=p_cronograma_id and user_id=v_user;

  for v_fase in select * from public.fases where cronograma_id=p_cronograma_id and user_id=v_user order by ordem loop
    insert into public.fases(user_id,cronograma_id,nome,descricao,cor,peso,ordem,data_inicio,data_prazo)
    values(v_user,v_novo,v_fase.nome,v_fase.descricao,v_fase.cor,v_fase.peso,v_fase.ordem,v_fase.data_inicio,v_fase.data_prazo)
    returning id into v_nova_fase;
    for v_tarefa in select * from public.tarefas where cronograma_id=p_cronograma_id and fase_id=v_fase.id and user_id=v_user order by ordem loop
      insert into public.tarefas(
        user_id,cronograma_id,fase_id,materia_id,assunto_nome,titulo,descricao,tipo,status,prioridade,
        prioridade_score,data_inicio,data_prazo,data_original,duracao_minutos,horas_estimadas,questoes_meta,fixa,ordem
      ) values(
        v_user,v_novo,v_nova_fase,v_tarefa.materia_id,v_tarefa.assunto_nome,v_tarefa.titulo,v_tarefa.descricao,
        v_tarefa.tipo,v_tarefa.status,v_tarefa.prioridade,v_tarefa.prioridade_score,v_tarefa.data_inicio,
        v_tarefa.data_prazo,v_tarefa.data_original,v_tarefa.duracao_minutos,v_tarefa.horas_estimadas,
        v_tarefa.questoes_meta,v_tarefa.fixa,v_tarefa.ordem
      ) returning id into v_nova_tarefa;
      v_map:=v_map||jsonb_build_object(v_tarefa.id::text,v_nova_tarefa::text);
      for v_desempenho in select * from public.desempenho_tarefas where tarefa_id=v_tarefa.id and user_id=v_user loop
        insert into public.desempenho_tarefas(
          user_id,tarefa_id,tempo_realizado_minutos,questoes_realizadas,acertos,nivel_confianca,
          dificuldade_percebida,energia,observacoes,concluida_em
        ) values(
          v_user,v_nova_tarefa,v_desempenho.tempo_realizado_minutos,v_desempenho.questoes_realizadas,
          v_desempenho.acertos,v_desempenho.nivel_confianca,v_desempenho.dificuldade_percebida,
          v_desempenho.energia,v_desempenho.observacoes,v_desempenho.concluida_em
        );
      end loop;
    end loop;
  end loop;

  -- Tarefas avulsas continuam sendo suportadas.
  for v_tarefa in select * from public.tarefas where cronograma_id=p_cronograma_id and fase_id is null and user_id=v_user order by ordem loop
    insert into public.tarefas(
      user_id,cronograma_id,fase_id,materia_id,assunto_nome,titulo,descricao,tipo,status,prioridade,
      prioridade_score,data_inicio,data_prazo,data_original,duracao_minutos,horas_estimadas,questoes_meta,fixa,ordem
    ) values(
      v_user,v_novo,null,v_tarefa.materia_id,v_tarefa.assunto_nome,v_tarefa.titulo,v_tarefa.descricao,
      v_tarefa.tipo,v_tarefa.status,v_tarefa.prioridade,v_tarefa.prioridade_score,v_tarefa.data_inicio,
      v_tarefa.data_prazo,v_tarefa.data_original,v_tarefa.duracao_minutos,v_tarefa.horas_estimadas,
      v_tarefa.questoes_meta,v_tarefa.fixa,v_tarefa.ordem
    ) returning id into v_nova_tarefa;
    v_map:=v_map||jsonb_build_object(v_tarefa.id::text,v_nova_tarefa::text);
  end loop;

  for v_tarefa in select * from public.tarefas where cronograma_id=p_cronograma_id and user_id=v_user and origem_tarefa_id is not null loop
    update public.tarefas set origem_tarefa_id=nullif(v_map->>v_tarefa.origem_tarefa_id::text,'')::uuid
    where id=nullif(v_map->>v_tarefa.id::text,'')::uuid and user_id=v_user;
  end loop;
  for v_revisao in select * from public.revisoes where cronograma_id=p_cronograma_id and user_id=v_user loop
    insert into public.revisoes(user_id,cronograma_id,tarefa_origem_id,tarefa_revisao_id,intervalo_dias,data_prevista,status)
    values(v_user,v_novo,(v_map->>v_revisao.tarefa_origem_id::text)::uuid,
      (v_map->>v_revisao.tarefa_revisao_id::text)::uuid,v_revisao.intervalo_dias,v_revisao.data_prevista,v_revisao.status);
  end loop;
  insert into public.datas_importantes(user_id,cronograma_id,titulo,data,cor,observacao)
  select v_user,v_novo,titulo,data,cor,observacao from public.datas_importantes
  where cronograma_id=p_cronograma_id and user_id=v_user;
  return v_novo;
end;
$$;

drop view if exists public.vw_desempenho_cronogramas;
create view public.vw_desempenho_cronogramas with (security_invoker=true) as
select
  c.id cronograma_id,c.user_id,
  count(distinct t.id) total_tarefas,
  count(distinct t.id) filter(where t.status='concluido') tarefas_concluidas,
  coalesce(sum(d.questoes_realizadas),0) questoes_realizadas,
  coalesce(sum(d.acertos),0) acertos,
  case when coalesce(sum(d.questoes_realizadas),0)>0
    then round(100.0*sum(d.acertos)/sum(d.questoes_realizadas),2) else null end percentual_acerto,
  coalesce(sum(d.tempo_realizado_minutos),0) minutos_realizados
from public.cronogramas c
left join public.tarefas t on t.cronograma_id=c.id and t.user_id=c.user_id
left join public.desempenho_tarefas d on d.tarefa_id=t.id and d.user_id=t.user_id
group by c.id,c.user_id;

revoke all on function public.criar_cronograma_adaptativo(jsonb) from public,anon;
revoke all on function public.registrar_desempenho_tarefa(uuid,integer,integer,integer,integer,integer,integer,text) from public,anon;
revoke all on function public.aplicar_reorganizacao_adaptativa(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.duplicar_cronograma_atomico(uuid,text) from public,anon;
grant execute on function public.criar_cronograma_adaptativo(jsonb) to authenticated;
grant execute on function public.registrar_desempenho_tarefa(uuid,integer,integer,integer,integer,integer,integer,text) to authenticated;
grant execute on function public.aplicar_reorganizacao_adaptativa(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.duplicar_cronograma_atomico(uuid,text) to authenticated;
revoke all on public.vw_desempenho_cronogramas from anon;
grant select on public.vw_desempenho_cronogramas to authenticated;

notify pgrst,'reload schema';
commit;
