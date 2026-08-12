-- Corrige bancos onde as funções do banco de questões já foram publicadas
-- procurando digest() apenas no schema public. No Supabase, pgcrypto fica no
-- schema extensions.

begin;

alter function public.preencher_hash_questao()
  set search_path = public, extensions;

alter function public.preencher_hash_pergunta_banco()
  set search_path = public, extensions;

alter function public.publicar_banco_questoes(text, jsonb)
  set search_path = public, extensions;

notify pgrst, 'reload schema';

commit;
