-- Banco reutilizável de questões extraídas de provas e seus gabaritos.
-- A migração é somente aditiva: perguntas e históricos existentes são mantidos.

begin;

create table if not exists public.provas_banco (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analise_id uuid,
  titulo text not null,
  instituicao text,
  ano integer,
  semestre integer,
  nome_arquivo text not null,
  hash_sha256 text,
  gabarito_nome_arquivo text,
  status text not null default 'em_revisao',
  total_questoes integer not null default 0,
  questoes_publicadas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gabarito_versoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prova_id uuid not null,
  versao integer not null default 1,
  nome_arquivo text not null,
  retificado boolean not null default false,
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists public.gabarito_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prova_id uuid not null,
  gabarito_versao_id uuid not null,
  numero integer not null,
  resposta text not null,
  disciplina text,
  pagina integer,
  retificada boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.perguntas add column if not exists prova_id uuid;
alter table public.perguntas add column if not exists numero_original integer;
alter table public.perguntas add column if not exists pagina_origem integer;
alter table public.perguntas add column if not exists status_revisao text not null default 'manual';
alter table public.perguntas add column if not exists confianca_extracao numeric(4,3);
alter table public.perguntas add column if not exists possui_elemento_visual boolean not null default false;
alter table public.perguntas add column if not exists imagem_url text;
alter table public.perguntas add column if not exists hash_conteudo text;
alter table public.perguntas add column if not exists metadados jsonb not null default '{}'::jsonb;

create table if not exists public.testes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  status text not null default 'em_andamento',
  criterios jsonb not null default '{}'::jsonb,
  total_questoes integer not null default 0,
  acertos integer,
  percentual numeric(6,2),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.teste_questoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  teste_id uuid not null,
  pergunta_id uuid not null,
  ordem integer not null,
  created_at timestamptz not null default now()
);

alter table public.historico_respostas add column if not exists teste_id uuid;
alter table public.historico_respostas add column if not exists tempo_segundos integer;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='provas_banco_id_user_key') then
    alter table public.provas_banco add constraint provas_banco_id_user_key unique(id,user_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='gabarito_versoes_id_prova_user_key') then
    alter table public.gabarito_versoes add constraint gabarito_versoes_id_prova_user_key unique(id,prova_id,user_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='testes_id_user_key') then
    alter table public.testes add constraint testes_id_user_key unique(id,user_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='provas_banco_analise_owner_fk') then
    alter table public.provas_banco add constraint provas_banco_analise_owner_fk
      foreign key(analise_id,user_id) references public.analises_provas(id,user_id) on delete set null (analise_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='gabarito_versoes_prova_owner_fk') then
    alter table public.gabarito_versoes add constraint gabarito_versoes_prova_owner_fk
      foreign key(prova_id,user_id) references public.provas_banco(id,user_id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='gabarito_itens_versao_owner_fk') then
    alter table public.gabarito_itens add constraint gabarito_itens_versao_owner_fk
      foreign key(gabarito_versao_id,prova_id,user_id)
      references public.gabarito_versoes(id,prova_id,user_id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_prova_owner_fk') then
    alter table public.perguntas add constraint perguntas_prova_owner_fk
      foreign key(prova_id,user_id) references public.provas_banco(id,user_id) on delete set null (prova_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='teste_questoes_teste_owner_fk') then
    alter table public.teste_questoes add constraint teste_questoes_teste_owner_fk
      foreign key(teste_id,user_id) references public.testes(id,user_id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='teste_questoes_pergunta_owner_fk') then
    alter table public.teste_questoes add constraint teste_questoes_pergunta_owner_fk
      foreign key(pergunta_id,user_id) references public.perguntas(id,user_id) on delete cascade;
  end if;
  if not exists(select 1 from pg_constraint where conname='historico_teste_owner_fk') then
    alter table public.historico_respostas add constraint historico_teste_owner_fk
      foreign key(teste_id,user_id) references public.testes(id,user_id) on delete set null (teste_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='provas_banco_status_check') then
    alter table public.provas_banco add constraint provas_banco_status_check
      check(status in ('em_revisao','pronta','com_pendencias'));
  end if;
  if not exists(select 1 from pg_constraint where conname='provas_banco_semestre_check') then
    alter table public.provas_banco add constraint provas_banco_semestre_check
      check(semestre is null or semestre in (1,2));
  end if;
  if not exists(select 1 from pg_constraint where conname='gabarito_itens_resposta_check') then
    alter table public.gabarito_itens add constraint gabarito_itens_resposta_check check(resposta in ('A','B','C','D','E'));
  end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_status_revisao_check') then
    alter table public.perguntas add constraint perguntas_status_revisao_check
      check(status_revisao in ('manual','pendente','aprovada','rejeitada'));
  end if;
  if not exists(select 1 from pg_constraint where conname='perguntas_confianca_extracao_check') then
    alter table public.perguntas add constraint perguntas_confianca_extracao_check
      check(confianca_extracao is null or confianca_extracao between 0 and 1);
  end if;
  if not exists(select 1 from pg_constraint where conname='testes_status_check') then
    alter table public.testes add constraint testes_status_check
      check(status in ('em_andamento','concluido','cancelado'));
  end if;
end $$;

create unique index if not exists provas_banco_user_hash_uq
  on public.provas_banco(user_id,hash_sha256) where hash_sha256 is not null;
create unique index if not exists gabarito_versao_numero_uq
  on public.gabarito_versoes(prova_id,user_id,versao);
create unique index if not exists gabarito_item_numero_uq
  on public.gabarito_itens(gabarito_versao_id,user_id,numero);
create index if not exists perguntas_user_hash_idx
  on public.perguntas(user_id,hash_conteudo) where hash_conteudo is not null;
create unique index if not exists teste_questoes_ordem_uq on public.teste_questoes(teste_id,user_id,ordem);
create unique index if not exists teste_questoes_pergunta_uq on public.teste_questoes(teste_id,user_id,pergunta_id);
create index if not exists perguntas_user_prova_idx on public.perguntas(user_id,prova_id,numero_original);
create index if not exists testes_user_created_idx on public.testes(user_id,created_at desc);
create index if not exists historico_user_teste_idx on public.historico_respostas(user_id,teste_id,respondido_em);

create or replace function public.preencher_hash_pergunta_banco()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_texto text;
begin
  v_texto:=trim(lower(regexp_replace(coalesce(new.enunciado,''),'\s+',' ','g')));
  new.hash_conteudo:=case when length(v_texto)>=40 then encode(digest(v_texto,'sha256'),'hex') else null end;
  return new;
end;
$$;

drop trigger if exists perguntas_preencher_hash on public.perguntas;
create trigger perguntas_preencher_hash before insert or update of enunciado on public.perguntas
for each row execute function public.preencher_hash_pergunta_banco();

update public.perguntas set enunciado=enunciado where hash_conteudo is null;

drop trigger if exists trg_provas_banco_updated_at on public.provas_banco;
create trigger trg_provas_banco_updated_at before update on public.provas_banco
for each row execute function public.set_updated_at();

do $$ declare v_table text; p record; begin
  foreach v_table in array array['provas_banco','gabarito_versoes','gabarito_itens','testes','teste_questoes'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    for p in select policyname from pg_policies where schemaname='public' and tablename=v_table loop
      execute format('drop policy if exists %I on public.%I',p.policyname,v_table);
    end loop;
    execute format('create policy "owner_all" on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',v_table);
    execute format('revoke all on public.%I from anon',v_table);
  end loop;
end $$;

create or replace function public.publicar_banco_questoes(p_nome text,p_provas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_prova_json jsonb;
  v_gabarito_json jsonb;
  v_questao jsonb;
  v_prova uuid;
  v_versao uuid;
  v_numero_versao integer;
  v_materia uuid;
  v_subgenero uuid;
  v_hash text;
  v_resposta text;
  v_inseridas integer:=0;
  v_duplicadas integer:=0;
  v_ignoradas integer:=0;
  v_provas integer:=0;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_provas)<>'array' or jsonb_array_length(p_provas)<1 or jsonb_array_length(p_provas)>20 then
    raise exception 'Envie entre 1 e 20 provas prontas';
  end if;

  for v_prova_json in select value from jsonb_array_elements(p_provas) loop
    if jsonb_typeof(v_prova_json->'questoes')<>'array' or jsonb_array_length(v_prova_json->'questoes')>300 then
      raise exception 'Questões inválidas para a prova';
    end if;
    v_prova:=null;
    v_hash:=nullif(v_prova_json->>'hash_sha256','');
    if v_hash is not null then
      select id into v_prova from provas_banco where user_id=v_user and hash_sha256=v_hash;
    end if;
    if v_prova is null then
      insert into provas_banco(user_id,analise_id,titulo,instituicao,ano,semestre,nome_arquivo,hash_sha256,gabarito_nome_arquivo,status,total_questoes)
      values(v_user,nullif(v_prova_json->>'analise_id','')::uuid,
        left(coalesce(nullif(trim(v_prova_json->>'titulo'),''),nullif(trim(p_nome),''),'Prova importada'),180),
        nullif(v_prova_json->>'instituicao',''),nullif(v_prova_json->>'ano','')::integer,
        nullif(v_prova_json->>'semestre','')::integer,left(v_prova_json->>'nome_arquivo',260),v_hash,
        left(v_prova_json->>'gabarito_nome_arquivo',260),'em_revisao',
        coalesce(nullif(v_prova_json->>'total_questoes_origem','')::integer,jsonb_array_length(v_prova_json->'questoes')))
      returning id into v_prova;
      v_provas:=v_provas+1;
    else
      update provas_banco set
        analise_id=coalesce(nullif(v_prova_json->>'analise_id','')::uuid,analise_id),
        titulo=left(coalesce(nullif(trim(v_prova_json->>'titulo'),''),titulo),180),
        gabarito_nome_arquivo=left(coalesce(nullif(v_prova_json->>'gabarito_nome_arquivo',''),gabarito_nome_arquivo),260),
        total_questoes=greatest(total_questoes,
          coalesce(nullif(v_prova_json->>'total_questoes_origem','')::integer,jsonb_array_length(v_prova_json->'questoes')))
      where id=v_prova and user_id=v_user;
    end if;

    select coalesce(max(versao),0)+1 into v_numero_versao from gabarito_versoes where prova_id=v_prova and user_id=v_user;
    insert into gabarito_versoes(user_id,prova_id,versao,nome_arquivo,retificado)
    values(v_user,v_prova,v_numero_versao,left(coalesce(v_prova_json->>'gabarito_nome_arquivo','Gabarito'),260),
      coalesce((v_prova_json->>'gabarito_retificado')::boolean,false)) returning id into v_versao;

    for v_gabarito_json in select value from jsonb_array_elements(coalesce(v_prova_json->'gabarito_itens','[]'::jsonb)) loop
      v_resposta:=upper(v_gabarito_json->>'resposta');
      if v_resposta in ('A','B','C','D','E') and nullif(v_gabarito_json->>'numero','')::integer between 1 and 300 then
        insert into gabarito_itens(user_id,prova_id,gabarito_versao_id,numero,resposta,disciplina,pagina,retificada)
        values(v_user,v_prova,v_versao,(v_gabarito_json->>'numero')::integer,v_resposta,
          nullif(v_gabarito_json->>'disciplina',''),nullif(v_gabarito_json->>'pagina','')::integer,
          coalesce((v_gabarito_json->>'retificada')::boolean,false));
      end if;
    end loop;

    for v_questao in select value from jsonb_array_elements(v_prova_json->'questoes') loop
      v_resposta:=upper(v_questao->>'resposta');
      if jsonb_typeof(v_questao->'alternativas')<>'array'
        or jsonb_array_length(v_questao->'alternativas')<>5
        or v_resposta not in ('A','B','C','D','E')
        or length(trim(coalesce(v_questao->>'enunciado','')))<40 then
        v_ignoradas:=v_ignoradas+1;
        continue;
      end if;

      v_materia:=nullif(v_questao->>'materia_id','')::uuid;
      if v_materia is null or not exists(select 1 from materias where id=v_materia and user_id=v_user) then
        select id into v_materia from materias
        where user_id=v_user and lower(nome)=lower(v_questao->>'materia_nome') limit 1;
      end if;
      if v_materia is null then
        v_ignoradas:=v_ignoradas+1;
        continue;
      end if;

      v_subgenero:=nullif(v_questao->>'subgenero_id','')::uuid;
      if v_subgenero is not null and not exists(select 1 from subgeneros where id=v_subgenero and user_id=v_user and materia_id=v_materia) then
        v_subgenero:=null;
      end if;

      v_hash:=encode(digest(trim(lower(regexp_replace(v_questao->>'enunciado','\s+',' ','g'))),'sha256'),'hex');
      if exists(select 1 from perguntas where user_id=v_user and hash_conteudo=v_hash) then
        v_duplicadas:=v_duplicadas+1;
        continue;
      end if;

      insert into perguntas(user_id,materia_id,subgenero_id,enunciado,tipo,alternativas,resposta_correta,dificuldade,fonte,
        prova_id,numero_original,pagina_origem,status_revisao,confianca_extracao,possui_elemento_visual,metadados)
      values(v_user,v_materia,v_subgenero,trim(v_questao->>'enunciado'),'multipla_escolha',v_questao->'alternativas',
        (position(v_resposta in 'ABCDE')-1)::text,coalesce(nullif(v_questao->>'dificuldade',''),'media'),
        concat_ws(' · ',nullif(v_prova_json->>'instituicao',''),nullif(v_prova_json->>'ano',''),
          case when nullif(v_prova_json->>'semestre','') is not null then (v_prova_json->>'semestre')||'º semestre' end),
        v_prova,nullif(v_questao->>'numero','')::integer,nullif(v_questao->>'pagina','')::integer,'aprovada',
        nullif(v_questao->>'confianca','')::numeric,coalesce((v_questao->>'depende_de_visual')::boolean,false),
        jsonb_build_object('descricao_visual',v_questao->>'descricao_visual','assunto_extraido',v_questao->>'assunto_nome',
          'gabarito_retificado',coalesce((v_questao->>'gabarito_retificado')::boolean,false)));
      v_inseridas:=v_inseridas+1;
    end loop;

    update provas_banco set
      questoes_publicadas=(select count(*) from perguntas where prova_id=v_prova and user_id=v_user),
      status=case when (select count(*) from perguntas where prova_id=v_prova and user_id=v_user)>=total_questoes then 'pronta' else 'com_pendencias' end
    where id=v_prova and user_id=v_user;
  end loop;

  return jsonb_build_object('provas_criadas',v_provas,'questoes_inseridas',v_inseridas,
    'questoes_duplicadas',v_duplicadas,'questoes_ignoradas',v_ignoradas);
end;
$$;

create or replace function public.criar_teste_banco(p_titulo text,p_perguntas jsonb,p_criterios jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_teste uuid; v_item jsonb; v_ordem integer:=0;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_perguntas)<>'array' or jsonb_array_length(p_perguntas)<1 or jsonb_array_length(p_perguntas)>200 then
    raise exception 'O teste deve ter entre 1 e 200 questões';
  end if;
  insert into testes(user_id,titulo,criterios,total_questoes)
  values(v_user,left(coalesce(nullif(trim(p_titulo),''),'Teste de revisão'),180),coalesce(p_criterios,'{}'::jsonb),0)
  returning id into v_teste;
  for v_item in select value from jsonb_array_elements(p_perguntas) loop
    insert into teste_questoes(user_id,teste_id,pergunta_id,ordem)
    select v_user,v_teste,p.id,v_ordem from perguntas p
    where p.id=(trim(both '"' from v_item::text))::uuid and p.user_id=v_user
    on conflict do nothing;
    if found then v_ordem:=v_ordem+1; end if;
  end loop;
  if v_ordem=0 then raise exception 'Nenhuma questão válida foi encontrada'; end if;
  update testes set total_questoes=v_ordem where id=v_teste and user_id=v_user;
  return v_teste;
end;
$$;

create or replace function public.concluir_teste_banco(p_teste_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_total integer; v_acertos integer;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  select total_questoes into v_total from testes where id=p_teste_id and user_id=v_user;
  if v_total is null then raise exception 'Teste não encontrado'; end if;
  select count(*) filter(where correta) into v_acertos
  from historico_respostas where teste_id=p_teste_id and user_id=v_user;
  update testes set status='concluido',acertos=v_acertos,
    percentual=round(v_acertos::numeric/greatest(v_total,1)*100,2),finalizado_em=now()
  where id=p_teste_id and user_id=v_user;
  return jsonb_build_object('total',v_total,'acertos',v_acertos,
    'percentual',round(v_acertos::numeric/greatest(v_total,1)*100,2));
end;
$$;

revoke all on function public.publicar_banco_questoes(text,jsonb) from public,anon;
revoke all on function public.criar_teste_banco(text,jsonb,jsonb) from public,anon;
revoke all on function public.concluir_teste_banco(uuid) from public,anon;
grant execute on function public.publicar_banco_questoes(text,jsonb) to authenticated;
grant execute on function public.criar_teste_banco(text,jsonb,jsonb) to authenticated;
grant execute on function public.concluir_teste_banco(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
