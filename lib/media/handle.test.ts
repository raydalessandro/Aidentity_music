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
  FIXTURE_SIGN_PREFIX,
  MEDIA_FIXTURE_IDS,
  MEDIA_FIXTURE_PATHS,
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
  it("302 verso lo Storage, senza corpo", async () => {
    const response = await get({
      kind: "asset",
      siteId: IDS.publishedSite,
      id: IDS.publishedAsset,
    });

    expect(response.kind).toBe("redirect");
    if (response.kind !== "redirect") return;
    expect(response.status).toBe(302);
    expect(response.headers["content-length"]).toBe("0");
    // Il redirect non si mette in cache: e' il punto in cui si verifica la pubblicazione, e
    // una copia in cache risponderebbe anche dopo una depubblicazione.
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("una traccia upload pubblicata ottiene lo stesso redirect, dal bucket delle tracce", async () => {
    const signer = createFixtureSigner();
    const response = await get(
      { kind: "track", siteId: IDS.publishedSite, id: IDS.publishedTrack },
      { signer },
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(`${FIXTURE_SIGN_PREFIX}site-tracks/`);
  });

  /**
   * DoD 3, riscritto per la forma decisa da Ray: il bersaglio del redirect deve essere una
   * firma, non un URL pubblico. Un firmatario che producesse `.../object/public/<bucket>/...`
   * rende rosso questo test, che e' il modo in cui ci si accorgerebbe di un bucket
   * diventato pubblico o di una firma sostituita da un link permanente.
   */
  it("il bersaglio e' un URL firmato, non un URL pubblico", async () => {
    const response = await get({
      kind: "asset",
      siteId: IDS.publishedSite,
      id: IDS.publishedAsset,
    });

    const location = response.headers.location ?? "";
    expect(location).toContain(FIXTURE_SIGN_PREFIX);
    expect(location).toContain("token=");
    expect(location).not.toContain("/object/public/");
    expect(location.startsWith("https://")).toBe(true);
  });

  /**
   * La scadenza e' breve e dichiarata per `kind`. L'asset si scarica in una richiesta;
   * la traccia no: ogni seek riapre una richiesta `Range` sullo stesso URL, e una firma da
   * sessanta secondi renderebbe il seek un errore dopo un minuto di ascolto.
   */
  it("la firma ha una scadenza breve, piu' lunga per l'audio che per le immagini", async () => {
    const perAsset = createFixtureSigner();
    await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { signer: perAsset },
    );
    expect(perAsset.ttls).toEqual([MEDIA_SIGNATURE_TTL_SECONDS.asset]);
    expect(MEDIA_SIGNATURE_TTL_SECONDS.asset).toBe(60);

    const perTrack = createFixtureSigner();
    await get(
      { kind: "track", siteId: IDS.publishedSite, id: IDS.publishedTrack },
      { signer: perTrack },
    );
    expect(perTrack.ttls).toEqual([MEDIA_SIGNATURE_TTL_SECONDS.track]);
    expect(MEDIA_SIGNATURE_TTL_SECONDS.track).toBe(900);

    // «Breve» ha un limite superiore dichiarato: un quarto d'ora, non un giorno.
    for (const ttl of Object.values(MEDIA_SIGNATURE_TTL_SECONDS)) {
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    }
  });

  it("firma il bucket che corrisponde al kind, mai l'altro", async () => {
    const signer = createFixtureSigner();
    await get({ kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset }, { signer });
    expect(signer.issued[0]).toContain(`${FIXTURE_SIGN_PREFIX}site-assets/`);
    expect(signer.issued[0]).not.toContain("site-tracks");
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

  /**
   * DoD 3, seconda metà: un accesso negato non produce redirect. Non «un redirect verso
   * altro»: nessuna firma viene chiesta, quindi lo Storage non viene nemmeno interpellato e
   * non esiste alcun `Location` da leggere.
   */
  it("nessun diniego firma alcunché e nessuno produce un Location", async () => {
    const signer = createFixtureSigner();

    for (const { caso, target } of casi) {
      const response = await get(target, { signer });
      expect(response.kind, caso).toBe("json");
      expect(response.headers.location, caso).toBeUndefined();
      expect(Object.keys(response.headers).map((name) => name.toLowerCase()), caso).not.toContain(
        "location",
      );
    }

    expect(signer.issued).toEqual([]);
    expect(signer.ttls).toEqual([]);
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
 * DoD 3, nella forma decisa da Ray.
 *
 * Il path ORA compare, per costruzione, nell'header `Location`: un URL firmato di Supabase
 * Storage lo contiene, e Ray ha scelto di esporlo per tenere `Range` e il seek. Constatarlo
 * non sarebbe un test. Ciò che resta da difendere, e che qui si difende, è il perimetro
 * dell'eccezione: il path non entra nel **corpo** di nessuna risposta, non entra nei log, e
 * non esce affatto quando l'accesso è negato.
 */
describe("il perimetro dell'eccezione a §6.3", () => {
  const paths = Object.values(MEDIA_FIXTURE_PATHS);

  it("il corpo della risposta positiva è vuoto: il path sta solo nel Location", async () => {
    const signer = createFixtureSigner();
    const response = await get(
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
      { signer },
    );

    // La firma è stata davvero prodotta e contiene il path: la prova non gira a vuoto.
    expect(signer.issued).toHaveLength(1);
    expect(signer.issued[0]).toContain(MEDIA_FIXTURE_PATHS.publishedAsset);

    expect(response.kind).toBe("redirect");
    if (response.kind !== "redirect") return;
    // `redirect` non ha proprio un campo corpo, e la risposta HTTP dichiara zero byte.
    expect("body" in response).toBe(false);
    expect(response.headers["content-length"]).toBe("0");

    // L'unico header che porta il path è `Location`. Nessun altro, e nessun nome di header.
    const senzaLocation = Object.entries(response.headers).filter(([name]) => name !== "location");
    for (const [name, value] of senzaLocation) {
      for (const path of paths) expect(value, name).not.toContain(path);
    }
    for (const name of Object.keys(response.headers)) {
      expect(name.toLowerCase()).not.toContain("path");
    }
  });

  it("nessuna risposta nomina il campo storage_path, in nessuno dei casi", async () => {
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

  /**
   * Un accesso negato non espone il path in nessuna forma: nel `Location` il path ha una
   * scadenza addosso e un controllo davanti, in una risposta negata non avrebbe né l'una né
   * l'altro. Questo test copre i dieci dinieghi uno per uno.
   */
  it("nessun diniego lascia trapelare un path, in nessun header e in nessun corpo", async () => {
    const targets = [
      { kind: "asset", siteId: IDS.draftSite, id: IDS.draftAsset },
      { kind: "asset", siteId: IDS.reviewSite, id: IDS.reviewAsset },
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.draftAsset },
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.purgedAsset },
      { kind: "track", siteId: IDS.publishedSite, id: IDS.purgedTrack },
      { kind: "track", siteId: IDS.publishedSite, id: IDS.embedTrack },
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.svgAsset },
      { kind: "asset", siteId: IDS.publishedSite, id: IDS.absent },
    ];

    for (const target of targets) {
      const serialized = JSON.stringify(await get(target));
      for (const path of paths) expect(serialized, target.id).not.toContain(path);
      expect(serialized).not.toContain("object/sign");
      expect(serialized).not.toContain("token=");
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
    expect(response.status).toBe(302);
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

  it("un guasto della firma non produce comunque un redirect", async () => {
    for (const signer of [
      createFixtureSigner({ signedUrl: null }),
      createFixtureSigner({ failWith: new Error("bucket assente") }),
    ]) {
      const response = await get(
        { kind: "asset", siteId: IDS.publishedSite, id: IDS.publishedAsset },
        { signer },
      );

      expect(response.kind).toBe("json");
      expect(response.headers.location).toBeUndefined();
      expect(response).toEqual(expect.objectContaining({ body: MEDIA_UNRECOVERABLE_BODY }));
    }
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
