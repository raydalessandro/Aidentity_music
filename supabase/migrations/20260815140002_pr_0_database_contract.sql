-- AIDENTITY PR-0: contratto dati, sicurezza e invarianti.
-- Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md (E2 confermato).

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

create type public.plan_code as enum ('base','pro','max');
create type public.billing_interval as enum ('month','year');
create type public.billing_status as enum ('not_started','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused');
create type public.publication_status as enum ('draft','pending_review','published','suspended');
create type public.asset_kind as enum ('logo','visual','photo_hi','merch','video');
create type public.track_source as enum ('upload','embed');
create type public.embed_provider as enum ('spotify','apple_music','youtube','soundcloud');
create type public.post_kind as enum ('visual','track');
create type public.link_provider as enum ('spotify','apple_music','youtube','soundcloud','instagram','tiktok');
create type public.contact_role as enum ('booking','management','press');
create type public.reservation_kind as enum ('asset','track_upload');
create type public.reservation_status as enum ('reserved','consumed','released','expired');
create type public.moderation_action as enum ('approve','suspend');

create or replace function private.is_https_url(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value ~ '^https://[^[:space:]/]+(?:/[^[:space:]]*)?$';
$$;

create or replace function private.valid_embed_url(provider public.embed_provider, value text)
returns boolean language sql immutable set search_path = '' as $$
  select case provider
    when 'spotify' then value ~ '^https://open\\.spotify\\.com/'
    when 'apple_music' then value ~ '^https://(music\\.apple\\.com|embed\\.music\\.apple\\.com)/'
    when 'youtube' then value ~ '^https://(youtube\\.com|www\\.youtube\\.com|music\\.youtube\\.com|youtu\\.be)/'
    when 'soundcloud' then value ~ '^https://soundcloud\\.com/'
    else false end;
$$;

create or replace function private.valid_site_config_draft(config jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(config) = 'object'
    and config->>'version' = '1'
    and jsonb_typeof(config->'identity') = 'object'
    and (config->'identity') ?& array['name','handle','claim','shortBio','longBio','location','locale']
    and config->'identity'->>'locale' = 'it-IT'
    and jsonb_typeof(config->'theme') = 'object'
    and (config->'theme') ?& array['ink','panel','paper','muted','dim','line','acid']
    and (select count(*) from jsonb_object_keys(config->'theme')) = 7
    and config->>'fontPair' in ('grotesk-mono','serif-sans','display-grotesk')
    and config->>'iconFamily' in ('line','block','stencil')
    and jsonb_typeof(config->'grain') = 'boolean'
    and jsonb_typeof(config->'surfaces') = 'array'
    and jsonb_array_length(config->'surfaces') = 5
    and config->'surfaces'->2->>'id' = 'epk'
    and config->'surfaces'->4->>'id' = 'home'
    and coalesce((config->'surfaces'->2->>'enabled')::boolean,false)
    and coalesce((config->'surfaces'->4->>'enabled')::boolean,false)
    and jsonb_typeof(config->'sectionCopy') = 'object'
    and config->'sectionCopy'->>'version' = '1';
$$;

create or replace function private.valid_site_config_complete(config jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select private.valid_site_config_draft(config)
    and coalesce(btrim(config->'identity'->>'name'),'') <> ''
    and coalesce(btrim(config->'identity'->>'handle'),'') <> ''
    and coalesce(btrim(config->'identity'->>'claim'),'') <> ''
    and coalesce(btrim(config->'identity'->>'shortBio'),'') <> ''
    and coalesce(btrim(config->'identity'->>'longBio'),'') <> ''
    and coalesce(btrim(config->'identity'->>'location'),'') <> '';
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_name text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.plans (
  code public.plan_code primary key,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  annual_price_cents integer not null check (annual_price_cents = monthly_price_cents * 12),
  photo_limit integer not null check (photo_limit > 0),
  upload_track_limit integer not null check (upload_track_limit > 0),
  storage_bytes bigint not null check (storage_bytes > 0)
);
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and slug not in ('_next','admin','api','app','assets','auth','epk','login','one-sheet','preview')),
  publication_status public.publication_status not null default 'draft',
  approved_at timestamptz, moderation_suspended_at timestamptz, moderation_reason text,
  subscription_ended_at timestamptz, purge_after timestamptz, assets_purged_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check ((moderation_suspended_at is null) = (moderation_reason is null)),
  check (purge_after is null or subscription_ended_at is not null)
);
create table public.site_slug_redirects (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade,
  old_slug text not null unique, created_at timestamptz not null default now()
);
create table public.site_subscriptions (
  site_id uuid primary key, owner_id uuid not null, plan_code public.plan_code not null default 'base' references public.plans(code),
  billing_interval public.billing_interval not null default 'month', billing_status public.billing_status not null default 'not_started',
  stripe_subscription_id text unique, stripe_price_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (site_id, owner_id) references public.sites(id, owner_id) on delete cascade
);
create table public.site_usage (
  site_id uuid primary key references public.sites(id) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes >= 0), reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  used_photo_slots integer not null default 0 check (used_photo_slots >= 0), reserved_photo_slots integer not null default 0 check (reserved_photo_slots >= 0),
  used_upload_tracks integer not null default 0 check (used_upload_tracks >= 0), reserved_upload_tracks integer not null default 0 check (reserved_upload_tracks >= 0),
  updated_at timestamptz not null default now()
);
create table public.platform_admins (user_id uuid primary key references public.profiles(id) on delete cascade, created_at timestamptz not null default now());
create table public.site_preview_links (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now(), check (expires_at > created_at)
);
create table public.site_assets (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade,
  kind public.asset_kind not null, storage_path text not null unique, mime_type text not null, byte_size bigint not null check (byte_size > 0),
  sort_order integer not null default 0, purged_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id)
);
create table public.site_config (
  site_id uuid primary key references public.sites(id) on delete cascade, config jsonb not null,
  hero_asset_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (private.valid_site_config_draft(config)),
  foreign key (site_id,hero_asset_id) references public.site_assets(site_id,id) on delete restrict
);
create table public.moderation_events (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict, action public.moderation_action not null, reason text, created_at timestamptz not null default now()
);
create table public.site_tracks (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade,
  title text not null check (btrim(title) <> ''), source public.track_source not null, storage_path text unique, mime_type text, byte_size bigint,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0), embed_provider public.embed_provider, embed_url text,
  sort_order integer not null default 0, purged_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id),
  check ((source='upload' and storage_path is not null and mime_type like 'audio/%' and byte_size > 0 and embed_provider is null and embed_url is null) or
         (source='embed' and storage_path is null and mime_type is null and byte_size is null and duration_seconds is null and purged_at is null and embed_provider is not null and embed_url is not null and private.valid_embed_url(embed_provider,embed_url)))
);
create table public.site_posts (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, kind public.post_kind not null,
  visual_asset_id uuid, track_id uuid, cover_asset_id uuid, caption text, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id),
  foreign key(site_id,visual_asset_id) references public.site_assets(site_id,id), foreign key(site_id,cover_asset_id) references public.site_assets(site_id,id), foreign key(site_id,track_id) references public.site_tracks(site_id,id),
  check ((kind='visual' and visual_asset_id is not null and track_id is null) or (kind='track' and track_id is not null and visual_asset_id is null))
);
create table public.site_links (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, provider public.link_provider not null, url text not null check(private.is_https_url(url)), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id)
);
create table public.site_press (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, publication text not null check(btrim(publication)<>''), quote text not null check(btrim(quote)<>''), published_on date, url text check(url is null or private.is_https_url(url)), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id)
);
create table public.site_dates (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, starts_at timestamptz not null, city text not null check(btrim(city)<>''), venue text not null check(btrim(venue)<>''), ticket_url text check(ticket_url is null or private.is_https_url(ticket_url)), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id)
);
create table public.site_metrics (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, label text not null check(btrim(label)<>''), value text not null check(btrim(value)<>''), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id)
);
create table public.site_contacts (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, role public.contact_role not null, name text not null check(btrim(name)<>''), email text not null check(email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'), consent_confirmed_at timestamptz, consent_confirmed_by uuid references public.profiles(id), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(site_id,id), check((consent_confirmed_at is null) = (consent_confirmed_by is null))
);
create table public.site_upload_reservations (
  id uuid primary key default gen_random_uuid(), site_id uuid not null references public.sites(id) on delete cascade, kind public.reservation_kind not null,
  byte_size bigint not null check(byte_size>0), photo_slots integer not null default 0 check(photo_slots>=0), upload_tracks integer not null default 0 check(upload_tracks>=0),
  status public.reservation_status not null default 'reserved', expires_at timestamptz not null default now()+interval '30 minutes', created_at timestamptz not null default now(), consumed_at timestamptz, released_at timestamptz,
  check ((kind='asset' and upload_tracks=0) or (kind='track_upload' and photo_slots=0)), check(expires_at>created_at)
);

create index sites_owner_idx on public.sites(owner_id);
create index assets_site_idx on public.site_assets(site_id);
create index tracks_site_idx on public.site_tracks(site_id);
create index reservations_open_idx on public.site_upload_reservations(site_id,expires_at) where status='reserved';

create or replace function private.set_updated_at() returns trigger language plpgsql security definer set search_path='' as $$ begin new.updated_at:=now(); return new; end; $$;
create or replace function private.create_site_dependents() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.site_subscriptions(site_id,owner_id) values(new.id,new.owner_id);
  insert into public.site_usage(site_id) values(new.id);
  insert into public.site_config(site_id,config) values(new.id,'{"version":1,"identity":{"name":null,"handle":null,"claim":null,"shortBio":null,"longBio":null,"location":null,"locale":"it-IT"},"theme":{"ink":"#111111","panel":"#1a1a1a","paper":"#f5f2ea","muted":"#a0a0a0","dim":"#666666","line":"#333333","acid":"#ccff00"},"fontPair":"grotesk-mono","iconFamily":"line","grain":false,"surfaces":[{"id":"feed","enabled":true},{"id":"listen","enabled":true},{"id":"epk","enabled":true},{"id":"merch","enabled":true},{"id":"home","enabled":true}],"sectionCopy":{"version":1}}'::jsonb);
  return new;
end; $$;
create trigger sites_dependents after insert on public.sites for each row execute function private.create_site_dependents();
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger sites_updated before update on public.sites for each row execute function private.set_updated_at();
create trigger subscriptions_updated before update on public.site_subscriptions for each row execute function private.set_updated_at();
create trigger config_updated before update on public.site_config for each row execute function private.set_updated_at();

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.is_site_owner(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.sites where id=target and owner_id=(select auth.uid())); $$;
create or replace function private.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.platform_admins where user_id=(select auth.uid())); $$;
create or replace function private.site_is_publishable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.site_config c join public.site_assets a on a.site_id=c.site_id and a.id=c.hero_asset_id and a.purged_at is null join public.site_usage u on u.site_id=c.site_id join public.site_subscriptions sub on sub.site_id=c.site_id join public.plans p on p.code=sub.plan_code where c.site_id=target and private.valid_site_config_complete(c.config) and u.used_bytes<=p.storage_bytes and u.used_photo_slots<=p.photo_limit and u.used_upload_tracks<=p.upload_track_limit);
$$;

create or replace function public.request_site_review(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_site_owner(target) then raise exception 'not site owner' using errcode='insufficient_privilege'; end if;
 if not private.site_is_publishable(target) or not exists(select 1 from public.site_subscriptions where site_id=target and billing_status in ('active','trialing')) then raise exception 'site is not publishable' using errcode='check_violation'; end if;
 update public.sites set publication_status='pending_review' where id=target and publication_status='draft';
 if not found then raise exception 'invalid publication transition' using errcode='check_violation'; end if;
end; $$;
create or replace function public.moderate_site(target uuid, action public.moderation_action, reason text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_platform_admin() then raise exception 'not platform admin' using errcode='insufficient_privilege'; end if;
 if action='suspend' then
   if coalesce(btrim(reason),'')='' then raise exception 'reason required' using errcode='check_violation'; end if;
   update public.sites set publication_status='suspended',moderation_suspended_at=now(),moderation_reason=reason where id=target and publication_status in ('pending_review','published','suspended');
 else
   update public.sites set publication_status='published',approved_at=coalesce(approved_at,now()),moderation_suspended_at=null,moderation_reason=null where id=target and private.site_is_publishable(target) and exists(select 1 from public.site_subscriptions where site_id=target and billing_status in ('active','trialing'));
 end if;
 if not found then raise exception 'invalid moderation transition' using errcode='check_violation'; end if;
 insert into public.moderation_events(site_id,actor_id,action,reason) values(target,auth.uid(),action,reason);
end; $$;

alter table public.profiles enable row level security; alter table public.profiles force row level security;
alter table public.plans enable row level security; alter table public.plans force row level security;
alter table public.sites enable row level security; alter table public.sites force row level security;
alter table public.site_subscriptions enable row level security; alter table public.site_subscriptions force row level security;
alter table public.site_usage enable row level security; alter table public.site_usage force row level security;
alter table public.site_config enable row level security; alter table public.site_config force row level security;
alter table public.platform_admins enable row level security; alter table public.platform_admins force row level security;
alter table public.moderation_events enable row level security; alter table public.moderation_events force row level security;
alter table public.site_preview_links enable row level security; alter table public.site_preview_links force row level security;
alter table public.site_assets enable row level security; alter table public.site_assets force row level security;
alter table public.site_tracks enable row level security; alter table public.site_tracks force row level security;
alter table public.site_posts enable row level security; alter table public.site_posts force row level security;
alter table public.site_links enable row level security; alter table public.site_links force row level security;
alter table public.site_press enable row level security; alter table public.site_press force row level security;
alter table public.site_dates enable row level security; alter table public.site_dates force row level security;
alter table public.site_metrics enable row level security; alter table public.site_metrics force row level security;
alter table public.site_contacts enable row level security; alter table public.site_contacts force row level security;
alter table public.site_upload_reservations enable row level security; alter table public.site_upload_reservations force row level security;
alter table public.site_slug_redirects enable row level security; alter table public.site_slug_redirects force row level security;

create policy plans_read on public.plans for select to anon,authenticated using(true);
create policy profile_own on public.profiles for select to authenticated using(id=(select auth.uid()) or private.is_platform_admin());
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy sites_own on public.sites for select to authenticated using(owner_id=(select auth.uid()) or private.is_platform_admin());
create policy sites_public on public.sites for select to anon using(publication_status='published');
create policy config_own on public.site_config for all to authenticated using(private.is_site_owner(site_id) or private.is_platform_admin()) with check(private.is_site_owner(site_id));
create policy config_public on public.site_config for select to anon using(exists(select 1 from public.sites s where s.id=site_id and s.publication_status='published'));
create policy subscriptions_own on public.site_subscriptions for select to authenticated using(owner_id=(select auth.uid()) or private.is_platform_admin());
create policy usage_own on public.site_usage for select to authenticated using(private.is_site_owner(site_id) or private.is_platform_admin());
create policy admin_global on public.platform_admins for select to authenticated using(private.is_platform_admin());
create policy audit_global on public.moderation_events for select to authenticated using(private.is_platform_admin());
create policy previews_own on public.site_preview_links for all to authenticated using(private.is_site_owner(site_id) or private.is_platform_admin()) with check(private.is_site_owner(site_id));

create or replace function private.owner_content_policy(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.is_site_owner(target) or private.is_platform_admin(); $$;
create policy assets_own on public.site_assets for select to authenticated using(private.owner_content_policy(site_id));
create policy tracks_own on public.site_tracks for select to authenticated using(private.owner_content_policy(site_id));
create policy posts_own on public.site_posts for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy links_own on public.site_links for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy press_own on public.site_press for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy dates_own on public.site_dates for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy metrics_own on public.site_metrics for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy contacts_own on public.site_contacts for all to authenticated using(private.owner_content_policy(site_id)) with check(private.is_site_owner(site_id));
create policy reservations_own on public.site_upload_reservations for select to authenticated using(private.owner_content_policy(site_id));

create view public.public_sites with (security_invoker=true) as select s.id,s.slug,c.config,c.hero_asset_id from public.sites s join public.site_config c on c.site_id=s.id where s.publication_status='published';
create view public.public_tracks with (security_invoker=true) as select t.id,t.site_id,t.title,t.source,t.duration_seconds,t.embed_provider,t.embed_url,t.sort_order from public.site_tracks t join public.sites s on s.id=t.site_id where s.publication_status='published' and t.purged_at is null;

revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on public.plans,public.public_sites,public.public_tracks to anon,authenticated;
grant select (id,slug,publication_status) on public.sites to anon;
grant select (site_id,config,hero_asset_id) on public.site_config to anon;
grant select on public.profiles,public.sites,public.site_subscriptions,public.site_usage,public.site_config,public.platform_admins,public.moderation_events,public.site_preview_links,public.site_assets,public.site_tracks,public.site_posts,public.site_links,public.site_press,public.site_dates,public.site_metrics,public.site_contacts,public.site_upload_reservations to authenticated;
grant insert,update,delete on public.site_config,public.site_posts,public.site_links,public.site_press,public.site_dates,public.site_metrics,public.site_contacts,public.site_preview_links to authenticated;
grant execute on function public.request_site_review(uuid),public.moderate_site(uuid,public.moderation_action,text) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_site_owner(uuid),private.is_platform_admin(),private.owner_content_policy(uuid) to authenticated;

insert into public.plans(code,monthly_price_cents,annual_price_cents,photo_limit,upload_track_limit,storage_bytes) values
 ('base',200,2400,12,3,157286400),('pro',1000,12000,100,30,1073741824),('max',2000,24000,1000,300,8589934592);
