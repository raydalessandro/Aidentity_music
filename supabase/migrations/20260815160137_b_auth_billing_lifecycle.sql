-- AIDENTITY filone B: ciclo di vita billing scritto dal solo webhook Stripe.
-- Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md §4 (+ §12 E1/E2).
--
-- Questa migrazione aggiunge soltanto oggetti nuovi. Nessun oggetto creato da
-- 20260815140002_pr_0_database_contract.sql viene alterato o sostituito.
--
-- Divisione delle responsabilita':
--   * la DECISIONE (evento -> stato) e' una funzione pura TypeScript testabile
--     con Vitest (app/api/stripe/_lib/lifecycle.ts);
--   * l'APPLICAZIONE e' qui, e non si fida della decisione: rivalida la coppia
--     (da, a) contro una whitelist, rifiuta la pubblicazione sotto hold di
--     moderazione, rifiuta la pubblicazione oltre quota e garantisce
--     l'idempotenza tramite la chiave primaria di public.billing_events.

-- ---------------------------------------------------------------------------
-- 1. Registro append-only degli eventi billing applicati.
--    E' insieme audit del ciclo di vita e chiave di idempotenza: Stripe
--    riconsegna lo stesso evento, la PK lo rifiuta, l'effetto resta uno solo.
-- ---------------------------------------------------------------------------
create table public.billing_events (
  stripe_event_id text primary key check (btrim(stripe_event_id) <> ''),
  site_id uuid not null references public.sites(id) on delete restrict,
  stripe_subscription_id text,
  rule text not null check (btrim(rule) <> ''),
  billing_status public.billing_status not null,
  plan_code public.plan_code not null references public.plans(code),
  billing_interval public.billing_interval not null,
  from_status public.publication_status not null,
  to_status public.publication_status not null,
  created_at timestamptz not null default now()
);
create index billing_events_site_idx on public.billing_events(site_id, created_at desc);

alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;

-- Il platform admin puo' leggere l'audit; nessun ruolo client lo scrive.
create policy billing_events_admin_read on public.billing_events
  for select to authenticated using (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. Fatti che il database possiede e la funzione pura non puo' calcolare.
-- ---------------------------------------------------------------------------

-- Uso EFFETTIVO oltre i limiti del piano candidato. Solo le righe non purgate
-- contano, esattamente come in PR-0: qui si legge il contatore, non i file.
create or replace function private.site_over_quota(target uuid, candidate public.plan_code)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.site_usage u
    join public.plans p on p.code = candidate
    where u.site_id = target
      and (u.used_bytes > p.storage_bytes
        or u.used_photo_slots > p.photo_limit
        or u.used_upload_tracks > p.upload_track_limit)
  );
$$;

-- Config completa + hero disponibile, SENZA la parte quota e SENZA la parte
-- billing: quelle due sono valutate separatamente contro il piano dell'evento.
-- private.site_is_publishable di PR-0 resta intatta e continua a servire
-- request_site_review e moderate_site.
create or replace function private.site_content_publishable(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.site_config c
    join public.site_assets a
      on a.site_id = c.site_id and a.id = c.hero_asset_id and a.purged_at is null
    where c.site_id = target
      and private.valid_site_config_complete(c.config)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Wrapper pubblici a grant minimo: lo schema private non e' esposto alla
--    Data API, quindi il webhook chiama questi due e nient'altro.
-- ---------------------------------------------------------------------------
create or replace function public.billing_context(target uuid, candidate public.plan_code)
returns table (
  publication_status public.publication_status,
  approved_at timestamptz,
  moderation_suspended_at timestamptz,
  subscription_ended_at timestamptz,
  plan_code public.plan_code,
  billing_interval public.billing_interval,
  billing_status public.billing_status,
  over_quota boolean,
  content_publishable boolean
) language sql stable security definer set search_path = '' as $$
  select s.publication_status, s.approved_at, s.moderation_suspended_at, s.subscription_ended_at,
         sub.plan_code, sub.billing_interval, sub.billing_status,
         private.site_over_quota(s.id, candidate),
         private.site_content_publishable(s.id)
  from public.sites s
  join public.site_subscriptions sub on sub.site_id = s.id
  where s.id = target;
$$;

create or replace function public.apply_billing_event(
  p_event_id text,
  p_site_id uuid,
  p_billing_status public.billing_status,
  p_plan_code public.plan_code,
  p_interval public.billing_interval,
  p_subscription_id text,
  p_price_id text,
  p_next_status public.publication_status,
  p_retention text,
  p_rule text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  current_status public.publication_status;
  hold timestamptz;
  ended timestamptz;
begin
  if p_retention not in ('start', 'clear', 'none') then
    raise exception 'unknown retention action %', p_retention using errcode = '22023';
  end if;
  if coalesce(btrim(p_event_id), '') = '' then
    raise exception 'missing stripe event id' using errcode = '22023';
  end if;

  -- Il lock serializza consegne concorrenti di eventi diversi sullo stesso sito.
  select s.publication_status, s.moderation_suspended_at, s.subscription_ended_at
    into current_status, hold, ended
  from public.sites s
  where s.id = p_site_id
  for update;
  if not found then
    raise exception 'unknown site %', p_site_id using errcode = '23503';
  end if;

  -- Idempotenza: la riconsegna dello stesso evento non produce ne' un secondo
  -- effetto ne' un secondo record di audit.
  insert into public.billing_events (
    stripe_event_id, site_id, stripe_subscription_id, rule,
    billing_status, plan_code, billing_interval, from_status, to_status
  ) values (
    p_event_id, p_site_id, p_subscription_id, p_rule,
    p_billing_status, p_plan_code, p_interval, current_status, p_next_status
  ) on conflict (stripe_event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_next_status <> current_status then
    -- Whitelist delle transizioni di cui il webhook e' autore in L0.7 §4.
    -- pending_review -> published resta esclusa: e' del platform admin.
    if not (
      (current_status = 'draft' and p_next_status in ('pending_review', 'published'))
      or (current_status = 'pending_review' and p_next_status = 'draft')
      or (current_status = 'published' and p_next_status in ('suspended', 'draft'))
      or (current_status = 'suspended' and p_next_status in ('published', 'draft'))
    ) then
      raise exception 'illegal billing transition % -> %', current_status, p_next_status
        using errcode = '23514';
    end if;

    -- Un hold di moderazione non si aggira ne' col recupero pagamento ne' con
    -- una nuova sottoscrizione.
    if p_next_status in ('published', 'pending_review') and hold is not null then
      raise exception 'moderation hold blocks publication' using errcode = '23514';
    end if;

    if p_next_status in ('published', 'pending_review')
       and not private.site_content_publishable(p_site_id) then
      raise exception 'site content is not publishable' using errcode = '23514';
    end if;

    if p_next_status = 'published' and private.site_over_quota(p_site_id, p_plan_code) then
      raise exception 'plan quota exceeded' using errcode = '23514';
    end if;
  end if;

  update public.site_subscriptions
     set plan_code = p_plan_code,
         billing_interval = p_interval,
         billing_status = p_billing_status,
         stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
         stripe_price_id = coalesce(p_price_id, stripe_price_id)
   where site_id = p_site_id;

  -- Nessuna riga di contenuto viene toccata: il downgrade oltre quota blocca,
  -- non cancella (L0.7 §3 regola 6).
  update public.sites
     set publication_status = p_next_status,
         subscription_ended_at = case p_retention
           when 'start' then coalesce(ended, now())
           when 'clear' then null
           else subscription_ended_at end,
         purge_after = case p_retention
           when 'start' then coalesce(ended, now()) + interval '90 days'
           when 'clear' then null
           else purge_after end
   where id = p_site_id;

  return 'applied';
end; $$;

-- ---------------------------------------------------------------------------
-- 4. Privilegi. Le nuove tabelle e funzioni non ereditano i grant di PR-0.
-- ---------------------------------------------------------------------------
-- billing_events e' append-only per costruzione: nemmeno service_role riceve
-- UPDATE o DELETE.
grant select, insert on public.billing_events to service_role;
grant select on public.billing_events to authenticated;

revoke all on function private.site_over_quota(uuid, public.plan_code) from public, anon, authenticated;
revoke all on function private.site_content_publishable(uuid) from public, anon, authenticated;
revoke all on function public.billing_context(uuid, public.plan_code) from public, anon, authenticated;
revoke all on function public.apply_billing_event(text, uuid, public.billing_status, public.plan_code, public.billing_interval, text, text, public.publication_status, text, text) from public, anon, authenticated;

grant execute on function public.billing_context(uuid, public.plan_code) to service_role;
grant execute on function public.apply_billing_event(text, uuid, public.billing_status, public.plan_code, public.billing_interval, text, text, public.publication_status, text, text) to service_role;
