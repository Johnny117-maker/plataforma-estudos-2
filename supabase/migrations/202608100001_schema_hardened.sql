begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.materias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text not null default '#F2C811',
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subgeneros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  materia_id uuid not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cronogramas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  cor text not null default '#F2C811',
  categoria text not null default 'estudos',
  ativo boolean not null default true,
  data_final date,
  horas_por_dia numeric(6,2),
  analise_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid not null,
  nome text not null,
  descricao text,
  cor text not null default '#F2C811',
  peso numeric(8,2) not null default 1,
  ordem integer not null default 0,
  data_inicio date,
  data_prazo date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid,
  fase_id uuid,
  materia_id uuid,
  titulo text not null,
  descricao text,
  status text not null default 'nao_iniciado',
  prioridade text not null default 'media',
  data_inicio date,
  data_prazo date,
  horas_estimadas numeric(7,2),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.datas_importantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cronograma_id uuid,
  titulo text not null,
  data date not null,
  cor text not null default '#F2C811',
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.paginas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  titulo text not null default 'Sem título',
  icone text not null default '📄',
  blocos jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perguntas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  materia_id uuid not null,
  subgenero_id uuid,
  enunciado text not null,
  tipo text not null default 'multipla_escolha',
  alternativas jsonb,
  resposta_correta text not null,
  explicacao text,
  dificuldade text not null default 'media',
  fonte text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historico_respostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pergunta_id uuid not null,
  resposta_dada text,
  correta boolean not null,
  respondido_em timestamptz not null default now()
);

create table if not exists public.analises_provas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  status text not null default 'concluida',
  total_documentos integer not null default 0,
  total_questoes integer not null default 0,
  resumo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documentos_prova (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analise_id uuid not null,
  nome_arquivo text not null,
  tipo_arquivo text not null,
  tamanho_bytes bigint not null,
  hash_sha256 text,
  perfil text,
  total_paginas integer,
  total_questoes integer not null default 0,
  texto_extraido text,
  avisos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.questoes_extraidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analise_id uuid not null,
  documento_id uuid not null,
  numero integer,
  pagina integer,
  enunciado text not null,
  alternativas jsonb not null default '[]'::jsonb,
  resposta_correta text,
  materia_id uuid,
  subgenero_id uuid,
  materia_nome text not null default 'Não classificada',
  assunto_nome text not null default 'Não classificado',
  dificuldade text not null default 'media',
  confianca numeric(4,3),
  depende_de_visual boolean not null default false,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.frequencias_assuntos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analise_id uuid not null,
  materia_nome text not null,
  assunto_nome text not null,
  total_documentos integer not null,
  total_questoes integer not null,
  percentual numeric(7,4) not null,
  peso numeric(10,4) not null,
  updated_at timestamptz not null default now()
);

-- Converge bancos antigos para o modelo atual sem perder valores.
alter table public.materias add column if not exists ordem integer not null default 0;
alter table public.materias add column if not exists updated_at timestamptz not null default now();
alter table public.subgeneros add column if not exists updated_at timestamptz not null default now();
alter table public.cronogramas add column if not exists descricao text;
alter table public.cronogramas add column if not exists categoria text not null default 'estudos';
alter table public.cronogramas add column if not exists data_final date;
alter table public.cronogramas add column if not exists horas_por_dia numeric(6,2);
alter table public.cronogramas add column if not exists analise_id uuid;
alter table public.fases add column if not exists descricao text;
alter table public.fases add column if not exists updated_at timestamptz not null default now();
alter table public.tarefas add column if not exists horas_estimadas numeric(7,2);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cronogramas' and column_name='data_alvo') then
    execute 'update public.cronogramas set data_final = coalesce(data_final, data_alvo)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cronogramas' and column_name='ritmo_horas_dia') then
    execute 'update public.cronogramas set horas_por_dia = coalesce(horas_por_dia, ritmo_horas_dia)';
  end if;
end;
$$;

-- Falha de forma segura se houver vínculos entre donos diferentes.
do $$
begin
  if exists (select 1 from public.subgeneros s join public.materias m on m.id=s.materia_id where s.user_id<>m.user_id) then raise exception 'Subgênero ligado a matéria de outro usuário'; end if;
  if exists (select 1 from public.fases f join public.cronogramas c on c.id=f.cronograma_id where f.user_id<>c.user_id) then raise exception 'Fase ligada a cronograma de outro usuário'; end if;
  if exists (select 1 from public.tarefas t join public.cronogramas c on c.id=t.cronograma_id where t.user_id<>c.user_id) then raise exception 'Tarefa ligada a cronograma de outro usuário'; end if;
  if exists (select 1 from public.perguntas p join public.materias m on m.id=p.materia_id where p.user_id<>m.user_id) then raise exception 'Pergunta ligada a matéria de outro usuário'; end if;
end;
$$;

-- Chaves únicas compostas permitem FKs com isolamento por usuário.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='materias_id_user_key') then alter table public.materias add constraint materias_id_user_key unique (id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='subgeneros_id_user_key') then alter table public.subgeneros add constraint subgeneros_id_user_key unique (id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='cronogramas_id_user_key') then alter table public.cronogramas add constraint cronogramas_id_user_key unique (id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='fases_id_cronograma_user_key') then alter table public.fases add constraint fases_id_cronograma_user_key unique (id,cronograma_id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='perguntas_id_user_key') then alter table public.perguntas add constraint perguntas_id_user_key unique (id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='analises_id_user_key') then alter table public.analises_provas add constraint analises_id_user_key unique (id,user_id); end if;
  if not exists (select 1 from pg_constraint where conname='documentos_id_analise_user_key') then alter table public.documentos_prova add constraint documentos_id_analise_user_key unique (id,analise_id,user_id); end if;
end;
$$;

-- Remove FKs simples antigas somente após a validação e cria as compostas.
alter table public.subgeneros drop constraint if exists subgeneros_materia_id_fkey;
alter table public.fases drop constraint if exists fases_cronograma_id_fkey;
alter table public.tarefas drop constraint if exists tarefas_cronograma_id_fkey;
alter table public.tarefas drop constraint if exists tarefas_fase_id_fkey;
alter table public.perguntas drop constraint if exists perguntas_materia_id_fkey;
alter table public.historico_respostas drop constraint if exists historico_respostas_pergunta_id_fkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='subgeneros_materia_owner_fk') then alter table public.subgeneros add constraint subgeneros_materia_owner_fk foreign key (materia_id,user_id) references public.materias(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='fases_cronograma_owner_fk') then alter table public.fases add constraint fases_cronograma_owner_fk foreign key (cronograma_id,user_id) references public.cronogramas(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='tarefas_cronograma_owner_fk') then alter table public.tarefas add constraint tarefas_cronograma_owner_fk foreign key (cronograma_id,user_id) references public.cronogramas(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='tarefas_fase_owner_fk') then alter table public.tarefas add constraint tarefas_fase_owner_fk foreign key (fase_id,cronograma_id,user_id) references public.fases(id,cronograma_id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='perguntas_materia_owner_fk') then alter table public.perguntas add constraint perguntas_materia_owner_fk foreign key (materia_id,user_id) references public.materias(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='historico_pergunta_owner_fk') then alter table public.historico_respostas add constraint historico_pergunta_owner_fk foreign key (pergunta_id,user_id) references public.perguntas(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='documentos_analise_owner_fk') then alter table public.documentos_prova add constraint documentos_analise_owner_fk foreign key (analise_id,user_id) references public.analises_provas(id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='questoes_documento_owner_fk') then alter table public.questoes_extraidas add constraint questoes_documento_owner_fk foreign key (documento_id,analise_id,user_id) references public.documentos_prova(id,analise_id,user_id) on delete cascade; end if;
  if not exists (select 1 from pg_constraint where conname='frequencias_analise_owner_fk') then alter table public.frequencias_assuntos add constraint frequencias_analise_owner_fk foreign key (analise_id,user_id) references public.analises_provas(id,user_id) on delete cascade; end if;
end;
$$;

-- Relações opcionais: FK tradicional + trigger de consistência de proprietário/contexto.
alter table public.tarefas drop constraint if exists tarefas_materia_id_fkey;
alter table public.perguntas drop constraint if exists perguntas_subgenero_id_fkey;
alter table public.paginas drop constraint if exists paginas_parent_id_fkey;
alter table public.datas_importantes drop constraint if exists datas_importantes_cronograma_id_fkey;
alter table public.cronogramas drop constraint if exists cronogramas_analise_id_fkey;
alter table public.questoes_extraidas drop constraint if exists questoes_extraidas_materia_id_fkey;
alter table public.questoes_extraidas drop constraint if exists questoes_extraidas_subgenero_id_fkey;
alter table public.tarefas add constraint tarefas_materia_id_fkey foreign key (materia_id) references public.materias(id) on delete set null;
alter table public.perguntas add constraint perguntas_subgenero_id_fkey foreign key (subgenero_id) references public.subgeneros(id) on delete set null;
alter table public.paginas add constraint paginas_parent_id_fkey foreign key (parent_id) references public.paginas(id) on delete cascade;
alter table public.datas_importantes add constraint datas_importantes_cronograma_id_fkey foreign key (cronograma_id) references public.cronogramas(id) on delete set null;
alter table public.cronogramas add constraint cronogramas_analise_id_fkey foreign key (analise_id) references public.analises_provas(id) on delete set null;
alter table public.questoes_extraidas add constraint questoes_extraidas_materia_id_fkey foreign key (materia_id) references public.materias(id) on delete set null;
alter table public.questoes_extraidas add constraint questoes_extraidas_subgenero_id_fkey foreign key (subgenero_id) references public.subgeneros(id) on delete set null;

create or replace function public.validar_relacoes_do_usuario()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='tarefas' and new.materia_id is not null and not exists(select 1 from materias where id=new.materia_id and user_id=new.user_id) then raise exception 'Matéria inválida para o usuário'; end if;
  if tg_table_name='perguntas' and new.subgenero_id is not null and not exists(select 1 from subgeneros where id=new.subgenero_id and materia_id=new.materia_id and user_id=new.user_id) then raise exception 'Assunto não pertence à matéria/usuário'; end if;
  if tg_table_name='paginas' and new.parent_id is not null and not exists(select 1 from paginas where id=new.parent_id and user_id=new.user_id and id<>new.id) then raise exception 'Página-pai inválida'; end if;
  if tg_table_name='datas_importantes' and new.cronograma_id is not null and not exists(select 1 from cronogramas where id=new.cronograma_id and user_id=new.user_id) then raise exception 'Cronograma inválido para a data'; end if;
  if tg_table_name='cronogramas' and new.analise_id is not null and not exists(select 1 from analises_provas where id=new.analise_id and user_id=new.user_id) then raise exception 'Análise inválida para o cronograma'; end if;
  if tg_table_name='questoes_extraidas' and new.materia_id is not null and not exists(select 1 from materias where id=new.materia_id and user_id=new.user_id) then raise exception 'Matéria inválida para a questão extraída'; end if;
  if tg_table_name='questoes_extraidas' and new.subgenero_id is not null and not exists(select 1 from subgeneros where id=new.subgenero_id and user_id=new.user_id and (new.materia_id is null or materia_id=new.materia_id)) then raise exception 'Assunto inválido para a questão extraída'; end if;
  return new;
end; $$;

do $$ declare t text; begin
  foreach t in array array['tarefas','perguntas','paginas','datas_importantes','cronogramas','questoes_extraidas'] loop
    execute format('drop trigger if exists trg_validar_relacoes on public.%I',t);
    execute format('create trigger trg_validar_relacoes before insert or update on public.%I for each row execute function public.validar_relacoes_do_usuario()',t);
  end loop;
end $$;

-- Constraints de domínio e consistência temporal.
update public.perguntas
set alternativas='["Verdadeiro","Falso"]'::jsonb,
    resposta_correta=case lower(trim(resposta_correta)) when 'true' then '0' when 'verdadeiro' then '0' when 'v' then '0' when 'false' then '1' when 'falso' then '1' when 'f' then '1' else resposta_correta end
where tipo='verdadeiro_falso';

do $$
begin
  if not exists(select 1 from pg_constraint where conname='cronogramas_categoria_check') then alter table public.cronogramas add constraint cronogramas_categoria_check check (categoria in ('estudos','tarefas','viagem','projeto','outro')); end if;
  if not exists(select 1 from pg_constraint where conname='cronogramas_horas_check') then alter table public.cronogramas add constraint cronogramas_horas_check check (horas_por_dia is null or horas_por_dia>0); end if;
  if not exists(select 1 from pg_constraint where conname='fases_datas_check') then alter table public.fases add constraint fases_datas_check check (data_inicio is null or data_prazo is null or data_inicio<=data_prazo); end if;
  if not exists(select 1 from pg_constraint where conname='tarefas_status_check') then alter table public.tarefas add constraint tarefas_status_check check (status in ('nao_iniciado','andamento','concluido')); end if;
  if not exists(select 1 from pg_constraint where conname='tarefas_prioridade_check') then alter table public.tarefas add constraint tarefas_prioridade_check check (prioridade in ('baixa','media','alta')); end if;
  if not exists(select 1 from pg_constraint where conname='tarefas_datas_check') then alter table public.tarefas add constraint tarefas_datas_check check (data_inicio is null or data_prazo is null or data_inicio<=data_prazo); end if;
  if not exists(select 1 from pg_constraint where conname='tarefas_horas_check') then alter table public.tarefas add constraint tarefas_horas_check check (horas_estimadas is null or horas_estimadas>0); end if;
  if not exists(select 1 from pg_constraint where conname='tarefas_fase_cronograma_check') then alter table public.tarefas add constraint tarefas_fase_cronograma_check check (fase_id is null or cronograma_id is not null); end if;
  if not exists(select 1 from pg_constraint where conname='paginas_blocos_array_check') then alter table public.paginas add constraint paginas_blocos_array_check check (jsonb_typeof(blocos)='array'); end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_tipo_check') then alter table public.perguntas add constraint perguntas_tipo_check check (tipo in ('multipla_escolha','verdadeiro_falso','dissertativa')); end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_dificuldade_check') then alter table public.perguntas add constraint perguntas_dificuldade_check check (dificuldade in ('facil','media','dificil')); end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_formato_check') then alter table public.perguntas add constraint perguntas_formato_check check ((tipo='dissertativa' and alternativas is null and length(trim(resposta_correta))>0) or (tipo='verdadeiro_falso' and alternativas='["Verdadeiro","Falso"]'::jsonb and resposta_correta in ('0','1')) or (tipo='multipla_escolha' and jsonb_typeof(alternativas)='array' and jsonb_array_length(alternativas)>=2 and resposta_correta~'^\d+$' and resposta_correta::integer<jsonb_array_length(alternativas))); end if;
  if not exists(select 1 from pg_constraint where conname='analises_status_check') then alter table public.analises_provas add constraint analises_status_check check (status in ('processando','concluida','erro')); end if;
  if not exists(select 1 from pg_constraint where conname='questoes_confianca_check') then alter table public.questoes_extraidas add constraint questoes_confianca_check check (confianca is null or confianca between 0 and 1); end if;
end $$;

-- Índices alinhados às consultas com RLS.
create unique index if not exists materias_user_nome_uq on public.materias(user_id,lower(nome));
create unique index if not exists subgeneros_materia_nome_uq on public.subgeneros(materia_id,lower(nome));
create index if not exists materias_user_ordem_idx on public.materias(user_id,ordem);
create index if not exists cronogramas_user_ativo_idx on public.cronogramas(user_id,ativo,updated_at desc);
create index if not exists fases_user_cronograma_ordem_idx on public.fases(user_id,cronograma_id,ordem);
create index if not exists tarefas_user_prazo_idx on public.tarefas(user_id,data_prazo) where status<>'concluido';
create index if not exists tarefas_user_cronograma_ordem_idx on public.tarefas(user_id,cronograma_id,fase_id,ordem);
create index if not exists datas_user_data_idx on public.datas_importantes(user_id,data);
create index if not exists paginas_user_parent_ordem_idx on public.paginas(user_id,parent_id,ordem);
create index if not exists perguntas_user_materia_idx on public.perguntas(user_id,materia_id,subgenero_id);
create index if not exists historico_user_data_idx on public.historico_respostas(user_id,respondido_em desc);
create index if not exists documentos_user_analise_idx on public.documentos_prova(user_id,analise_id);
create index if not exists questoes_user_analise_idx on public.questoes_extraidas(user_id,analise_id,materia_nome,assunto_nome);
create unique index if not exists frequencias_analise_assunto_uq on public.frequencias_assuntos(analise_id,user_id,materia_nome,assunto_nome);
create index if not exists frequencias_user_peso_idx on public.frequencias_assuntos(user_id,analise_id,peso desc);

-- Triggers updated_at.
do $$ declare t text; begin
  foreach t in array array['materias','subgeneros','cronogramas','fases','tarefas','paginas','perguntas','analises_provas'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I',t,t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
  end loop;
end $$;

-- RLS: remove políticas antigas para evitar permissões aditivas e instala uma política uniforme.
do $$ declare v_table text; p record; begin
  foreach v_table in array array['materias','subgeneros','cronogramas','fases','tarefas','datas_importantes','paginas','perguntas','historico_respostas','analises_provas','documentos_prova','questoes_extraidas','frequencias_assuntos'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    for p in select policyname from pg_policies where schemaname='public' and tablename=v_table loop
      execute format('drop policy if exists %I on public.%I',p.policyname,v_table);
    end loop;
    execute format('create policy "owner_all" on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',v_table);
    execute format('revoke all on public.%I from anon',v_table);
  end loop;
end $$;

-- Views respeitam o RLS das tabelas-base.
drop view if exists public.vw_progresso_fases;
create view public.vw_progresso_fases with (security_invoker=true) as
select f.id fase_id,f.cronograma_id,f.user_id,f.nome fase_nome,f.cor,f.ordem,f.data_inicio,f.data_prazo,
 count(t.id) total_tarefas,count(t.id) filter(where t.status='concluido') tarefas_concluidas,
 case when count(t.id)=0 then 0 else round(100.0*count(t.id) filter(where t.status='concluido')/count(t.id)) end percentual_concluido
from public.fases f left join public.tarefas t on t.fase_id=f.id and t.user_id=f.user_id
group by f.id;

drop view if exists public.vw_tarefas_hoje;
create view public.vw_tarefas_hoje with (security_invoker=true) as
select t.*,c.nome cronograma_nome,c.cor cronograma_cor,f.nome fase_nome
from public.tarefas t left join public.cronogramas c on c.id=t.cronograma_id and c.user_id=t.user_id
left join public.fases f on f.id=t.fase_id and f.user_id=t.user_id
where t.status<>'concluido' and t.data_prazo is not null and t.data_prazo<=current_date;

revoke all on public.vw_progresso_fases,public.vw_tarefas_hoje from anon;
grant select on public.vw_progresso_fases,public.vw_tarefas_hoje to authenticated;

-- Remove colunas duplicadas somente depois de copiar os dados.
alter table public.cronogramas drop column if exists data_alvo;
alter table public.cronogramas drop column if exists ritmo_horas_dia;

notify pgrst,'reload schema';
commit;
