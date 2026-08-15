import { randomUUID } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * Saldatura reale C -> media -> Supabase Storage.
 *
 * Il filone media porta nel job E2E URL, anon key e service-role key effimere.
 * Qui C usa quello stack vero per provare il punto che un pgTAP sul solo DB non
 * può dimostrare: la Storage API attraversa davvero le policy owner del wizard,
 * compreso il metadata `size` valorizzato dall'upload.
 */
test.describe.configure({ mode: "serial" });

const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64",
);

let service: SupabaseClient;
let owner: SupabaseClient;
let userId = "";
let siteId = "";
let email = "";
let ownerTokens: { access_token: string; refresh_token: string } | null = null;
const paths: string[] = [];

/**
 * Cookie di sessione per parlare con le route di Next come l'owner loggato.
 *
 * Il formato lo produce `@supabase/ssr`, la stessa libreria che la route usa per
 * rileggerlo: nome, chunking e codifica non sono indovinati qui, cosi' il test
 * non si rompe se la libreria cambia il proprio schema.
 */
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

async function reserve(bytes: number): Promise<{ id: string; path: string }> {
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
  email = `wizard-${suffix}@example.test`;
  const password = `Wizard-${suffix}-A1!`;

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
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
  if (service && paths.length > 0) {
    await service.storage.from("site-assets").remove(paths);
  }
  if (service && siteId) await service.from("sites").delete().eq("id", siteId);
  if (service && userId) await service.auth.admin.deleteUser(userId);
});

test("reservation -> upload owner -> consume attraversa Storage RLS e aggiorna usage", async () => {
  const ticket = await reserve(JPEG_1X1.byteLength);
  paths.push(ticket.path);

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

  const reservation = await service
    .from("site_upload_reservations")
    .select("status")
    .eq("id", ticket.id)
    .single();
  expect(reservation.error).toBeNull();
  expect(reservation.data?.status).toBe("consumed");

  const usage = await service
    .from("site_usage")
    .select("used_bytes,used_photo_slots,reserved_bytes,reserved_photo_slots")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({
    used_bytes: JPEG_1X1.byteLength,
    used_photo_slots: 1,
    reserved_bytes: 0,
    reserved_photo_slots: 0,
  });
});

/**
 * La garanzia sui byte non e' sparita, ha cambiato livello.
 *
 * Prima viveva nella policy Storage, che confrontava `metadata->>'size'` con i
 * byte prenotati. Quel confronto non poteva funzionare: Supabase valuta la RLS
 * durante `prepareUpload`, prima che i byte arrivino, e in quel momento
 * `metadata` contiene solo `mimetype` e `contentLength` -- `size` non esiste
 * ancora. La condizione negava ogni upload, quindi questa prova sarebbe passata
 * comunque, ma perche' TUTTO veniva negato: un verde che non dimostrava niente.
 *
 * Oggi l'oggetto entra nel bucket e a rifiutarlo e' la finalizzazione:
 * `assertStoredSize` in `lib/wizard/upload-server.ts` interroga l'oggetto con
 * `info()` e confronta la dimensione REALMENTE memorizzata con i byte attesi.
 * E' un controllo piu' forte di quello perduto, perche' la policy avrebbe potuto
 * vedere solo il `contentLength` dichiarato dal client.
 *
 * Il test passa dalla route HTTP, non dalla RPC: la RPC `wizard_complete_asset_upload`
 * confronta la prenotazione con i byte DICHIARATI, che qui coincidono, quindi da
 * sola accetterebbe. L'unica cosa che distingue i 631 byte scritti dai 632
 * prenotati e' il controllo lato server, ed e' quello che questo test misura.
 */
test("byte diversi dalla prenotazione entrano nello Storage ma la finalizzazione li rifiuta e la quota torna disponibile", async ({ request }) => {
  const declaredBytes = JPEG_1X1.byteLength + 1;
  const ticket = await reserve(declaredBytes);
  paths.push(ticket.path);

  // 1. L'upload ora entra: la policy governa bucket, owner, prenotazione attiva
  //    e path, non la dimensione.
  const uploaded = await owner.storage.from("site-assets").upload(ticket.path, JPEG_1X1, {
    contentType: "image/jpeg",
    upsert: false,
  });
  expect(uploaded.error, "la policy non giudica piu' la dimensione: l'oggetto entra").toBeNull();

  const stored = await service.storage.from("site-assets").info(ticket.path);
  expect(stored.data?.size, "nel bucket ci sono i byte veri, non quelli prenotati")
    .toBe(JPEG_1X1.byteLength);

  // 2. La finalizzazione, dalla route reale con la sessione dell'owner. Dichiara
  //    i byte prenotati: e' il caso in cui solo la dimensione memorizzata
  //    smaschera la differenza.
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

  // 3. La prenotazione NON e' stata consumata e la quota e' tornata libera.
  const reservation = await service
    .from("site_upload_reservations")
    .select("status")
    .eq("id", ticket.id)
    .single();
  expect(reservation.error).toBeNull();
  expect(reservation.data?.status, "una finalize rifiutata non consuma la prenotazione")
    .not.toBe("consumed");
  expect(reservation.data?.status).toBe("released");

  const usage = await service
    .from("site_usage")
    .select("used_bytes,used_photo_slots,reserved_bytes,reserved_photo_slots")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({
    used_bytes: JPEG_1X1.byteLength,
    used_photo_slots: 1,
    reserved_bytes: 0,
    reserved_photo_slots: 0,
  });

  // 4. Il rilascio ha anche ripulito l'oggetto rimasto nel bucket.
  const afterRelease = await service.storage.from("site-assets").info(ticket.path);
  expect(afterRelease.data, "l'oggetto orfano viene rimosso dopo il release").toBeNull();
});
