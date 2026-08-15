import { randomUUID } from "node:crypto";

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
const paths: string[] = [];

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

test("dimensione diversa dalla reservation viene negata da Storage e release restituisce la quota", async () => {
  const ticket = await reserve(JPEG_1X1.byteLength + 1);
  paths.push(ticket.path);

  const uploaded = await owner.storage.from("site-assets").upload(ticket.path, JPEG_1X1, {
    contentType: "image/jpeg",
    upsert: false,
  });
  expect(uploaded.error, "la policy deve rifiutare i byte diversi dalla reservation").not.toBeNull();

  const released = await service.rpc("wizard_release_upload", {
    reservation_id: ticket.id,
    actor: userId,
  });
  expect(released.error).toBeNull();
  expect(released.data).toBe(true);

  const reservation = await service
    .from("site_upload_reservations")
    .select("status")
    .eq("id", ticket.id)
    .single();
  expect(reservation.error).toBeNull();
  expect(reservation.data?.status).toBe("released");

  const usage = await service
    .from("site_usage")
    .select("reserved_bytes,reserved_photo_slots")
    .eq("site_id", siteId)
    .single();
  expect(usage.error).toBeNull();
  expect(usage.data).toMatchObject({ reserved_bytes: 0, reserved_photo_slots: 0 });
});
