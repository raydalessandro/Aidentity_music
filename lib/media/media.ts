// Vocabolario del filone media: cosa si può chiedere, da quale bucket arriva, per quanto
// vive la firma, quali tipi di contenuto si accetta di restituire.
//
// Fonte normativa: docs/L0.7-AIDENTITY-contratto-canonico.md §5 (forme contenuto v1) e §6.3
// («Campi interni come owner, consenso, billing, usage e **path privati** non entrano nelle
// proiezioni»). Il path privato è dato interno per contratto: nessuna riga di questo filone
// lo restituisce, in nessun campo e in nessun header.

/** Le due entità che possiedono un file nello Storage (§5, «Contenuti»). */
export type MediaKind = "asset" | "track";

export const MEDIA_KINDS: readonly MediaKind[] = ["asset", "track"];

/**
 * Un bucket per tabella. Non è simmetria estetica: `site_assets.storage_path` e
 * `site_tracks.storage_path` hanno due vincoli UNIQUE **separati**, quindi lo stesso path
 * può esistere in entrambe le tabelle. Un bucket unico renderebbe quella collisione un
 * incrocio fra due righe di tenant potenzialmente diversi; due bucket la rendono impossibile.
 */
export const MEDIA_BUCKET: Readonly<Record<MediaKind, string>> = {
  asset: "site-assets",
  track: "site-tracks",
};

/** Tabella di provenienza della riga, per il lettore privilegiato. */
export const MEDIA_TABLE: Readonly<Record<MediaKind, string>> = {
  asset: "site_assets",
  track: "site_tracks",
};

/**
 * Vita della firma, per `kind`. Ora che la route reindirizza, questa è la finestra in cui
 * un URL copiato dalla barra di rete resta valido: va scelta, non ereditata.
 *
 * `asset`: 60 secondi. Un'immagine si scarica in una richiesta sola; oltre non serve.
 *
 * `track`: 900 secondi. Un player audio non fa una richiesta sola — ogni seek ne apre una
 * nuova con `Range` sullo **stesso** URL. Con 60 secondi il primo seek dopo un minuto
 * riceverebbe un 400, cioè esattamente il player rotto che il redirect esiste per evitare.
 * Quindici minuti coprono l'ascolto di un brano; restano una frazione della finestra
 * infinita di un bucket pubblico, che è l'alternativa scartata.
 */
export const MEDIA_SIGNATURE_TTL_SECONDS: Readonly<Record<MediaKind, number>> = {
  asset: 60,
  track: 900,
};

/**
 * Allowlist dei tipi che questa route accetta di restituire, per `kind`.
 *
 * Serve a una cosa precisa: il file è caricato da un utente e servito **dalla nostra
 * origine**. Un `image/svg+xml` è un documento che può eseguire script, e servirlo qui
 * sarebbe XSS same-origin sul dominio della piattaforma. Lo stesso vale per qualunque tipo
 * testuale o HTML che finisse per errore in `mime_type`.
 *
 * È una seconda linea rispetto ad `allowed_mime_types` del bucket: quella impedisce il
 * caricamento, questa impedisce la *restituzione* anche di una riga già presente.
 * `video/*` resta fuori: §5 dice che il valore `video` è predisposto ma in v1 non si carica.
 */
export const SERVABLE_MIME_TYPES: Readonly<Record<MediaKind, readonly string[]>> = {
  asset: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
  track: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/ogg", "audio/wav"],
};

export function isServableMimeType(kind: MediaKind, mimeType: string | null): boolean {
  if (mimeType === null) return false;
  // `mime_type` in tabella può portarsi dietro parametri (`audio/mpeg; charset=binary`).
  const essence = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return SERVABLE_MIME_TYPES[kind].includes(essence);
}

/** Stati di pubblicazione del sito (enum `public.publication_status` di PR-0). */
export type PublicationStatus = "draft" | "pending_review" | "published" | "suspended";

/**
 * Riga come la vede il lettore privilegiato: **grezza**, senza filtri.
 *
 * Deliberato. Se la query filtrasse già `publication_status = 'published'`, il controllo
 * vivrebbe in una catena PostgREST che nessun test di questo repo può rendere rossa, e la
 * prova di mutazione richiesta dal DoD sarebbe una finzione. Qui la riga arriva com'è e
 * l'unico giudice è `decideMediaAccess`: una riga sola, cancellabile, con un test che
 * diventa rosso subito.
 */
export type MediaRow = {
  readonly siteId: string;
  readonly storagePath: string | null;
  readonly mimeType: string | null;
  readonly purgedAt: string | null;
  readonly publicationStatus: PublicationStatus;
};
