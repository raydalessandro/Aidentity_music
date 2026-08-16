import { randomUUID } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/** Saldatura reale wizard -> Storage -> finalizzazione -> quote. */
test.describe.configure({ mode: "serial" });

const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64",
);

/** Piccolo payload con header ID3. Non serve decodificarlo: qui proviamo il lifecycle upload. */
const MP3_SAMPLE = Buffer.from(
  "4944330400000000000f544954320000000500000054455354",
  "hex",
);

let service: SupabaseClient;
let owner: SupabaseClient;
let userId = "";
let siteId = "";
let ownerTokens: { access_token: string; refresh_token: string } | null = null;
const assetPaths: string[] = [];
const trackPaths: string[] = [];

async function ownerCookieHeader(): Promise<string> {
  if (!ownerTokens) throw new Error("e2e wizard: sessione owner assente");
  const jar: { name: string; value: string }[] = [];
  const shim = createServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => jar,
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            const existing = jar.findIndex((c) => c.name === name);
            if (existing >= 0) jar[existing] = { name, value };
            else jar.push({ name, value });
          }
        },
      },
    },
  );
  const { error } = await shim.auth.setSession(ownerTokens);
  if (error) throw new Error(`sessione owner e2e: ${error.message}`);
  if (jar.length === 0) throw new Error("e2e wizard: nessun cookie di sessione prodotto");
  return jar.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`e2e wizard: ${name} mancante nello stack locale`);
  return value;
}

async function reserveAsset(bytes: number): Promise<{ id: string; path: string }> {
  const { data, error } = await service.rpc("wizard_reserve_upload", {
    target_site: siteId,
    actor: userId,
    target_kind: "asset",
    target_bytes: bytes,
    target_photo_slots: 1,
    target_upload_tracks: 0,
  });
  if (error || typeof data !== "string") {
    throw new Error(`reserve wizard e2e: ${error?.message ?? "id assente"}`);
  }
  return { id: data, path: `${siteId}/${data}/object` };
}

test.beforeAll(async () => {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const anon = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

  service = createClient(url, serviceKey, { auth: { persistSession: false } });
  owner = createClient(url, anon, { auth: { persistSession: false } });

  const suffix = randomUUID().replaceAll("-", "");
  const email = `wizard-${suffix}@example.test`;
  const password = `Wizard-${suffix}-A1!`;

  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`create owner wizard e2e: ${created.error?.message ?? "utente assente"}`);
  }
  userId = created.data.user.id;

  const signed = await owner.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    throw new Error(`login owner wizard e2e: ${signed.error?.message ?? "sessione assente"}`);
  }
  ownerTokens = {
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
  };

  siteId = randomUUID();
  const slug = `wizard-e2e-${suffix.slice(0, 12)}`;
  const inserted = await service.from("sites").insert({ id: siteId, owner_id: userId, slug });
  if (inserted.error) throw new Error(`site wizard e2e: ${inserted.error.message}`);
});

test.afterAll(async () => {
  if (service && assetPaths.length > 0) await service.storage.from("site-assets").remove(assetPaths);
  if (service && trackPaths.length > 0) await service.storage.from("site-tracks").remove(trackPaths);
  if (service && siteId) await service.from("sites").delete().eq("id", siteId);
  if (service && userId) await service.auth.admin.deleteUser(userId);
});

test("immagine: reservation -> upload owner -> consume attraversa Storage RLS e aggiorna usage", async () => {
  const ticket = await reserveAsset(JPEG_1X1.byteLength);
  assetPaths.push(ticket.path);

  const uploaded = await owner.storage.from("site-assets").upload(ticket.path, JPEG_1X1, {
    contentType: "image/jpeg",
    upsert: false,
  });
  expect(uploaded.error).toBeNull();

  const completed = await service.rpc("wizard_complete_asset_upload", {
    reservation_id: ticket.id,
    actor: userId,
    target_kind: "visual",
    target_storage_path: ticket.path,
    target_mime_type: "image/jpeg",
    target_bytes: JPEG_1X1.byteLength,
  });
  expect(completed.error).toBeNull();
  expect(typeof completed.data).toBe("string");

  const reservation = await service.from("site_upload_reservations").select("status").eq("id", ticket.id).single();
  expect(reservation.error).toBeNull();
  expect(reservation.data?.status).toBe("consumed");

  const usage = await service
    .from("site_usage")
    .select("used_bytes,used_photo_slots,used_upload_tracks,reserved_bytes,reserved_photo_slots,reserved_upload_tracks")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({
    used_bytes: JPEG_1X1.byteLength,
    used_photo_slots: 1,
    used_upload_tracks: 0,
    reserved_bytes: 0,
    reserved_photo_slots: 0,
    reserved_upload_tracks: 0,
  });
});

test("traccia: reserve HTTP -> upload owner -> finalize HTTP crea la track e consuma uno slot", async ({ request }) => {
  const cookie = await ownerCookieHeader();
  const reserve = await request.post("/api/wizard/media/track", {
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    data: {
      action: "reserve",
      siteId,
      title: "Track upload e2e",
      byteSize: MP3_SAMPLE.byteLength,
      mimeType: "audio/mpeg",
    },
  });
  const reserveBody = await reserve.text();
  expect(reserve.status(), reserveBody).toBe(201);
  const ticket = JSON.parse(reserveBody) as { reservationId: string; path: string; bucket: string };
  expect(ticket.bucket).toBe("site-tracks");
  trackPaths.push(ticket.path);

  const uploaded = await owner.storage.from("site-tracks").upload(ticket.path, MP3_SAMPLE, {
    contentType: "audio/mpeg",
    upsert: false,
  });
  expect(uploaded.error).toBeNull();

  const finalize = await request.post("/api/wizard/media/track", {
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    data: {
      action: "finalize",
      siteId,
      reservationId: ticket.reservationId,
      title: "Track upload e2e",
      byteSize: MP3_SAMPLE.byteLength,
      mimeType: "audio/mpeg",
    },
  });
  const finalizeBody = await finalize.text();
  expect(finalize.status(), finalizeBody).toBe(201);
  const created = JSON.parse(finalizeBody) as { id?: string };
  expect(created.id).toBeTruthy();

  const track = await service
    .from("site_tracks")
    .select("title,source,mime_type,byte_size")
    .eq("id", created.id)
    .single();
  expect(track.error).toBeNull();
  expect(track.data).toMatchObject({
    title: "Track upload e2e",
    source: "upload",
    mime_type: "audio/mpeg",
    byte_size: MP3_SAMPLE.byteLength,
  });

  const usage = await service
    .from("site_usage")
    .select("used_bytes,used_photo_slots,used_upload_tracks,reserved_bytes,reserved_photo_slots,reserved_upload_tracks")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({
    used_bytes: JPEG_1X1.byteLength + MP3_SAMPLE.byteLength,
    used_photo_slots: 1,
    used_upload_tracks: 1,
    reserved_bytes: 0,
    reserved_photo_slots: 0,
    reserved_upload_tracks: 0,
  });
});

/** La dimensione vera dello Storage vince sui byte dichiarati dal client. */
test("byte diversi dalla prenotazione vengono rifiutati in finalize e la quota torna disponibile", async ({ request }) => {
  const declaredBytes = JPEG_1X1.byteLength + 1;
  const ticket = await reserveAsset(declaredBytes);
  assetPaths.push(ticket.path);

  // 1. L'oggetto ENTRA. La policy Storage governa bucket, owner, prenotazione attiva e
  //    path — non la dimensione, che alla valutazione della RLS non esiste ancora:
  //    Supabase valuta in `prepareUpload`, prima che i byte arrivino. Una versione
  //    precedente di questo banco pretendeva che fosse la policy a rifiutare, e sarebbe
  //    passata soltanto perché quella policy negava *tutto*: un verde che non dimostrava
  //    niente. Vedi TODO.md §2.
  const uploaded = await owner.storage.from("site-assets").upload(ticket.path, JPEG_1X1, {
    contentType: "image/jpeg",
    upsert: false,
  });
  expect(uploaded.error, "la policy non giudica la dimensione: l'oggetto entra").toBeNull();

  const stored = await service.storage.from("site-assets").info(ticket.path);
  expect(stored.data?.size, "nel bucket ci sono i byte veri, non quelli prenotati")
    .toBe(JPEG_1X1.byteLength);

  // 2. La garanzia vive nella finalizzazione, che confronta i byte REALMENTE memorizzati
  //    con quelli prenotati: `stored-object-mismatch`, che la route traduce in 409.
  const finalize = await request.post("/api/wizard/media/asset", {
    headers: { Cookie: await ownerCookieHeader(), "Content-Type": "application/json" },
    data: {
      action: "finalize",
      siteId,
      reservationId: ticket.id,
      kind: "visual",
      byteSize: declaredBytes,
      mimeType: "image/jpeg",
    },
  });
  expect(finalize.status(), "stored-object-mismatch diventa 409").toBe(409);
  expect(await finalize.json()).toMatchObject({ error: "file trasferito non coerente" });

  // 3. La prenotazione non è stata consumata e la quota è tornata libera: il rifiuto non
  //    deve costare byte all'artista.
  const reservation = await service.from("site_upload_reservations").select("status").eq("id", ticket.id).single();
  expect(reservation.error).toBeNull();
  expect(reservation.data?.status, "una finalize rifiutata non consuma la prenotazione")
    .not.toBe("consumed");
  expect(reservation.data?.status).toBe("released");

  const usage = await service
    .from("site_usage")
    .select("used_bytes,used_photo_slots,used_upload_tracks,reserved_bytes,reserved_photo_slots,reserved_upload_tracks")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({
    used_bytes: JPEG_1X1.byteLength + MP3_SAMPLE.byteLength,
    used_photo_slots: 1,
    used_upload_tracks: 1,
    reserved_bytes: 0,
    reserved_photo_slots: 0,
    reserved_upload_tracks: 0,
  });

  const afterRelease = await service.storage.from("site-assets").info(ticket.path);
  expect(afterRelease.data).toBeNull();
});
