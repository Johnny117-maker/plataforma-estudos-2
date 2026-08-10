begin;

create or replace function public.criar_cronograma_completo(p_cronograma jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_cronograma uuid;
  v_fase uuid;
  v_fase_json jsonb;
  v_tarefa jsonb;
  v_fase_ordem integer := 0;
  v_tarefa_ordem integer;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_cronograma->'fases') <> 'array' then raise exception 'fases deve ser um array'; end if;
  if jsonb_array_length(p_cronograma->'fases') > 50 then raise exception 'Limite de 50 fases'; end if;

  insert into cronogramas(user_id,nome,descricao,cor,categoria,ativo,data_final,horas_por_dia,analise_id)
  values(
    v_user,
    left(coalesce(nullif(trim(p_cronograma->>'nome'),''),'Novo cronograma'),160),
    nullif(p_cronograma->>'descricao',''),
    coalesce(nullif(p_cronograma->>'cor',''),'#F2C811'),
    coalesce(nullif(p_cronograma->>'categoria',''),'estudos'),
    coalesce((p_cronograma->>'ativo')::boolean,true),
    nullif(p_cronograma->>'data_final','')::date,
    nullif(p_cronograma->>'horas_por_dia','')::numeric,
    nullif(p_cronograma->>'analise_id','')::uuid
  ) returning id into v_cronograma;

  for v_fase_json in select value from jsonb_array_elements(p_cronograma->'fases') loop
    if jsonb_typeof(v_fase_json->'tarefas') <> 'array' then raise exception 'tarefas deve ser um array'; end if;
    if jsonb_array_length(v_fase_json->'tarefas') > 300 then raise exception 'Limite de 300 tarefas por fase'; end if;
    insert into fases(user_id,cronograma_id,nome,descricao,cor,peso,ordem,data_inicio,data_prazo)
    values(v_user,v_cronograma,left(coalesce(nullif(trim(v_fase_json->>'nome'),''),'Fase'),160),
      nullif(v_fase_json->>'descricao',''),coalesce(nullif(v_fase_json->>'cor',''),'#F2C811'),
      coalesce(nullif(v_fase_json->>'peso','')::numeric,1),v_fase_ordem,
      nullif(v_fase_json->>'data_inicio','')::date,nullif(v_fase_json->>'data_prazo','')::date)
    returning id into v_fase;
    v_tarefa_ordem := 0;
    for v_tarefa in select value from jsonb_array_elements(v_fase_json->'tarefas') loop
      insert into tarefas(user_id,cronograma_id,fase_id,materia_id,titulo,descricao,status,prioridade,data_inicio,data_prazo,horas_estimadas,ordem)
      values(v_user,v_cronograma,v_fase,nullif(v_tarefa->>'materia_id','')::uuid,
        left(coalesce(nullif(trim(v_tarefa->>'titulo'),''),'Tarefa'),300),nullif(v_tarefa->>'descricao',''),
        coalesce(nullif(v_tarefa->>'status',''),'nao_iniciado'),coalesce(nullif(v_tarefa->>'prioridade',''),'media'),
        nullif(v_tarefa->>'data_inicio','')::date,nullif(v_tarefa->>'data_prazo','')::date,
        nullif(v_tarefa->>'horas_estimadas','')::numeric,v_tarefa_ordem);
      v_tarefa_ordem := v_tarefa_ordem+1;
    end loop;
    v_fase_ordem := v_fase_ordem+1;
  end loop;
  return v_cronograma;
end;
$$;

create or replace function public.duplicar_cronograma_atomico(p_cronograma_id uuid,p_novo_nome text)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_novo uuid; v_fase record; v_nova_fase uuid;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  insert into cronogramas(user_id,nome,descricao,cor,categoria,ativo,data_final,horas_por_dia,analise_id)
  select v_user,left(coalesce(nullif(trim(p_novo_nome),''),nome||' (cópia)'),160),descricao,cor,categoria,true,data_final,horas_por_dia,analise_id
  from cronogramas where id=p_cronograma_id and user_id=v_user returning id into v_novo;
  if v_novo is null then raise exception 'Cronograma não encontrado'; end if;

  for v_fase in select * from fases where cronograma_id=p_cronograma_id and user_id=v_user order by ordem loop
    insert into fases(user_id,cronograma_id,nome,descricao,cor,peso,ordem,data_inicio,data_prazo)
    values(v_user,v_novo,v_fase.nome,v_fase.descricao,v_fase.cor,v_fase.peso,v_fase.ordem,v_fase.data_inicio,v_fase.data_prazo)
    returning id into v_nova_fase;
    insert into tarefas(user_id,cronograma_id,fase_id,materia_id,titulo,descricao,status,prioridade,data_inicio,data_prazo,horas_estimadas,ordem)
    select v_user,v_novo,v_nova_fase,materia_id,titulo,descricao,status,prioridade,data_inicio,data_prazo,horas_estimadas,ordem
    from tarefas where cronograma_id=p_cronograma_id and fase_id=v_fase.id and user_id=v_user;
  end loop;
  insert into tarefas(user_id,cronograma_id,fase_id,materia_id,titulo,descricao,status,prioridade,data_inicio,data_prazo,horas_estimadas,ordem)
  select v_user,v_novo,null,materia_id,titulo,descricao,status,prioridade,data_inicio,data_prazo,horas_estimadas,ordem
  from tarefas where cronograma_id=p_cronograma_id and fase_id is null and user_id=v_user;
  insert into datas_importantes(user_id,cronograma_id,titulo,data,cor,observacao)
  select v_user,v_novo,titulo,data,cor,observacao from datas_importantes where cronograma_id=p_cronograma_id and user_id=v_user;
  return v_novo;
end;
$$;

create or replace function public.aplicar_reorganizacao_cronograma(p_cronograma_id uuid,p_atualizacoes jsonb)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_item jsonb; v_afetadas integer:=0;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_atualizacoes)<>'array' or jsonb_array_length(p_atualizacoes)>2000 then raise exception 'Atualizações inválidas'; end if;
  if not exists(select 1 from cronogramas where id=p_cronograma_id and user_id=v_user) then raise exception 'Cronograma não encontrado'; end if;
  for v_item in select value from jsonb_array_elements(p_atualizacoes) loop
    update tarefas set ordem=coalesce((v_item->>'ordem')::integer,ordem),data_prazo=coalesce(nullif(v_item->>'data_prazo','')::date,data_prazo)
    where id=(v_item->>'tarefa_id')::uuid and cronograma_id=p_cronograma_id and user_id=v_user;
    get diagnostics v_afetadas=row_count;
    if v_afetadas<>1 then raise exception 'Tarefa inválida na reorganização'; end if;
  end loop;
  update fases f set data_inicio=x.min_data,data_prazo=x.max_data
  from (select fase_id,min(data_prazo) min_data,max(data_prazo) max_data from tarefas where cronograma_id=p_cronograma_id and user_id=v_user and fase_id is not null group by fase_id) x
  where f.id=x.fase_id and f.user_id=v_user;
end;
$$;

create or replace function public.salvar_analise_provas(p_nome text,p_documentos jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_analise uuid; v_documento uuid; v_doc jsonb; v_q jsonb; v_total_q integer:=0;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if jsonb_typeof(p_documentos)<>'array' or jsonb_array_length(p_documentos)<1 or jsonb_array_length(p_documentos)>20 then raise exception 'Envie entre 1 e 20 documentos'; end if;
  select coalesce(sum(jsonb_array_length(value->'questoes')),0) into v_total_q from jsonb_array_elements(p_documentos);
  if v_total_q>2000 then raise exception 'Limite de 2.000 questões por análise'; end if;
  insert into analises_provas(user_id,nome,status,total_documentos,total_questoes)
  values(v_user,left(coalesce(nullif(trim(p_nome),''),'Análise de provas'),160),'concluida',jsonb_array_length(p_documentos),v_total_q)
  returning id into v_analise;

  for v_doc in select value from jsonb_array_elements(p_documentos) loop
    insert into documentos_prova(user_id,analise_id,nome_arquivo,tipo_arquivo,tamanho_bytes,hash_sha256,perfil,total_paginas,total_questoes,texto_extraido,avisos)
    values(v_user,v_analise,left(v_doc->>'nome_arquivo',260),coalesce(v_doc->>'tipo_arquivo','desconhecido'),coalesce((v_doc->>'tamanho_bytes')::bigint,0),
      nullif(v_doc->>'hash_sha256',''),nullif(v_doc->>'perfil',''),nullif(v_doc->>'total_paginas','')::integer,jsonb_array_length(v_doc->'questoes'),
      nullif(v_doc->>'texto_extraido',''),coalesce(v_doc->'avisos','[]'::jsonb)) returning id into v_documento;
    for v_q in select value from jsonb_array_elements(v_doc->'questoes') loop
      insert into questoes_extraidas(user_id,analise_id,documento_id,numero,pagina,enunciado,alternativas,resposta_correta,materia_id,subgenero_id,materia_nome,assunto_nome,dificuldade,confianca,depende_de_visual,metadados)
      values(v_user,v_analise,v_documento,nullif(v_q->>'numero','')::integer,nullif(v_q->>'pagina','')::integer,v_q->>'enunciado',
        coalesce(v_q->'alternativas','[]'::jsonb),nullif(v_q->>'resposta_correta',''),nullif(v_q->>'materia_id','')::uuid,nullif(v_q->>'subgenero_id','')::uuid,
        left(coalesce(nullif(v_q->>'materia_nome',''),'Não classificada'),120),left(coalesce(nullif(v_q->>'assunto_nome',''),'Não classificado'),160),
        coalesce(nullif(v_q->>'dificuldade',''),'media'),nullif(v_q->>'confianca','')::numeric,coalesce((v_q->>'depende_de_visual')::boolean,false),coalesce(v_q->'metadados','{}'::jsonb));
    end loop;
  end loop;

  insert into frequencias_assuntos(user_id,analise_id,materia_nome,assunto_nome,total_documentos,total_questoes,percentual,peso)
  select v_user,v_analise,q.materia_nome,q.assunto_nome,count(distinct q.documento_id),count(*),
    round(count(*)::numeric/greatest(v_total_q,1),4),round((count(*)::numeric*count(distinct q.documento_id))/greatest(jsonb_array_length(p_documentos),1),4)
  from questoes_extraidas q where q.analise_id=v_analise and q.user_id=v_user
  group by q.materia_nome,q.assunto_nome;
  update analises_provas set resumo=jsonb_build_object('assuntos', (select count(*) from frequencias_assuntos where analise_id=v_analise),'classificadas',(select count(*) from questoes_extraidas where analise_id=v_analise and materia_nome<>'Não classificada')) where id=v_analise;
  return v_analise;
end;
$$;

create or replace function public.gerar_cronograma_da_analise(p_analise_id uuid,p_data_inicio date,p_data_final date,p_horas_por_dia numeric default 2)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_cronograma uuid; v_alta uuid; v_media uuid; v_baixa uuid; v_f record; v_max numeric; v_total integer; v_i integer:=0; v_fase uuid; v_data date;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if p_data_inicio is null or p_data_final is null or p_data_inicio>p_data_final then raise exception 'Intervalo de datas inválido'; end if;
  if p_horas_por_dia is null or p_horas_por_dia<=0 then raise exception 'Horas por dia deve ser maior que zero'; end if;
  if not exists(select 1 from analises_provas where id=p_analise_id and user_id=v_user and status='concluida') then raise exception 'Análise não encontrada'; end if;
  select max(peso),count(*) into v_max,v_total from frequencias_assuntos where analise_id=p_analise_id and user_id=v_user and materia_nome<>'Não classificada';
  if coalesce(v_total,0)=0 then raise exception 'A análise não possui assuntos classificados'; end if;
  insert into cronogramas(user_id,nome,cor,categoria,ativo,data_final,horas_por_dia,analise_id)
  select v_user,'Estudos — '||left(nome,130),'#F2C811','estudos',true,p_data_final,p_horas_por_dia,id from analises_provas where id=p_analise_id returning id into v_cronograma;
  insert into fases(user_id,cronograma_id,nome,cor,peso,ordem,data_inicio,data_prazo) values(v_user,v_cronograma,'Alta prioridade','#F85149',3,0,p_data_inicio,p_data_final) returning id into v_alta;
  insert into fases(user_id,cronograma_id,nome,cor,peso,ordem,data_inicio,data_prazo) values(v_user,v_cronograma,'Média prioridade','#F2C811',2,1,p_data_inicio,p_data_final) returning id into v_media;
  insert into fases(user_id,cronograma_id,nome,cor,peso,ordem,data_inicio,data_prazo) values(v_user,v_cronograma,'Revisão e consolidação','#3FB950',1,2,p_data_inicio,p_data_final) returning id into v_baixa;
  for v_f in select * from frequencias_assuntos where analise_id=p_analise_id and user_id=v_user and materia_nome<>'Não classificada' order by peso desc,materia_nome,assunto_nome loop
    v_fase:=case when v_f.peso>=v_max*0.67 then v_alta when v_f.peso>=v_max*0.34 then v_media else v_baixa end;
    v_data:=p_data_inicio+floor(v_i::numeric*greatest(p_data_final-p_data_inicio,0)/greatest(v_total-1,1))::integer;
    insert into tarefas(user_id,cronograma_id,fase_id,titulo,descricao,status,prioridade,data_prazo,horas_estimadas,ordem)
    values(v_user,v_cronograma,v_fase,'Estudar '||v_f.assunto_nome||' — '||v_f.materia_nome,
      format('Baseado em %s questão(ões), presente em %s documento(s).',v_f.total_questoes,v_f.total_documentos),'nao_iniciado',
      case when v_fase=v_alta then 'alta' when v_fase=v_media then 'media' else 'baixa' end,v_data,least(4,greatest(1,v_f.total_questoes::numeric/2)),v_i);
    v_i:=v_i+1;
  end loop;
  return v_cronograma;
end;
$$;

revoke all on function public.criar_cronograma_completo(jsonb) from public,anon;
revoke all on function public.duplicar_cronograma_atomico(uuid,text) from public,anon;
revoke all on function public.aplicar_reorganizacao_cronograma(uuid,jsonb) from public,anon;
revoke all on function public.salvar_analise_provas(text,jsonb) from public,anon;
revoke all on function public.gerar_cronograma_da_analise(uuid,date,date,numeric) from public,anon;
grant execute on function public.criar_cronograma_completo(jsonb),public.duplicar_cronograma_atomico(uuid,text),public.aplicar_reorganizacao_cronograma(uuid,jsonb),public.salvar_analise_provas(text,jsonb),public.gerar_cronograma_da_analise(uuid,date,date,numeric) to authenticated;

notify pgrst,'reload schema';
commit;
