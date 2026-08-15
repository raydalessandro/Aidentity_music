"use client";

import { createSupabaseBrowserClient } from "../supabase/client";
import { ASSET_BUCKET, TRACK_BUCKET, type UploadAssetKind } from "./upload";

export type EmbedProvider = "spotify" | "apple_music" | "youtube" | "soundcloud";
export type AssetKind = UploadAssetKind;

type MediaResult = { id: string };
type UploadTicket = { reservationId: string; path: string; bucket: string };

async function jsonRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "operazione media non disponibile");
  return payload;
}

async function release(path: string, siteId: string, reservationId: string): Promise<void> {
  await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "release", siteId, reservationId }),
  });
}

async function directUpload(ticket: UploadTicket, expectedBucket: string, file: File): Promise<void> {
  if (ticket.bucket !== expectedBucket) throw new Error("ticket upload non coerente");
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(ticket.bucket).upload(ticket.path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

/**
 * I byte vanno browser → Supabase Storage. La route Next vede soltanto metadati:
 * prima prenota quota, dopo verifica l'oggetto e riconcilia i contatori.
 */
export async function uploadAsset(input: { siteId: string; kind: AssetKind; file: File }): Promise<MediaResult> {
  const route = "/api/wizard/media/asset";
  const ticket = await jsonRequest<UploadTicket>(route, {
    action: "reserve",
    siteId: input.siteId,
    kind: input.kind,
    byteSize: input.file.size,
    mimeType: input.file.type,
  });
  try {
    await directUpload(ticket, ASSET_BUCKET, input.file);
  } catch (error) {
    await release(route, input.siteId, ticket.reservationId);
    throw error;
  }
  try {
    return await jsonRequest<MediaResult>(route, {
      action: "finalize",
      siteId: input.siteId,
      reservationId: ticket.reservationId,
      kind: input.kind,
      byteSize: input.file.size,
      mimeType: input.file.type,
    });
  } catch (error) {
    // Se la finalize è arrivata al server ma la risposta si è persa, release
    // vede `consumed` e non cancella il file. Se non è arrivata, libera quota.
    await release(route, input.siteId, ticket.reservationId);
    throw error;
  }
}

export async function uploadTrack(input: { siteId: string; title: string; file: File }): Promise<MediaResult> {
  const route = "/api/wizard/media/track";
  const ticket = await jsonRequest<UploadTicket>(route, {
    action: "reserve",
    siteId: input.siteId,
    title: input.title,
    byteSize: input.file.size,
    mimeType: input.file.type,
  });
  try {
    await directUpload(ticket, TRACK_BUCKET, input.file);
  } catch (error) {
    await release(route, input.siteId, ticket.reservationId);
    throw error;
  }
  try {
    return await jsonRequest<MediaResult>(route, {
      action: "finalize",
      siteId: input.siteId,
      reservationId: ticket.reservationId,
      title: input.title,
      byteSize: input.file.size,
      mimeType: input.file.type,
    });
  } catch (error) {
    await release(route, input.siteId, ticket.reservationId);
    throw error;
  }
}

export async function createEmbedTrack(input: {
  siteId: string;
  title: string;
  provider: EmbedProvider;
  url: string;
}): Promise<MediaResult> {
  return jsonRequest<MediaResult>("/api/wizard/media/track", {
    action: "embed",
    ...input,
  });
}
