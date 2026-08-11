begin;

create or replace function public.validar_relacoes_do_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  case tg_table_name

    when 'tarefas' then
      if new.materia_id is not null
         and not exists (
           select 1
           from public.materias
           where id = new.materia_id
             and user_id = new.user_id
         )
      then
        raise exception 'Matéria inválida para o usuário';
      end if;

    when 'perguntas' then
      if new.subgenero_id is not null
         and not exists (
           select 1
           from public.subgeneros
           where id = new.subgenero_id
             and materia_id = new.materia_id
             and user_id = new.user_id
         )
      then
        raise exception 'Assunto não pertence à matéria/usuário';
      end if;

    when 'paginas' then
      if new.parent_id is not null
         and not exists (
           select 1
           from public.paginas
           where id = new.parent_id
             and user_id = new.user_id
             and id <> new.id
         )
      then
        raise exception 'Página-pai inválida';
      end if;

    when 'datas_importantes' then
      if new.cronograma_id is not null
         and not exists (
           select 1
           from public.cronogramas
           where id = new.cronograma_id
             and user_id = new.user_id
         )
      then
        raise exception 'Cronograma inválido para a data';
      end if;

    when 'cronogramas' then
      if new.analise_id is not null
         and not exists (
           select 1
           from public.analises_provas
           where id = new.analise_id
             and user_id = new.user_id
         )
      then
        raise exception 'Análise inválida para o cronograma';
      end if;

    when 'questoes_extraidas' then
      if new.materia_id is not null
         and not exists (
           select 1
           from public.materias
           where id = new.materia_id
             and user_id = new.user_id
         )
      then
        raise exception 'Matéria inválida para a questão extraída';
      end if;

      if new.subgenero_id is not null
         and not exists (
           select 1
           from public.subgeneros
           where id = new.subgenero_id
             and user_id = new.user_id
             and (
               new.materia_id is null
               or materia_id = new.materia_id
             )
         )
      then
        raise exception 'Assunto inválido para a questão extraída';
      end if;

  end case;

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;