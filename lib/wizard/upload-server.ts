import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "../supabase/service-role";
import {
  ASSET_BUCKET,
  TRACK_BUCKET,
  photoSlotsForAsset,
  storagePath,
  type UploadAssetKind,
} from "./upload";

type ReservationKind = "asset" | "track_upload";
type ReservationStatus = "reserved" | "consumed" | "released" | "expired";
export type UploadTicket = { reservationId: string; path: string; bucket: string };

function service(): SupabaseClient {
  return createSupabaseServiceRoleClient();
}

async function removeObjectIfPresent(client: SupabaseClient, bucket: string, path: string): Promise<void> {
  const { data } = await client.storage.from(bucket).info(path);
  if (!data) return;
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    // Nessun path o dettaglio Storage nei log: gli identificativi bastano alla diagnostica.
    console.warn("[wizard-upload] cleanup Storage non riuscito", { bucket });
  }
}

/**
 * Prima il DB rende definitivamente `expired` le prenotazioni sotto lo stesso
 * lock usato da reserve/complete/release; solo dopo si toccano gli oggetti.
 * In questo modo una finalize concorrente non può consumare una prenotazione il
 * cui file è già stato rimosso.
 */
async function cleanupExpired(client: SupabaseClient, siteId: string, userId: string): Promise<void> {
  const { error: expireError } = await client.rpc("wizard_expire_uploads", {
    target_site: siteId,
    actor: userId,
  });
  if (expireError) throw new Error(`expire:${expireError.code ?? "unknown"}`);

  const { data: expired, error: readError } = await client
    .from("site_upload_reservations")
    .select("id,kind")
    .eq("site_id", siteId)
    .eq("status", "expired");
  if (readError) throw new Error(`expire-read:${readError.code ?? "unknown"}`);

  // Best effort: un orfano privato non è referenziato da site_assets/site_tracks
  // e verrà ritentato al prossimo reserve dello stesso sito.
  await Promise.all((expired ?? []).map(async (row) => {
    const bucket = row.kind === "asset" ? ASSET_BUCKET : TRACK_BUCKET;
    await removeObjectIfPresent(client, bucket, storagePath(siteId, row.id));
  }));
}

export async function reserveUpload(input: {
  siteId: string;
  userId: string;
  kind: ReservationKind;
  bytes: number;
  photoSlots: number;
  uploadTracks: number;
}): Promise<UploadTicket> {
  const client = service();
  await cleanupExpired(client, input.siteId, input.userId);

  const { data, error } = await client.rpc("wizard_reserve_upload", {
    target_site: input.siteId,
    actor: input.userId,
    target_kind: input.kind,
    target_bytes: input.bytes,
    target_photo_slots: input.photoSlots,
    target_upload_tracks: input.uploadTracks,
  });
  if (error || typeof data !== "string") throw new Error(`reserve:${error?.code ?? "unknown"}`);

  return {
    reservationId: data,
    path: storagePath(input.siteId, data),
    bucket: input.kind === "asset" ? ASSET_BUCKET : TRACK_BUCKET,
  };
}

export async function reserveAssetUpload(input: {
  siteId: string;
  userId: string;
  kind: UploadAssetKind;
  bytes: number;
}): Promise<UploadTicket> {
  return reserveUpload({
    siteId: input.siteId,
    userId: input.userId,
    kind: "asset",
    bytes: input.bytes,
    photoSlots: photoSlotsForAsset(input.kind),
    uploadTracks: 0,
  });
}

export async function reserveTrackUpload(input: {
  siteId: string;
  userId: string;
  bytes: number;
}): Promise<UploadTicket> {
  return reserveUpload({
    siteId: input.siteId,
    userId: input.userId,
    kind: "track_upload",
    bytes: input.bytes,
    photoSlots: 0,
    uploadTracks: 1,
  });
}

async function reservationStatus(
  client: SupabaseClient,
  siteId: string,
  reservationId: string,
): Promise<ReservationStatus | null> {
  const { data } = await client
    .from("site_upload_reservations")
    .select("status")
    .eq("id", reservationId)
    .eq("site_id", siteId)
    .maybeSingle();
  return (data?.status as ReservationStatus | undefined) ?? null;
}

/**
 * DB prima, Storage dopo. Se complete ha già vinto la gara, la RPC restituisce
 * false e il file NON viene cancellato. Se release/expire ha vinto, il file è
 * ormai orfano e può essere rimosso senza creare una riga contenuto spezzata.
 */
export async function releaseUpload(input: {
  siteId: string;
  userId: string;
  reservationId: string;
  bucket: string;
}): Promise<void> {
  const client = service();
  const { data, error } = await client.rpc("wizard_release_upload", {
    reservation_id: input.reservationId,
    actor: input.userId,
  });
  if (error) throw new Error(`release:${error.code ?? "unknown"}`);

  const releasedNow = data === true;
  const status = releasedNow
    ? "released"
    : await reservationStatus(client, input.siteId, input.reservationId);
  if (status === "released" || status === "expired") {
    await removeObjectIfPresent(
      client,
      input.bucket,
      storagePath(input.siteId, input.reservationId),
    );
  }
}

async function assertStoredSize(
  client: SupabaseClient,
  bucket: string,
  path: string,
  expectedBytes: number,
): Promise<void> {
  const { data, error } = await client.storage.from(bucket).info(path);
  if (error || !data || data.size !== expectedBytes) throw new Error("stored-object-mismatch");
}

export async function completeAssetUpload(input: {
  siteId: string;
  userId: string;
  reservationId: string;
  kind: UploadAssetKind;
  mimeType: string;
  bytes: number;
}): Promise<string> {
  const client = service();
  const path = storagePath(input.siteId, input.reservationId);
  try {
    await assertStoredSize(client, ASSET_BUCKET, path, input.bytes);
    const { data, error } = await client.rpc("wizard_complete_asset_upload", {
      reservation_id: input.reservationId,
      actor: input.userId,
      target_kind: input.kind,
      target_storage_path: path,
      target_mime_type: input.mimeType,
      target_bytes: input.bytes,
    });
    if (error || typeof data !== "string") throw new Error(`complete:${error?.code ?? "unknown"}`);
    return data;
  } catch (error) {
    try {
      await releaseUpload({
        siteId: input.siteId,
        userId: input.userId,
        reservationId: input.reservationId,
        bucket: ASSET_BUCKET,
      });
    } catch {
      // La prenotazione scade comunque. Non mascherare l'errore originale.
    }
    throw error;
  }
}

export async function completeTrackUpload(input: {
  siteId: string;
  userId: string;
  reservationId: string;
  title: string;
  mimeType: string;
  bytes: number;
}): Promise<string> {
  const client = service();
  const path = storagePath(input.siteId, input.reservationId);
  try {
    await assertStoredSize(client, TRACK_BUCKET, path, input.bytes);
    const { data, error } = await client.rpc("wizard_complete_track_upload", {
      reservation_id: input.reservationId,
      actor: input.userId,
      target_title: input.title,
      target_storage_path: path,
      target_mime_type: input.mimeType,
      target_bytes: input.bytes,
    });
    if (error || typeof data !== "string") throw new Error(`complete:${error?.code ?? "unknown"}`);
    return data;
  } catch (error) {
    try {
      await releaseUpload({
        siteId: input.siteId,
        userId: input.userId,
        reservationId: input.reservationId,
        bucket: TRACK_BUCKET,
      });
    } catch {
      // Vedi asset: preserviamo la causa primaria.
    }
    throw error;
  }
}
