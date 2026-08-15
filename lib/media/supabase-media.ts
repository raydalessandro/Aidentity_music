// Adattatori verso Supabase. Nessun client viene creato qui: arriva come parametro.
//
// Stesso motivo di `lib/site-reader/postgrest-row-source.ts` — il client privilegiato vive
// in `lib/supabase/service-role.ts`, che apre con `import "server-only"`: un test che
// importasse quel modulo non riuscirebbe a caricarlo. Tenendo la costruzione fuori, la
// traduzione resta eseguibile in vitest con un doppio, e il `service_role` resta confinato
// al guscio della route.
//
// Le forme `…Like` sono minime e non alias di `SupabaseClient`: i tipi generici di
// `@supabase/postgrest-js` sono troppo profondi per essere confrontati con una forma
// ridotta. I `bridge…` **costruiscono** la forma minima chiamando il client vero, invece di
// dichiarare che il client vero è già quella forma: nessun cast, e il doppio dei test è un
// client legittimo a tutti gli effetti.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MEDIA_TABLE, type MediaKind, type MediaRow } from "./media";
import type { MediaUrlSigner, PrivilegedMediaSource } from "./ports";

// ---------------------------------------------------------------- lettura privilegiata

export type SingleResponseLike = {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
};

export interface MediaQueryLike {
  eq(column: string, value: string): MediaQueryLike;
  maybeSingle(): Promise<SingleResponseLike>;
}

export interface MediaQueryClientLike {
  from(relation: string): { select(columns: string): MediaQueryLike };
}

type SupabaseFilterBuilder = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

function wrapQuery(builder: SupabaseFilterBuilder): MediaQueryLike {
  return {
    eq: (column, value) => wrapQuery(builder.eq(column, value)),
    maybeSingle: async () => {
      const { data, error } = await builder.maybeSingle();
      return { data, error: error === null ? null : { message: error.message } };
    },
  };
}

/** Riduce il client Supabase alla sola superficie che il lettore media usa davvero. */
export function bridgeSupabaseMediaClient(client: SupabaseClient): MediaQueryClientLike {
  return {
    from: (relation) => ({
      select: (columns) => wrapQuery(client.from(relation).select(columns)),
    }),
  };
}

/** Colonne interne: escono dal database e si fermano dentro il processo server. */
const contentRowSchema = z.object({
  site_id: z.guid(),
  storage_path: z.string().nullable(),
  mime_type: z.string().nullable(),
  purged_at: z.string().nullable(),
});

const siteRowSchema = z.object({
  publication_status: z.enum(["draft", "pending_review", "published", "suspended"]),
});

/** Il trasporto ha fallito: rete, privilegi, colonna inesistente. Non è «nessuna riga». */
export class MediaSourceError extends Error {
  constructor(relation: string, detail: string) {
    super(`Lettura di ${relation} fallita: ${detail}`);
    this.name = "MediaSourceError";
  }
}

/**
 * Due letture, non una join.
 *
 * La prima prende la riga per identificativo — **senza** filtri su tenant, purga o stato:
 * quei giudizi sono di `decideMediaAccess`, dove un test può renderli rossi. La seconda
 * prende lo stato del sito a cui la riga dice di appartenere. Con `service_role` sono due
 * round trip su chiave primaria; il costo è trascurabile e in cambio non c'è una sintassi
 * di risorsa annidata da interpretare.
 */
export function createSupabaseMediaSource(
  client: () => MediaQueryClientLike,
): PrivilegedMediaSource {
  return {
    async findRow(kind: MediaKind, id: string): Promise<MediaRow | null> {
      const relation = MEDIA_TABLE[kind];
      const content = await client()
        .from(relation)
        .select("site_id, storage_path, mime_type, purged_at")
        .eq("id", id)
        .maybeSingle();
      if (content.error !== null) throw new MediaSourceError(relation, content.error.message);
      if (content.data === null || content.data === undefined) return null;

      const row = contentRowSchema.parse(content.data);

      const site = await client()
        .from("sites")
        .select("publication_status")
        .eq("id", row.site_id)
        .maybeSingle();
      if (site.error !== null) throw new MediaSourceError("sites", site.error.message);
      // Una riga contenuto senza sito è impossibile per FK: se accade, non è «pubblicato».
      if (site.data === null || site.data === undefined) return null;

      return {
        siteId: row.site_id,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        purgedAt: row.purged_at,
        publicationStatus: siteRowSchema.parse(site.data).publication_status,
      };
    },
  };
}

// ---------------------------------------------------------------- firma

export type SignedUrlResponseLike = {
  readonly data: { readonly signedUrl: string } | null;
  readonly error: { readonly message: string } | null;
};

export interface StorageSignerLike {
  createSignedUrl(bucket: string, path: string, expiresIn: number): Promise<SignedUrlResponseLike>;
}

export function bridgeSupabaseStorage(client: SupabaseClient): StorageSignerLike {
  return {
    createSignedUrl: async (bucket, path, expiresIn) => {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
      return {
        data: data === null ? null : { signedUrl: data.signedUrl },
        error: error === null ? null : { message: error.message },
      };
    },
  };
}

export class MediaSignatureError extends Error {
  constructor(detail: string) {
    super(`Firma dell'oggetto fallita: ${detail}`);
    this.name = "MediaSignatureError";
  }
}

export function createSupabaseMediaSigner(storage: () => StorageSignerLike): MediaUrlSigner {
  return {
    async sign(bucket: string, path: string, ttlSeconds: number): Promise<string | null> {
      const { data, error } = await storage().createSignedUrl(bucket, path, ttlSeconds);
      // Il messaggio d'errore dello Storage può contenere il path: non viene propagato.
      if (error !== null) throw new MediaSignatureError("lo Storage ha rifiutato la firma");
      return data?.signedUrl ?? null;
    },
  };
}

// I byte non passano più da qui: la route reindirizza e lo Storage li serve direttamente,
// con la propria CDN e con `Range`. Un `fetch` lato server esisteva quando la route faceva
// da proxy; toglierlo è ciò che restituisce il seek al player.
