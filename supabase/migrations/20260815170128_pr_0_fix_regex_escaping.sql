-- Correzione di un difetto di PR-0 (autorizzata da Ray, limitata a questo difetto).
--
-- In 20260815140002_pr_0_database_contract.sql il punto separatore è scritto con
-- due backslash. Il corpo di private.valid_embed_url è dollar-quoted e il CHECK
-- su site_contacts.email è una stringa a virgolette singole con
-- standard_conforming_strings = on: in entrambi i casi i backslash arrivano
-- intatti al motore regex, e in una ARE `\\` significa backslash letterale.
-- Il risultato è che nessun URL embed valido e nessuna email ordinaria sono
-- inseribili: il contratto rifiuta i dati che dovrebbe accettare.
--
-- Qui cambiano soltanto gli escape. L'allowlist degli host resta identica
-- carattere per carattere: la divergenza fra `soundcloud.com` e la §5 di L0.7
-- (che ammette anche `www.soundcloud.com`) è un'altra preoccupazione e non
-- viene toccata qui.

create or replace function private.valid_embed_url(provider public.embed_provider, value text)
returns boolean language sql immutable set search_path = '' as $$
  select case provider
    when 'spotify' then value ~ '^https://open\.spotify\.com/'
    when 'apple_music' then value ~ '^https://(music\.apple\.com|embed\.music\.apple\.com)/'
    when 'youtube' then value ~ '^https://(youtube\.com|www\.youtube\.com|music\.youtube\.com|youtu\.be)/'
    when 'soundcloud' then value ~ '^https://soundcloud\.com/'
    else false end;
$$;

-- Il nome è quello generato da Postgres per un CHECK di colonna inline,
-- verificato su pg_constraint prima di scriverlo qui. Ricreandolo con lo stesso
-- nome il messaggio d'errore resta stabile per chi lo asserisce nei test.
alter table public.site_contacts drop constraint site_contacts_email_check;
alter table public.site_contacts add constraint site_contacts_email_check
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
