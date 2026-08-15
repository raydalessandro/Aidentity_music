import { MEDIA_BUCKET, SERVABLE_MIME_TYPES } from "../media/media";

// C entra dopo il filone media: bucket e MIME hanno una sola sorgente runtime.
export const ASSET_BUCKET = MEDIA_BUCKET.asset;
export const TRACK_BUCKET = MEDIA_BUCKET.track;

export const ASSET_MAX_BYTES = 32 * 1024 * 1024;
export const TRACK_MAX_BYTES = 256 * 1024 * 1024;

export const ASSET_MIME_TYPES = SERVABLE_MIME_TYPES.asset;
export const TRACK_MIME_TYPES = SERVABLE_MIME_TYPES.track;

export type UploadAssetKind = "logo" | "visual" | "photo_hi" | "merch";

const assetKinds: readonly UploadAssetKind[] = ["logo", "visual", "photo_hi", "merch"];

export function isUploadAssetKind(value: string): value is UploadAssetKind {
  return assetKinds.includes(value as UploadAssetKind);
}

export function photoSlotsForAsset(kind: UploadAssetKind): number {
  return kind === "logo" ? 0 : 1;
}

export function normalizedMime(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAssetMimeAllowed(value: string): boolean {
  return ASSET_MIME_TYPES.includes(normalizedMime(value));
}

export function isTrackMimeAllowed(value: string): boolean {
  return TRACK_MIME_TYPES.includes(normalizedMime(value));
}

/** Path unico per prenotazione. Nessun filename utente e nessuna estensione:
 * la policy Storage può quindi provare esattamente quale oggetto è autorizzato. */
export function storagePath(siteId: string, reservationId: string): string {
  return `${siteId}/${reservationId}/object`;
}
