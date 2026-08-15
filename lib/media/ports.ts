// Porte del filone media. Tre, separate di proposito.
//
// La separazione fra `MediaUrlSigner` e `MediaObjectFetcher` non è zelo architetturale: è
// ciò che rende dimostrabile l'invariante centrale. Il doppio del firmatario produce un URL
// nella forma vera di Supabase Storage — `…/object/sign/<bucket>/<path>?token=…`, che
// **contiene il path** — e i test verificano che né quel path né quell'URL compaiano nella
// risposta. Se qualcuno cambiasse la route per restituire l'URL firmato al chiamante,
// invece di consumarlo lato server, quei test diventerebbero rossi.

import type { MediaKind, MediaRow } from "./media";

/** Lettura privilegiata della riga. Grezza, senza filtri: il giudizio è di `decideMediaAccess`. */
export interface PrivilegedMediaSource {
  findRow(kind: MediaKind, id: string): Promise<MediaRow | null>;
}

/** Firma a vita breve su un bucket privato. `null` = firma non ottenuta. */
export interface MediaUrlSigner {
  sign(bucket: string, path: string, ttlSeconds: number): Promise<string | null>;
}

export type MediaObject = {
  readonly bytes: Uint8Array;
  /** Tipo dichiarato dallo Storage. Informativo: l'header lo decide l'allowlist, non questo. */
  readonly contentType: string | null;
};

/** Lettura dei byte dall'URL firmato. Vive interamente lato server. */
export interface MediaObjectFetcher {
  fetchObject(signedUrl: string): Promise<MediaObject | null>;
}

/**
 * Eventi diagnostici. Il contratto della porta è che nessun campo porti il path: §6.9
 * («`service_role` non appare mai nel client, nei log o nel repository») vale per la chiave,
 * e §6.3 tiene i path privati fra i campi interni. `handle.test.ts` verifica che nessun
 * evento contenga il path, ed è un test che può diventare rosso.
 */
export type MediaLogEvent = {
  readonly stage: "source" | "sign" | "fetch" | "deps";
  readonly kind: MediaKind | null;
  readonly id: string | null;
  readonly detail: string;
};

export type MediaLogger = (event: MediaLogEvent) => void;

export type MediaDeps = {
  readonly source: PrivilegedMediaSource;
  readonly signer: MediaUrlSigner;
  readonly fetcher: MediaObjectFetcher;
  readonly ttlSeconds?: number;
};
