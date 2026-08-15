// Il contratto HTTP della route media, esercitato per intero senza Next e senza database.
//
// Ogni caso negativo dichiara **quale codice** e **quale corpo**: un test che si accontenti
// di «non 200» non distingue un diniego da un guasto, e su una superficie di sicurezza è
// proprio quella distinzione a contare.

import { describe, expect, it } from "vitest";

import {
  DENIAL_RESPONSES,
  MEDIA_BAD_REQUEST_BODY,
  MEDIA_UNAVAILABLE_BODY,
  MEDIA_UNCONFIGURED_BODY,
  MEDIA_UNREADABLE_BODY,
  MEDIA_UNRECOVERABLE_BODY,
  handleMediaRequest,
  type MediaHttpResponse,
} from "./handle";
import {
  FIXTURE_BYTES,
  MEDIA_FIXTURE_IDS,
  MEDIA_FIXTURE_PATHS,
  createFixtureFetcher,
  createFixtureMediaSource,
  createFixtureSigner,
} from "./fixtures";
import { MEDIA_SIGNATURE_TTL_SECONDS } from "./media";
import type { MediaDeps, MediaLogEvent } from "./ports";

const IDS = MEDIA_FIXTURE_IDS;

function deps(overrides: Partial<MediaDeps> = {}): MediaDeps {
  return {
    source: createFixtureMediaSource(),
    signer: createFixtureSigner(),
    fetcher: createFixtureFetcher(),
    ...overrides,
  };
}

async function get(
  raw: unknown,
  overrides: Partial<MediaDeps> = {},
): Promise<MediaHttpResponse> {
  const resolved = deps(overrides);
  return handleMediaRequest(raw, () => resolved);
}

// ---------------------------------------------------------------- caso positivo

describe("un asset pubblicato arriva al visitatore", () => {
  it("200, byte del file, tipo dichiarato dall'allowlist", async () => {
    const response = await get({
      kind: "asset",
      siteId: IDS.publishedSite,
      id: IDS.publishedAsset,
    });

    expect(response.kind).toBe("bytes");
    if (response.kind !== "bytes") return;
    expect(response.status).toBe(200);
    expect(response.bytes).toEqual(FIXTURE_BYTES);
    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(response.headers["content-length"]).toBe(String(FIXTURE_BYTES.byteLength));
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    // Cache privata: una cache condivisa continuerebbe a servire dopo una depubblicazione.
    expect(response.headers["cache-control"]).toBe("private, max-age=60");
  });

  it("una traccia upload pubblicata arriva allo stesso modo, con il tipo audio", async () => {
    const response = await get({
      kind: "track",
      siteId: IDS.publishedSite,
      id: IDS.publishedTrack,
    });

    expect(response.kind).toBe("bytes");
    if (response.kind !== "bytes") return;
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("audio/mpeg");
  });

  it("la firma chiesta ha vita breve e riguarda il bucket giusto", async () => {
    const signer = createFixtureSigner();
    await get({ kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset }, { signer });

    expect(signer.ttls).toEqual([MEDIA_SIGNATURE_TTL_SECONDS]);
    expect(MEDIA_SIGNATURE_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(signer.issued[0]).toContain("/object/sign/site-assets/");
  });
});

// ---------------------------------------------------------------- dinieghi

/**
 * DoD 1. Ogni riga di questa tabella è un caso che **deve** essere rifiutato, e dichiara
 * l'esito atteso: 404 con corpo `{"error":"media non disponibile"}`.
 *
 * Mutazione misurata: cancellando da `access.ts` la riga che controlla `published`, i due
 * casi `sito draft` e `sito pending_review` diventano rossi qui e in `access.test.ts`.
 */
describe("ciò che non è pubblico non è ottenibile", () => {
  const casi = [
    {
      caso: "asset di un sito draft",
      target: { kind: "asset", siteId: IDS.draftSite, id: IDS.draftAsset },
    },
    {
      caso: "asset di un sito pending_review",
      target: { kind: "asset", siteId: IDS.reviewSite, id: IDS.reviewAsset },
    },
    {
      caso: "traccia di un sito draft",
      target: { kind: "track", siteId: IDS.draftSite, id: IDS.draftTrack },
    },
    {
      caso: "asset di un altro tenant chiesto sotto il sito pubblicato",
      target: { kind: "asset", siteId: IDS.publishedSite, id: IDS.draftAsset },
    },
    {
      caso: "asset del sito pubblicato chiesto sotto un altro sito",
      target: { kind: "asset", siteId: IDS.draftSite, id: IDS.publishedAsset },
    },
    {
      caso: "asset purgato",
      target: { kind: "asset", siteId: IDS.publishedSite, id: IDS.purgedAsset },
    },
    {
      caso: "traccia purgata",
      target: { kind: "track", siteId: IDS.publishedSite, id: IDS.purgedTrack },
    },
    {
      caso: "traccia embed, che non ha file",
      target: { kind: "track", siteId: IDS.publishedSite, id: IDS.embedTrack },
    },
    {
      caso: "asset SVG, non servibile dalla nostra origine",
      target: { kind: "asset", siteId: IDS.publishedSite, id: IDS.svgAsset },
    },
    {
      caso: "identificativo inesistente",
      target: { kind: "asset", siteId: IDS.publishedSite, id: IDS.absent },
    },
  ] as const;

  it.each(casi)("$caso → 404 «media non disponibile»", async ({ target }) => {
    const response = await get(target);

    expect(response).toEqual({
      kind: "json",
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: MEDIA_UNAVAILABLE_BODY,
    });
  });

  it("nessun diniego firma o scarica alcunché: si ferma prima dello Storage", async () => {
    const signer = createFixtureSigner();
    const fetcher = createFixtureFetcher();

    for (const { target } of casi) {
      await get(target, { signer, fetcher });
    }

    expect(signer.issued).toEqual([]);
    expect(fetcher.requested).toEqual([]);
  });

  it("la tabella dei dinieghi copre ogni motivo e non distingue nessuno", () => {
    const motivi = Object.keys(DENIAL_RESPONSES).sort();
    expect(motivi).toEqual(
      [
        "mime-not-servable",
        "no-storage-object",
        "not-found",
        "row-purged",
        "site-not-published",
        "tenant-mismatch",
      ].sort(),
    );

    const risposte = Object.values(DENIAL_RESPONSES).map((response) => JSON.stringify(response));
    expect(new Set(risposte).size).toBe(1);
    expect(risposte[0]).toContain('"status":404');
  });

  /**
   * DoD 1, ultima voce: un identificativo inesistente non deve rivelare se esiste o no.
   * Le risposte non sono «simili»: sono la stessa struttura, byte per byte.
   */
  it("i dieci dinieghi producono risposte indistinguibili fra loro", async () => {
    const responses = await Promise.all(casi.map(({ target }) => get(target)));
    const first = JSON.stringify(responses[0]);

    for (const [index, response] of responses.entries()) {
      expect(JSON.stringify(response), casi[index]?.caso).toBe(first);
    }
  });
});

// ---------------------------------------------------------------- il path non esce mai

/**
 * DoD 3. Il test è red-able per costruzione: il firmatario della fixture produce un URL
 * nella forma vera di Supabase Storage, che **contiene** il path
 * (`…/object/sign/site-assets/seed/nvll-click-hero.jpg?token=…`). Se la route restituisse
 * quell'URL invece dei byte — in un campo, in un header `Location`, ovunque — questo test
 * cadrebbe subito.
 */
describe("storage_path non compare mai nella risposta", () => {
  const paths = Object.values(MEDIA_FIXTURE_PATHS);

  it("né nel corpo né in un header, sul caso positivo", async () => {
    const signer = createFixtureSigner();
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { signer },
    );

    // La firma è stata davvero prodotta e contiene il path: la prova non gira a vuoto.
    expect(signer.issued).toHaveLength(1);
    expect(signer.issued[0]).toContain(MEDIA_FIXTURE_PATHS.publishedAsset);

    const serialized = JSON.stringify(response);
    for (const path of paths) expect(serialized).not.toContain(path);
    for (const path of paths) {
      for (const value of Object.values(response.headers)) expect(value).not.toContain(path);
    }
    for (const name of Object.keys(response.headers)) {
      expect(name.toLowerCase()).not.toContain("path");
      expect(name.toLowerCase()).not.toContain("location");
    }
    // Nemmeno l'URL firmato, che del path è il veicolo.
    expect(serialized).not.toContain("object/sign");
    expect(serialized).not.toContain("token=");
  });

  it("nessun campo della risposta si chiama storage_path, in nessuno dei casi", async () => {
    const targets = [
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { kind: "track", siteId: IDS.publishedSite, id: IDS.publishedTrack },
      { kind: "asset", siteId: IDS.draftSite, id: IDS.draftAsset },
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.absent },
    ];

    for (const target of targets) {
      const serialized = JSON.stringify(await get(target));
      expect(serialized).not.toContain("storage_path");
      expect(serialized).not.toContain("storagePath");
    }
  });

  it("nemmeno la diagnostica lo registra, quando lo Storage fallisce", async () => {
    const events: MediaLogEvent[] = [];
    const resolved = deps({ signer: createFixtureSigner({ signedUrl: null }) });

    const response = await handleMediaRequest(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      () => resolved,
      (event) => events.push(event),
    );

    expect(response.kind).toBe("json");
    expect(events).toHaveLength(1);
    const serialized = JSON.stringify(events);
    for (const path of paths) expect(serialized).not.toContain(path);
    expect(serialized).not.toContain("object/sign");
  });
});

// ---------------------------------------------------------------- input malformato

describe("input malformato", () => {
  const casi = [
    { caso: "kind sconosciuto", raw: { kind: "poster", siteId: IDS.publishedSite, id: IDS.publishedAsset } },
    { caso: "siteId non è un guid", raw: { kind: "asset", siteId: "nvll-click", id: IDS.publishedAsset } },
    { caso: "id non è un guid", raw: { kind: "asset", siteId: IDS.publishedSite, id: "33333333" } },
    { caso: "segmento ripetuto (array)", raw: { kind: "asset", siteId: IDS.publishedSite, id: [IDS.publishedAsset] } },
    { caso: "segmento assente", raw: { kind: "asset", siteId: IDS.publishedSite } },
    { caso: "parametri assenti", raw: null },
  ];

  it.each(casi)("$caso → 400 «richiesta non valida»", async ({ raw }) => {
    const response = await get(raw);

    expect(response).toEqual({
      kind: "json",
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: MEDIA_BAD_REQUEST_BODY,
    });
  });

  /**
   * Mutazione: spostare `deps()` prima di `parseMediaTarget` in `handle.ts` rende rosso
   * questo test. Un URL malformato non deve nemmeno far leggere la chiave privilegiata.
   */
  it("non costruisce le dipendenze privilegiate", async () => {
    let costruzioni = 0;
    const response = await handleMediaRequest({ kind: "poster" }, () => {
      costruzioni += 1;
      return deps();
    });

    expect(costruzioni).toBe(0);
    expect(response.status).toBe(400);
  });

  /**
   * Gli identificativi del seed non sono UUID v4. Con `z.uuid()` al posto di `z.guid()`
   * questo test diventa rosso: il bordo rifiuterebbe la fixture del repo.
   */
  it("accetta gli identificativi del seed, che non rispettano RFC 9562", async () => {
    const response = await get({
      kind: "asset",
      siteId: IDS.publishedSite,
      id: IDS.publishedAsset,
    });
    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------- guasti

describe("un guasto non si traveste da diniego", () => {
  it("dipendenze non costruibili → 500 «media non configurato»", async () => {
    const response = await handleMediaRequest(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      () => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante.");
      },
    );

    expect(response.status).toBe(500);
    expect(response).toEqual(expect.objectContaining({ body: MEDIA_UNCONFIGURED_BODY }));
  });

  it("lettura della riga fallita → 500 «media non leggibile»", async () => {
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { source: createFixtureMediaSource({ failWith: new Error("connessione interrotta") }) },
    );

    expect(response.status).toBe(500);
    expect(response).toEqual(expect.objectContaining({ body: MEDIA_UNREADABLE_BODY }));
  });

  it("firma non ottenuta → 502 «media non recuperabile»", async () => {
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { signer: createFixtureSigner({ signedUrl: null }) },
    );

    expect(response.status).toBe(502);
    expect(response).toEqual(expect.objectContaining({ body: MEDIA_UNRECOVERABLE_BODY }));
  });

  it("firma rifiutata dallo Storage → 502", async () => {
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { signer: createFixtureSigner({ failWith: new Error("bucket assente") }) },
    );

    expect(response.status).toBe(502);
  });

  it("oggetto non scaricabile → 502", async () => {
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { fetcher: createFixtureFetcher({ object: null }) },
    );

    expect(response.status).toBe(502);
    expect(response).toEqual(expect.objectContaining({ body: MEDIA_UNRECOVERABLE_BODY }));
  });

  it("il messaggio d'errore non nomina mai il motivo del diniego", async () => {
    // Un 502 su una riga pubblica non è un oracolo: quell'identificativo è già pubblico
    // in `public_assets`. Ciò che non deve trapelare è il motivo dei 404, e i 404 hanno
    // un corpo solo.
    const response = await get({ kind: "asset", siteId: IDS.publishedSite, id: IDS.draftAsset });
    expect(JSON.stringify(response)).not.toContain("tenant");
    expect(JSON.stringify(response)).not.toContain("draft");
    expect(JSON.stringify(response)).not.toContain("purg");
  });
});
