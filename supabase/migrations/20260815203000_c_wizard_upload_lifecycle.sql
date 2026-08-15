-- C — Wizard: lifecycle atomico delle prenotazioni upload + accesso Storage owner.
--
-- PR-0 contiene già `private.reserve_upload`, che serializza le richieste sulla
-- riga `site_usage`, ma non espone reserve/consume/release al prodotto. C aggiunge
-- soltanto il lifecycle necessario al wizard, senza aprire `site_assets`,
-- `site_tracks` o i contatori al browser.
--
-- Le implementazioni privilegiate vivono in `private` come richiede L0.7 §6.7.
-- I wrapper `public.wizard_*` sono SECURITY INVOKER e sono eseguibili soltanto da
-- `service_role`, perché PostgREST espone `public` ma non lo schema `private`.

-- ---------------------------------------------------------------------------
-- Implementazioni atomiche, server-only.
-- ---------------------------------------------------------------------------

create or replace function private.wizard_expire_uploads(target_site uuid, actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_bytes bigint := 0;
  expired_photos integer := 0;
  expired_tracks integer := 0;
  expired_count integer := 0;
begin
  if not exists (
    select 1 from public.sites s where s.id = target_site and s.owner_id = actor
  ) then
    raise exception 'not site owner' using errcode = '42501';
  end if;

  -- Stesso lock di private.reserve_upload: reserve, release, expire e complete
  -- dello stesso sito non possono attraversarsi.
  perform 1 from public.site_usage u where u.site_id = target_site for update;
  if not found then
    raise exception 'site usage missing' using errcode = '23503';
  end if;

  select
    coalesce(sum(r.byte_size), 0),
    coalesce(sum(r.photo_slots), 0),
    coalesce(sum(r.upload_tracks), 0),
    count(*)::integer
  into expired_bytes, expired_photos, expired_tracks, expired_count
  from public.site_upload_reservations r
  where r.site_id = target_site
    and r.status = 'reserved'
    and r.expires_at <= now();

  if expired_count = 0 then
    return 0;
  end if;

  update public.site_upload_reservations r
  set status = 'expired'
  where r.site_id = target_site
    and r.status = 'reserved'
    and r.expires_at <= now();

  update public.site_usage u
  set reserved_bytes = u.reserved_bytes - expired_bytes,
      reserved_photo_slots = u.reserved_photo_slots - expired_photos,
      reserved_upload_tracks = u.reserved_upload_tracks - expired_tracks,
      updated_at = now()
  where u.site_id = target_site
    and u.reserved_bytes >= expired_bytes
    and u.reserved_photo_slots >= expired_photos
    and u.reserved_upload_tracks >= expired_tracks;

  if not found then
    raise exception 'reservation counters inconsistent' using errcode = '23514';
  end if;

  return expired_count;
end;
$$;

create or replace function private.wizard_reserve_upload(
  target_site uuid,
  actor uuid,
  target_kind public.reservation_kind,
  target_bytes bigint,
  target_photo_slots integer default 0,
  target_upload_tracks integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sites s where s.id = target_site and s.owner_id = actor
  ) then
    raise exception 'not site owner' using errcode = '42501';
  end if;

  return private.reserve_upload(
    target_site,
    target_kind,
    target_bytes,
    target_photo_slots,
    target_upload_tracks
  );
end;
$$;

create or replace function private.wizard_release_upload(reservation_id uuid, actor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.site_upload_reservations%rowtype;
  owned_site uuid;
begin
  select reservation.site_id into owned_site
  from public.site_upload_reservations reservation
  join public.sites s on s.id = reservation.site_id
  where reservation.id = reservation_id
    and s.owner_id = actor;

  if not found then
    raise exception 'reservation not found for owner' using errcode = '42501';
  end if;

  -- Lock order identico a reserve: usage prima, reservation dopo.
  perform 1 from public.site_usage u where u.site_id = owned_site for update;
  if not found then
    raise exception 'site usage missing' using errcode = '23503';
  end if;

  select reservation.* into r
  from public.site_upload_reservations reservation
  where reservation.id = reservation_id
    and reservation.site_id = owned_site
  for update;

  -- Consumed/released/expired non spostano i contatori una seconda volta.
  if r.status <> 'reserved' then
    return false;
  end if;

  update public.site_usage u
  set reserved_bytes = u.reserved_bytes - r.byte_size,
      reserved_photo_slots = u.reserved_photo_slots - r.photo_slots,
      reserved_upload_tracks = u.reserved_upload_tracks - r.upload_tracks,
      updated_at = now()
  where u.site_id = owned_site
    and u.reserved_bytes >= r.byte_size
    and u.reserved_photo_slots >= r.photo_slots
    and u.reserved_upload_tracks >= r.upload_tracks;

  if not found then
    raise exception 'reservation counters inconsistent' using errcode = '23514';
  end if;

  update public.site_upload_reservations reservation
  set status = 'released', released_at = now()
  where reservation.id = r.id;

  return true;
end;
$$;

create or replace function private.wizard_complete_asset_upload(
  reservation_id uuid,
  actor uuid,
  target_kind public.asset_kind,
  target_storage_path text,
  target_mime_type text,
  target_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.site_upload_reservations%rowtype;
  owned_site uuid;
  asset_id uuid;
  expected_photo_slots integer;
  next_sort integer;
begin
  select reservation.site_id into owned_site
  from public.site_upload_reservations reservation
  join public.sites s on s.id = reservation.site_id
  where reservation.id = reservation_id
    and s.owner_id = actor;

  if not found then
    raise exception 'reservation not found for owner' using errcode = '42501';
  end if;

  perform 1 from public.site_usage u where u.site_id = owned_site for update;
  if not found then
    raise exception 'site usage missing' using errcode = '23503';
  end if;

  select reservation.* into r
  from public.site_upload_reservations reservation
  where reservation.id = reservation_id
    and reservation.site_id = owned_site
  for update;

  if r.status <> 'reserved' or r.expires_at <= now() then
    raise exception 'reservation is not active' using errcode = '23514';
  end if;
  if r.kind <> 'asset' then
    raise exception 'wrong reservation kind' using errcode = '23514';
  end if;
  if target_kind = 'video' then
    raise exception 'video upload disabled in v1' using errcode = '23514';
  end if;

  expected_photo_slots := case target_kind
    when 'logo' then 0
    when 'visual' then 1
    when 'photo_hi' then 1
    when 'merch' then 1
    else 0
  end;

  if r.byte_size <> target_bytes
     or r.photo_slots <> expected_photo_slots
     or r.upload_tracks <> 0
     or target_storage_path <> r.site_id::text || '/' || r.id::text || '/object'
     or lower(split_part(target_mime_type, ';', 1)) not in (
       'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'
     ) then
    raise exception 'reservation does not match asset' using errcode = '23514';
  end if;

  select coalesce(max(a.sort_order), -1) + 1 into next_sort
  from public.site_assets a where a.site_id = owned_site;

  insert into public.site_assets(site_id, kind, storage_path, mime_type, byte_size, sort_order)
  values(owned_site, target_kind, target_storage_path, target_mime_type, target_bytes, next_sort)
  returning id into asset_id;

  update public.site_usage u
  set reserved_bytes = u.reserved_bytes - r.byte_size,
      reserved_photo_slots = u.reserved_photo_slots - r.photo_slots,
      reserved_upload_tracks = u.reserved_upload_tracks - r.upload_tracks,
      used_bytes = u.used_bytes + r.byte_size,
      used_photo_slots = u.used_photo_slots + r.photo_slots,
      used_upload_tracks = u.used_upload_tracks + r.upload_tracks,
      updated_at = now()
  where u.site_id = owned_site
    and u.reserved_bytes >= r.byte_size
    and u.reserved_photo_slots >= r.photo_slots
    and u.reserved_upload_tracks >= r.upload_tracks;

  if not found then
    raise exception 'reservation counters inconsistent' using errcode = '23514';
  end if;

  update public.site_upload_reservations reservation
  set status = 'consumed', consumed_at = now()
  where reservation.id = r.id;

  return asset_id;
end;
$$;

create or replace function private.wizard_complete_track_upload(
  reservation_id uuid,
  actor uuid,
  target_title text,
  target_storage_path text,
  target_mime_type text,
  target_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.site_upload_reservations%rowtype;
  owned_site uuid;
  track_id uuid;
  next_sort integer;
begin
  select reservation.site_id into owned_site
  from public.site_upload_reservations reservation
  join public.sites s on s.id = reservation.site_id
  where reservation.id = reservation_id
    and s.owner_id = actor;

  if not found then
    raise exception 'reservation not found for owner' using errcode = '42501';
  end if;

  perform 1 from public.site_usage u where u.site_id = owned_site for update;
  if not found then
    raise exception 'site usage missing' using errcode = '23503';
  end if;

  select reservation.* into r
  from public.site_upload_reservations reservation
  where reservation.id = reservation_id
    and reservation.site_id = owned_site
  for update;

  if r.status <> 'reserved' or r.expires_at <= now() then
    raise exception 'reservation is not active' using errcode = '23514';
  end if;
  if r.kind <> 'track_upload' or r.photo_slots <> 0 or r.upload_tracks <> 1 then
    raise exception 'reservation does not match track upload' using errcode = '23514';
  end if;
  if r.byte_size <> target_bytes
     or coalesce(btrim(target_title), '') = ''
     or target_storage_path <> r.site_id::text || '/' || r.id::text || '/object'
     or lower(split_part(target_mime_type, ';', 1)) not in (
       'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/wav'
     ) then
    raise exception 'reservation does not match track' using errcode = '23514';
  end if;

  select coalesce(max(t.sort_order), -1) + 1 into next_sort
  from public.site_tracks t where t.site_id = owned_site;

  insert into public.site_tracks(
    site_id, title, source, storage_path, mime_type, byte_size, duration_seconds,
    embed_provider, embed_url, sort_order
  ) values (
    owned_site, btrim(target_title), 'upload', target_storage_path,
    target_mime_type, target_bytes, null, null, null, next_sort
  ) returning id into track_id;

  update public.site_usage u
  set reserved_bytes = u.reserved_bytes - r.byte_size,
      reserved_photo_slots = u.reserved_photo_slots - r.photo_slots,
      reserved_upload_tracks = u.reserved_upload_tracks - r.upload_tracks,
      used_bytes = u.used_bytes + r.byte_size,
      used_photo_slots = u.used_photo_slots + r.photo_slots,
      used_upload_tracks = u.used_upload_tracks + r.upload_tracks,
      updated_at = now()
  where u.site_id = owned_site
    and u.reserved_bytes >= r.byte_size
    and u.reserved_photo_slots >= r.photo_slots
    and u.reserved_upload_tracks >= r.upload_tracks;

  if not found then
    raise exception 'reservation counters inconsistent' using errcode = '23514';
  end if;

  update public.site_upload_reservations reservation
  set status = 'consumed', consumed_at = now()
  where reservation.id = r.id;

  return track_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wrapper Data API: ponte minimo, service_role soltanto.
--
-- Il codice privilegiato resta in `private`. Il wrapper è SECURITY DEFINER solo
-- perché `service_role` deve continuare a NON avere USAGE sullo schema private:
-- il test esaustivo già presente nel repo lo pretende. Il wrapper non contiene
-- logica di business e non è concesso ai ruoli client.
-- ---------------------------------------------------------------------------

create or replace function public.wizard_expire_uploads(target_site uuid, actor uuid)
returns integer language sql volatile security definer set search_path = ''
as $$ select private.wizard_expire_uploads(target_site, actor) $$;

create or replace function public.wizard_reserve_upload(
  target_site uuid, actor uuid, target_kind public.reservation_kind,
  target_bytes bigint, target_photo_slots integer default 0,
  target_upload_tracks integer default 0
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select private.wizard_reserve_upload(target_site, actor, target_kind, target_bytes, target_photo_slots, target_upload_tracks) $$;

create or replace function public.wizard_release_upload(reservation_id uuid, actor uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$ select private.wizard_release_upload(reservation_id, actor) $$;

create or replace function public.wizard_complete_asset_upload(
  reservation_id uuid, actor uuid, target_kind public.asset_kind,
  target_storage_path text, target_mime_type text, target_bytes bigint
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select private.wizard_complete_asset_upload(reservation_id, actor, target_kind, target_storage_path, target_mime_type, target_bytes) $$;

create or replace function public.wizard_complete_track_upload(
  reservation_id uuid, actor uuid, target_title text,
  target_storage_path text, target_mime_type text, target_bytes bigint
)
returns uuid language sql volatile security definer set search_path = ''
as $$ select private.wizard_complete_track_upload(reservation_id, actor, target_title, target_storage_path, target_mime_type, target_bytes) $$;

revoke all on function private.wizard_expire_uploads(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.wizard_reserve_upload(uuid, uuid, public.reservation_kind, bigint, integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.wizard_release_upload(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.wizard_complete_asset_upload(uuid, uuid, public.asset_kind, text, text, bigint) from public, anon, authenticated, service_role;
revoke all on function private.wizard_complete_track_upload(uuid, uuid, text, text, text, bigint) from public, anon, authenticated, service_role;

revoke all on function public.wizard_expire_uploads(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wizard_reserve_upload(uuid, uuid, public.reservation_kind, bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.wizard_release_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wizard_complete_asset_upload(uuid, uuid, public.asset_kind, text, text, bigint) from public, anon, authenticated;
revoke all on function public.wizard_complete_track_upload(uuid, uuid, text, text, text, bigint) from public, anon, authenticated;

grant execute on function public.wizard_expire_uploads(uuid, uuid) to service_role;
grant execute on function public.wizard_reserve_upload(uuid, uuid, public.reservation_kind, bigint, integer, integer) to service_role;
grant execute on function public.wizard_release_upload(uuid, uuid) to service_role;
grant execute on function public.wizard_complete_asset_upload(uuid, uuid, public.asset_kind, text, text, bigint) to service_role;
grant execute on function public.wizard_complete_track_upload(uuid, uuid, text, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Upload diretto browser -> Supabase Storage.
--
-- `feat/media-route` crea i due bucket privati e non concede scritture owner.
-- C aggiunge soltanto INSERT/SELECT temporanei, vincolati a una prenotazione
-- attiva, all'owner, al bucket e al path deterministico.
-- Niente UPDATE/upsert e niente DELETE client.
--
-- La SELECT speculare serve al RETURNING della Storage API durante l'upload;
-- dopo consume/release/expire la prenotazione non è più `reserved`, quindi il
-- browser perde automaticamente anche quella lettura temporanea.
--
-- PERCHE' QUI NON SI CONFRONTANO I BYTE
-- Una versione precedente di questa migrazione chiudeva l'INSERT anche con
-- `coalesce((metadata->>'size')::bigint, -1) = r.byte_size`. Non funzionava, e
-- non per un dettaglio di scrittura: Supabase Storage valuta la RLS PRIMA che i
-- byte arrivino. In `storage-api`, `upload()` chiama `prepareUpload` ->
-- `canUpload`, che esegue l'unico INSERT sottoposto a policy passando
-- `metadata: { mimetype, contentLength }`. La chiave `size` in quel momento non
-- esiste ancora: nasce dopo, quando i byte sono nel backend e `completeUpload`
-- scrive la riga definitiva con `asSuperUser()`, che la RLS non attraversa.
-- Quindi `metadata->>'size'` era sempre NULL, il confronto sempre falso, e la
-- policy negava OGNI upload di OGNI utente, non solo quelli sbagliati.
--
-- Misurato: con `metadata` privo della chiave `size` l'INSERT viene negato con
-- "new row violates row-level security policy"; con `size` valorizzato passa, a
-- parità di sessione owner, path e prenotazione. Le altre sei condizioni erano
-- e restano soddisfatte.
--
-- Non si ripiega su `contentLength`, che pure è presente: quel valore è
-- `declaredContentLength ?? contentLength`, cioè deriva dall'header dichiarato
-- dal client. Confrontare la prenotazione con un numero che il chiamante sceglie
-- sarebbe una garanzia solo apparente, peggiore dell'assenza perché sembra una
-- difesa.
--
-- La garanzia sui byte non sparisce, sta un livello più in là e vede il dato
-- vero: `lib/wizard/upload-server.ts` interroga l'oggetto con `info(path)` e
-- rifiuta con `stored-object-mismatch` se `data.size` non coincide con i byte
-- prenotati, PRIMA di consumare la prenotazione e aggiornare la quota. Lì la
-- dimensione è quella effettivamente memorizzata, non quella dichiarata.
-- La perdita è di difesa in profondità, non di correttezza, ed è registrata nel
-- debito dichiarato del TODO.
-- ---------------------------------------------------------------------------

create policy wizard_asset_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.site_upload_reservations r
    join public.sites s on s.id = r.site_id
    where s.owner_id = (select auth.uid())
      and r.kind = 'asset'
      and r.status = 'reserved'
      and r.expires_at > now()
      and name = r.site_id::text || '/' || r.id::text || '/object'
  )
);

create policy wizard_asset_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.site_upload_reservations r
    join public.sites s on s.id = r.site_id
    where s.owner_id = (select auth.uid())
      and r.kind = 'asset'
      and r.status = 'reserved'
      and r.expires_at > now()
      and name = r.site_id::text || '/' || r.id::text || '/object'
  )
);

create policy wizard_track_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-tracks'
  and exists (
    select 1
    from public.site_upload_reservations r
    join public.sites s on s.id = r.site_id
    where s.owner_id = (select auth.uid())
      and r.kind = 'track_upload'
      and r.status = 'reserved'
      and r.expires_at > now()
      and name = r.site_id::text || '/' || r.id::text || '/object'
  )
);

create policy wizard_track_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'site-tracks'
  and exists (
    select 1
    from public.site_upload_reservations r
    join public.sites s on s.id = r.site_id
    where s.owner_id = (select auth.uid())
      and r.kind = 'track_upload'
      and r.status = 'reserved'
      and r.expires_at > now()
      and name = r.site_id::text || '/' || r.id::text || '/object'
  )
);
