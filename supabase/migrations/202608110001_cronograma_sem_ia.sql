-- Destrava a geração de cronograma quando a classificação por IA não rodou.
--
-- A versão anterior filtrava `materia_nome <> 'Não classificada'` e levantava
-- exceção se sobrasse zero linha. Como serializarDocumentos() grava exatamente
-- 'Não classificada' toda vez que `q.classificacao` é nulo, bastava a IA falhar
-- no meio (Groq free tier, lote de 2, 107 questões = 54 chamadas) para a
-- geração ficar impossível — sem que nada indicasse o porquê.
--
-- Aqui: se houver assunto classificado, o comportamento é o de antes. Se não
-- houver nenhum, o cronograma é gerado mesmo assim, agrupando por matéria e
-- marcando as tarefas para revisão, em vez de recusar.

begin;

create or replace function public.gerar_cronograma_da_analise(
  p_analise_id uuid, p_data_inicio date, p_data_final date, p_horas_por_dia numeric default 2)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cronograma uuid;
  v_alta uuid; v_media uuid; v_baixa uuid;
  v_f record;
  v_max numeric; v_total integer; v_classificados integer;
  v_i integer := 0; v_fase uuid; v_data date;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;
  if p_data_inicio is null or p_data_final is null or p_data_inicio > p_data_final then
    raise exception 'Informe uma data de início e uma data final, com o início antes do fim';
  end if;
  if p_horas_por_dia is null or p_horas_por_dia <= 0 then
    raise exception 'Horas por dia deve ser maior que zero';
  end if;
  if not exists (select 1 from analises_provas
                 where id = p_analise_id and user_id = v_user and status = 'concluida') then
    raise exception 'Análise não encontrada';
  end if;

  select count(*) into v_classificados
  from frequencias_assuntos
  where analise_id = p_analise_id and user_id = v_user and materia_nome <> 'Não classificada';

  -- Sem nenhum assunto classificado, ainda assim há conteúdo salvo: usa tudo.
  select max(peso), count(*) into v_max, v_total
  from frequencias_assuntos
  where analise_id = p_analise_id and user_id = v_user
    and (v_classificados > 0 and materia_nome <> 'Não classificada' or v_classificados = 0);

  if coalesce(v_total, 0) = 0 then
    raise exception 'A análise não tem conteúdo salvo. Selecione ao menos uma questão e salve antes de gerar.';
  end if;

  insert into cronogramas (user_id, nome, cor, categoria, ativo, data_final, horas_por_dia, analise_id)
  select v_user, 'Estudos — ' || left(nome, 130), '#F2C811', 'estudos', true,
         p_data_final, p_horas_por_dia, id
  from analises_provas where id = p_analise_id
  returning id into v_cronograma;

  insert into fases (user_id, cronograma_id, nome, cor, peso, ordem, data_inicio, data_prazo)
  values (v_user, v_cronograma, 'Alta prioridade', '#F85149', 3, 0, p_data_inicio, p_data_final)
  returning id into v_alta;
  insert into fases (user_id, cronograma_id, nome, cor, peso, ordem, data_inicio, data_prazo)
  values (v_user, v_cronograma, 'Média prioridade', '#F2C811', 2, 1, p_data_inicio, p_data_final)
  returning id into v_media;
  insert into fases (user_id, cronograma_id, nome, cor, peso, ordem, data_inicio, data_prazo)
  values (v_user, v_cronograma, 'Revisão e consolidação', '#3FB950', 1, 2, p_data_inicio, p_data_final)
  returning id into v_baixa;

  for v_f in
    select * from frequencias_assuntos
    where analise_id = p_analise_id and user_id = v_user
      and (v_classificados > 0 and materia_nome <> 'Não classificada' or v_classificados = 0)
    order by peso desc, materia_nome, assunto_nome
  loop
    v_fase := case
                when v_f.peso >= v_max * 0.67 then v_alta
                when v_f.peso >= v_max * 0.34 then v_media
                else v_baixa
              end;
    v_data := p_data_inicio
              + floor(v_i::numeric * greatest(p_data_final - p_data_inicio, 0)
                      / greatest(v_total - 1, 1))::integer;

    insert into tarefas (user_id, cronograma_id, fase_id, titulo, descricao, status,
                         prioridade, data_prazo, horas_estimadas, ordem)
    values (
      v_user, v_cronograma, v_fase,
      left('Estudar ' || v_f.assunto_nome || ' — ' || v_f.materia_nome, 300),
      format('Baseado em %s questão(ões), presente em %s documento(s).%s',
             v_f.total_questoes, v_f.total_documentos,
             case when v_classificados = 0
                  then ' Gerado sem classificação por IA — revise o agrupamento.'
                  else '' end),
      'nao_iniciado',
      case when v_fase = v_alta then 'alta' when v_fase = v_media then 'media' else 'baixa' end,
      v_data,
      least(4, greatest(1, v_f.total_questoes::numeric / 2)),
      v_i);
    v_i := v_i + 1;
  end loop;

  return v_cronograma;
end;
$$;

revoke all on function public.gerar_cronograma_da_analise(uuid, date, date, numeric) from public, anon;
grant execute on function public.gerar_cronograma_da_analise(uuid, date, date, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;