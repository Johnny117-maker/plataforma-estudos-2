-- Limpeza controlada do banco de questões do usuário e publicação atômica
-- das imagens. Nenhuma matéria, cronograma ou análise de provas é removida.

begin;

create or replace function public.limpar_banco_questoes()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_perguntas integer := 0;
  v_testes integer := 0;
  v_respostas integer := 0;
  v_provas integer := 0;
  v_gabaritos integer := 0;
  v_imagens jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Autenticação obrigatória'; end if;

  select count(*) into v_perguntas from public.perguntas where user_id = v_user;
  select count(*) into v_testes from public.testes where user_id = v_user;
  select count(*) into v_respostas from public.historico_respostas where user_id = v_user;
  select count(*) into v_provas from public.provas_banco where user_id = v_user;
  select count(*) into v_gabaritos from public.gabarito_versoes where user_id = v_user;
  select coalesce(jsonb_agg(distinct imagem_url), '[]'::jsonb)
    into v_imagens
  from public.perguntas
  where user_id = v_user and imagem_url is not null and trim(imagem_url) <> '';

  -- A ordem respeita as chaves estrangeiras. Exclusões em cascata removem
  -- teste_questoes, itens de gabarito e vínculos dependentes.
  delete from public.testes where user_id = v_user;
  delete from public.perguntas where user_id = v_user;
  delete from public.provas_banco where user_id = v_user;

  return jsonb_build_object(
    'perguntas_removidas', v_perguntas,
    'testes_removidos', v_testes,
    'respostas_removidas', v_respostas,
    'provas_removidas', v_provas,
    'gabaritos_removidos', v_gabaritos,
    'imagens', v_imagens
  );
end;
$$;

-- A função antiga inseria as perguntas e o frontend vinculava as imagens em
-- uma segunda chamada. Esta fachada executa as duas operações na mesma
-- transação: se o vínculo falhar, nenhuma questão parcial é publicada.
create or replace function public.publicar_banco_questoes_v2(p_nome text, p_provas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resultado jsonb;
  v_imagens jsonb;
  v_vinculadas integer := 0;
begin
  v_resultado := public.publicar_banco_questoes(p_nome, p_provas);

  select coalesce(jsonb_agg(jsonb_build_object(
    'hash_sha256', prova->>'hash_sha256',
    'numero', questao->>'numero',
    'imagem_url', questao->>'imagem_url'
  )), '[]'::jsonb)
  into v_imagens
  from jsonb_array_elements(coalesce(p_provas, '[]'::jsonb)) prova
  cross join lateral jsonb_array_elements(coalesce(prova->'questoes', '[]'::jsonb)) questao
  where nullif(trim(questao->>'imagem_url'), '') is not null;

  if jsonb_array_length(v_imagens) > 0 then
    v_vinculadas := public.vincular_imagens_perguntas(v_imagens);
    if v_vinculadas <> jsonb_array_length(v_imagens) then
      raise exception 'Foram vinculadas % de % imagens; a publicação foi cancelada para evitar dados incompletos',
        v_vinculadas, jsonb_array_length(v_imagens);
    end if;
  end if;

  return v_resultado || jsonb_build_object('imagens_vinculadas', v_vinculadas);
end;
$$;

revoke all on function public.limpar_banco_questoes() from public, anon;
revoke all on function public.publicar_banco_questoes_v2(text, jsonb) from public, anon;
grant execute on function public.limpar_banco_questoes() to authenticated;
grant execute on function public.publicar_banco_questoes_v2(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
