-- Execute este arquivo UMA VEZ no SQL Editor depois de publicar
-- `analise-worker`. Substitua somente os dois valores abaixo.
--
-- A chave é a publishable/anon do projeto (a mesma VITE_SUPABASE_ANON_KEY),
-- nunca a service_role. Ela fica criptografada no Supabase Vault.

do $$
declare
  v_project_url text := 'https://SEU_PROJECT_REF.supabase.co';
  v_publishable_key text := 'SUA_CHAVE_PUBLICAVEL_OU_ANON';
  v_id uuid;
begin
  if v_project_url like '%SEU_PROJECT_REF%' or v_publishable_key like 'SUA_CHAVE%' then
    raise exception 'Substitua SEU_PROJECT_REF e SUA_CHAVE_PUBLICAVEL_OU_ANON antes de executar';
  end if;

  select id into v_id from vault.secrets where name = 'analise_worker_project_url';
  if v_id is null then
    perform vault.create_secret(v_project_url, 'analise_worker_project_url', 'URL usada pelo cron da análise');
  else
    perform vault.update_secret(v_id, v_project_url, 'analise_worker_project_url', 'URL usada pelo cron da análise');
  end if;

  select id into v_id from vault.secrets where name = 'analise_worker_publishable_key';
  if v_id is null then
    perform vault.create_secret(v_publishable_key, 'analise_worker_publishable_key', 'Chave pública usada pelo cron da análise');
  else
    perform vault.update_secret(v_id, v_publishable_key, 'analise_worker_publishable_key', 'Chave pública usada pelo cron da análise');
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'processar-analise-queue-cada-minuto';
end;
$$;

select cron.schedule(
  'processar-analise-queue-cada-minuto',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'analise_worker_project_url')
      || '/functions/v1/analise-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'analise_worker_publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'analise_worker_publishable_key')
    ),
    body := '{"acao":"cron"}'::jsonb
  );
  $cron$
);

-- Verificação: deve retornar um job ativo e a execução mais recente.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'processar-analise-queue-cada-minuto';
