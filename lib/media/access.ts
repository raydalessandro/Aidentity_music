// L'UNICO giudice di accesso al media. Funzione pura: riga grezza dentro, verdetto fuori.
//
// Perché il giudizio sta qui e non nella query
// --------------------------------------------
// La query privilegiata è una lettura per identificativo, senza filtri. Se filtrasse
// `publication_status = 'published'` il controllo sarebbe dentro una catena PostgREST,
// dove nessun test di questo repo può renderlo rosso: cancellarlo passerebbe inosservato.
// Qui invece ogni invariante è una riga sola, e `access.test.ts` dichiara per ciascuna
// quale riga rompere e quale test diventa rosso.
//
// Non è un allentamento: la riga grezza vive solo dentro il processo server, dietro il
// `service_role`, e nessun ramo la restituisce al chiamante.

import { isServableMimeType, type MediaKind, type MediaRow } from "./media";
import { MEDIA_BUCKET } from "./media";

/**
 * Motivo del diniego. Serve ai test e ai log del server, **mai** alla risposta HTTP:
 * §6 e il DoD chiedono che un identificativo inesistente non riveli se esiste, quindi
 * tutti questi motivi collassano in una sola risposta indistinguibile.
 */
export type MediaDenial =
  /** Nessuna riga con quell'identificativo. */
  | "not-found"
  /** La riga esiste ma appartiene a un altro sito: l'URL mente sul tenant. */
  | "tenant-mismatch"
  /** Il sito non è `published`: draft, pending_review e suspended sono tutti no. */
  | "site-not-published"
  /** La riga è purgata: §5, «soltanto le righe non purgate rappresentano un file disponibile». */
  | "row-purged"
  /** Nessun file: è il caso di una traccia `embed`, che non ha `storage_path`. */
  | "no-storage-object"
  /** Il tipo dichiarato non è fra quelli che accettiamo di restituire dalla nostra origine. */
  | "mime-not-servable";

export type MediaAccess =
  | {
      readonly ok: true;
      /** Bucket privato da cui firmare. */
      readonly bucket: string;
      /** Path interno. Non attraversa mai il confine della risposta. */
      readonly path: string;
      readonly contentType: string;
    }
  | { readonly ok: false; readonly reason: MediaDenial };

export function decideMediaAccess(
  kind: MediaKind,
  siteId: string,
  row: MediaRow | null,
): MediaAccess {
  if (row === null) return { ok: false, reason: "not-found" };

  // Isolamento fra tenant: l'identificativo non basta, deve appartenere al sito dichiarato.
  if (row.siteId !== siteId) return { ok: false, reason: "tenant-mismatch" };

  // §6.3: `anon` legge soltanto righe collegate a un sito `published`. La route è
  // anonima per definizione, quindi vale la stessa regola.
  if (row.publicationStatus !== "published") return { ok: false, reason: "site-not-published" };

  // §5: una riga purgata è storia, non un file disponibile.
  if (row.purgedAt !== null) return { ok: false, reason: "row-purged" };

  if (row.storagePath === null || row.storagePath.trim() === "") {
    return { ok: false, reason: "no-storage-object" };
  }

  if (!isServableMimeType(kind, row.mimeType)) {
    return { ok: false, reason: "mime-not-servable" };
  }

  return {
    ok: true,
    bucket: MEDIA_BUCKET[kind],
    path: row.storagePath,
    // Non `row.mimeType` grezzo: si restituisce il valore dell'allowlist, così nessun
    // parametro arbitrario finito in tabella arriva all'header `content-type`.
    contentType: normalizeMimeType(row.mimeType),
  };
}

function normalizeMimeType(mimeType: string | null): string {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
