// Il giudizio di accesso, riga per riga.
//
// Ogni `describe` di questo file corrisponde a **una riga** di `access.ts` e dichiara quale
// riga rompere per renderlo rosso. È la prova di mutazione richiesta dal DoD, scritta dove
// si può leggere insieme al codice che difende.

import { describe, expect, it } from "vitest";

import { decideMediaAccess } from "./access";
import { MEDIA_BUCKET, type MediaRow } from "./media";
import {
  MEDIA_FIXTURE_IDS,
  MEDIA_FIXTURE_PATHS,
  MEDIA_FIXTURE_ROWS,
  mediaRowOf,
} from "./fixtures";

const IDS = MEDIA_FIXTURE_IDS;

function row(id: string, kind: "asset" | "track"): MediaRow {
  const found = MEDIA_FIXTURE_ROWS.find((entry) => entry.kind === kind && entry.id === id);
  if (found === undefined) throw new Error(`fixture assente: ${kind}/${id}`);
  return mediaRowOf(found);
}

describe("caso positivo", () => {
  it("concede l'asset pubblicato e restituisce bucket, path e tipo", () => {
    const access = decideMediaAccess("asset", IDS.publishedSite, row(IDS.publishedAsset, "asset"));

    expect(access).toEqual({
      ok: true,
      bucket: MEDIA_BUCKET.asset,
      path: MEDIA_FIXTURE_PATHS.publishedAsset,
      contentType: "image/jpeg",
    });
  });

  it("concede la traccia upload pubblicata dal bucket delle tracce", () => {
    const access = decideMediaAccess("track", IDS.publishedSite, row(IDS.publishedTrack, "track"));

    expect(access).toEqual({
      ok: true,
      bucket: MEDIA_BUCKET.track,
      path: MEDIA_FIXTURE_PATHS.publishedTrack,
      contentType: "audio/mpeg",
    });
  });

  it("normalizza il tipo: i parametri del MIME non entrano nell'header", () => {
    const access = decideMediaAccess("track", IDS.publishedSite, {
      ...row(IDS.publishedTrack, "track"),
      mimeType: "AUDIO/MPEG; charset=binary",
    });

    expect(access).toEqual(expect.objectContaining({ ok: true, contentType: "audio/mpeg" }));
  });
});

/**
 * Mutazione: cancellare in `access.ts` la riga
 *   `if (row.publicationStatus !== "published") return { ok: false, reason: "site-not-published" };`
 * rende rossi i due test qui sotto. Misurato.
 */
describe("un sito non pubblicato non concede nulla", () => {
  it("l'asset di un sito draft è negato con motivo site-not-published", () => {
    expect(decideMediaAccess("asset", IDS.draftSite, row(IDS.draftAsset, "asset"))).toEqual({
      ok: false,
      reason: "site-not-published",
    });
  });

  it("l'asset di un sito pending_review è negato con lo stesso motivo", () => {
    expect(decideMediaAccess("asset", IDS.reviewSite, row(IDS.reviewAsset, "asset"))).toEqual({
      ok: false,
      reason: "site-not-published",
    });
  });

  it("suspended non è pubblicato: la depubblicazione ha effetto immediato", () => {
    const suspended = { ...row(IDS.publishedAsset, "asset"), publicationStatus: "suspended" as const };
    expect(decideMediaAccess("asset", IDS.publishedSite, suspended)).toEqual({
      ok: false,
      reason: "site-not-published",
    });
  });
});

/**
 * Mutazione: cancellare `if (row.siteId !== siteId) …` rende rosso questo blocco, e solo
 * questo. È la ragione per cui l'URL porta il sito: senza, l'invariante non è esprimibile.
 */
describe("un tenant non raggiunge le righe di un altro", () => {
  it("l'asset del sito in bozza chiesto sotto il sito pubblicato è negato", () => {
    expect(decideMediaAccess("asset", IDS.publishedSite, row(IDS.draftAsset, "asset"))).toEqual({
      ok: false,
      reason: "tenant-mismatch",
    });
  });

  it("il controllo sul tenant precede quello sulla pubblicazione", () => {
    // L'asset appartiene a un sito published, ma l'URL nomina un altro sito: il motivo
    // deve restare `tenant-mismatch`, altrimenti l'ordine dei controlli è cambiato.
    expect(decideMediaAccess("asset", IDS.draftSite, row(IDS.publishedAsset, "asset"))).toEqual({
      ok: false,
      reason: "tenant-mismatch",
    });
  });
});

/**
 * Mutazione: cancellare `if (row.purgedAt !== null) …` rende rossi questi due.
 * §5: «soltanto le righe non purgate rappresentano un file disponibile».
 */
describe("una riga purgata non è un file disponibile", () => {
  it("l'asset purgato di un sito pubblicato è negato con motivo row-purged", () => {
    expect(decideMediaAccess("asset", IDS.publishedSite, row(IDS.purgedAsset, "asset"))).toEqual({
      ok: false,
      reason: "row-purged",
    });
  });

  it("la traccia purgata di un sito pubblicato è negata con lo stesso motivo", () => {
    expect(decideMediaAccess("track", IDS.publishedSite, row(IDS.purgedTrack, "track"))).toEqual({
      ok: false,
      reason: "row-purged",
    });
  });
});

describe("una riga senza file non è un media", () => {
  it("la traccia embed non ha storage_path e viene negata", () => {
    expect(decideMediaAccess("track", IDS.publishedSite, row(IDS.embedTrack, "track"))).toEqual({
      ok: false,
      reason: "no-storage-object",
    });
  });

  it("un identificativo che non corrisponde a nessuna riga è negato", () => {
    expect(decideMediaAccess("asset", IDS.publishedSite, null)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

/**
 * Mutazione: cancellare `if (!isServableMimeType(kind, row.mimeType)) …` rende rossi questi.
 * Un SVG servito dalla nostra origine è XSS same-origin: il bucket lo rifiuta al
 * caricamento, questa riga lo rifiuta alla restituzione.
 */
describe("il tipo dichiarato deve essere fra quelli servibili", () => {
  it("un asset SVG di un sito pubblicato è negato con motivo mime-not-servable", () => {
    expect(decideMediaAccess("asset", IDS.publishedSite, row(IDS.svgAsset, "asset"))).toEqual({
      ok: false,
      reason: "mime-not-servable",
    });
  });

  it("un tipo audio non può essere servito dal percorso asset e viceversa", () => {
    const audioRow = row(IDS.publishedTrack, "track");
    expect(decideMediaAccess("asset", IDS.publishedSite, audioRow)).toEqual({
      ok: false,
      reason: "mime-not-servable",
    });

    const imageRow = row(IDS.publishedAsset, "asset");
    expect(decideMediaAccess("track", IDS.publishedSite, imageRow)).toEqual({
      ok: false,
      reason: "mime-not-servable",
    });
  });

  it("un text/html finito in mime_type non diventa una pagina servita dalla piattaforma", () => {
    const hostile = { ...row(IDS.publishedAsset, "asset"), mimeType: "text/html" };
    expect(decideMediaAccess("asset", IDS.publishedSite, hostile)).toEqual({
      ok: false,
      reason: "mime-not-servable",
    });
  });
});
