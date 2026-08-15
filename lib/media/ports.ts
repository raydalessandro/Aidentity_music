// Porte del filone media. Due: chi legge la riga, chi firma l'oggetto.
//
// Il doppio del firmatario produce un URL nella forma vera di Supabase Storage —
// `…/object/sign/<bucket>/<path>?token=…`. La forma conta: il redirect ci punta, e i test
// verificano che il bersaglio sia una firma con scadenza e che il **corpo** della risposta
// non porti nulla.

import type { MediaKind, MediaRow } from "./media";

/** Lettura privilegiata della riga. Grezza, senza filtri: il giudizio è di `decideMediaAccess`. */
export interface PrivilegedMediaSource {
  findRow(kind: MediaKind, id: string): Promise<MediaRow | null>;
}

/** Firma a vita breve su un bucket privato. `null` = firma non ottenuta. */
export interface MediaUrlSigner {
  sign(bucket: string, path: string, ttlSeconds: number): Promise<string | null>;
}

/**
 * Eventi diagnostici. Il path resta fuori: nel `Location` è esposto per decisione di Ray e
 * con una scadenza addosso, in un log resterebbe scritto per sempre e senza scadenza.
 * `handle.test.ts` verifica che nessun evento lo contenga, ed è un test che può diventare
 * rosso.
 */
export type MediaLogEvent = {
  readonly stage: "source" | "sign" | "deps";
  readonly kind: MediaKind | null;
  readonly id: string | null;
  readonly detail: string;
};

export type MediaLogger = (event: MediaLogEvent) => void;

export type MediaDeps = {
  readonly source: PrivilegedMediaSource;
  readonly signer: MediaUrlSigner;
  /** Override della vita della firma. In prodotto resta `MEDIA_SIGNATURE_TTL_SECONDS`. */
  readonly ttlSeconds?: number;
};
