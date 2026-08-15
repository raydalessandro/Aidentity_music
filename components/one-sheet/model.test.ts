/**
 * Banco della composizione del foglio.
 *
 * Due invarianti vivono qui, e una sola delle due era misurata dove vive davvero.
 *
 * 1. **Lo scarto delle righe altrui precede il calcolo della densità.** Un test che guarda solo
 *    l'elenco finale non lo vede: filtrando *dopo* il calcolo, la riga estranea sparisce lo stesso
 *    dall'output e il test resta verde mentre il punteggio è già stato gonfiato. Misurato: con
 *    `chooseDensity(input)` al posto di `chooseDensity({…filtrato})`, i 490 test del repository
 *    restavano tutti verdi. I casi qui sotto pretendono quindi la **densità** e la **lunghezza
 *    tagliata**, cioè le due cose che cambiano se l'ordine si inverte, e non solo l'assenza della
 *    riga estranea.
 * 2. **Il confine del consenso**, per la parte che vive a runtime. La parte che vive nei tipi non
 *    è osservabile da qui e ha la sua sonda: `consent-boundary.probe.ts`.
 */

import { describe, expect, it } from "vitest";

import { chooseDensity, materialScore, prepareOneSheet, type OneSheetInput } from "./model";

const SITE = "22222222-2222-2222-2222-222222222222";
const OTHER = "55555555-5555-5555-5555-555555555555";

function input(overrides: Partial<OneSheetInput> = {}): OneSheetInput {
  return {
    siteId: SITE,
    slug: "nvll-click",
    identity: { name: "NVLL CLICK", handle: "nvll-click", claim: "Electro-pop italiano", shortBio: "Breve.", longBio: "Bio lunga.", location: "Milano" },
    palette: { ink: "#111111", panel: "#1a1a1a", paper: "#f5f2ea", muted: "#a0a0a0", dim: "#666666", line: "#333333", acid: "#ccff00", acidInk: "#111111" },
    contacts: [], links: [], press: [], dates: [], metrics: [], photoKit: [],
    ...overrides,
  };
}

const photo = (id: string, site_id = SITE, sort_order = 0, kind = "photo_hi") => ({ id, site_id, kind, alt: null, src: `/api/media/asset/${site_id}/${id}`, sort_order });
const date = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, starts_at: "2099-01-01T20:00:00+01:00", city: "Milano", venue: "Venue", ticket_url: null, sort_order });
const link = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, provider: "spotify", url: `https://example.test/${id}`, sort_order });
const metric = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, label: `M${id}`, value: `${sort_order}`, sort_order });

/**
 * Materiale abbondante, con dentro le righe che devono essere **rifiutate**: un banco di soli
 * casi validi proverebbe soltanto che il codice sa copiare l'input nell'output.
 * - `p-altrui`  RIFIUTATA: foto di un altro tenant.
 * - `p-logo`    RIFIUTATA: asset del sito giusto ma di `kind` sbagliato — il kit stampa è
 *               `photo_hi`, un logo su A4 non è una foto stampa.
 * - `d-altrui`  RIFIUTATA: data di un altro tenant.
 */
function richInput(): OneSheetInput {
  return input({
    photoKit: [
      ...Array.from({ length: 4 }, (_, index) => photo(`p${index}`, SITE, index)),
      photo("p-altrui", OTHER, 0),
      photo("p-logo", SITE, 9, "logo"),
    ],
    dates: [
      ...Array.from({ length: 10 }, (_, index) => date(`d${index}`, SITE, index)),
      date("d-altrui", OTHER, 0),
    ],
    metrics: Array.from({ length: 10 }, (_, index) => metric(`m${index}`, SITE, index)),
    links: Array.from({ length: 10 }, (_, index) => link(`l${index}`, SITE, index)),
  });
}

describe("densità one-sheet", () => {
  it("due foto e una data scelgono low: il caso minimo non resta mezzo vuoto", () => {
    expect(chooseDensity(input({ photoKit: [photo("p1"), photo("p2")], dates: [date("d1")] }))).toBe("low");
  });

  it("materiale intermedio sceglie medium", () => {
    expect(chooseDensity(input({
      photoKit: [photo("p1"), photo("p2"), photo("p3")],
      dates: [date("d1"), date("d2"), date("d3")],
      metrics: [metric("m1", SITE, 0)],
    }))).toBe("medium");
  });

  it("materiale ricco sceglie high", () => {
    expect(prepareOneSheet(richInput()).density).toBe("high");
  });

  it("high mostra al massimo cinque date", () => {
    expect(prepareOneSheet(richInput()).dates).toHaveLength(5);
  });

  it("high mostra al massimo cinque metriche", () => {
    expect(prepareOneSheet(richInput()).metrics).toHaveLength(5);
  });

  it("high mostra al massimo cinque link", () => {
    expect(prepareOneSheet(richInput()).links).toHaveLength(5);
  });

  /**
   * Le due soglie, prese sui valori esatti che le delimitano. Senza questi casi, spostare un
   * `<=` di un'unità non farebbe diventare rosso niente.
   */
  it.each([
    { punteggio: 7, densita: "low", righe: input({ photoKit: [photo("p1"), photo("p2")], dates: [date("d1"), date("d2", SITE, 1), date("d3", SITE, 2)] }) },
    { punteggio: 8, densita: "medium", righe: input({ photoKit: [photo("p1"), photo("p2")], dates: Array.from({ length: 4 }, (_, i) => date(`d${i}`, SITE, i)) }) },
    { punteggio: 17, densita: "medium", righe: input({ photoKit: Array.from({ length: 4 }, (_, i) => photo(`p${i}`, SITE, i)), links: Array.from({ length: 5 }, (_, i) => link(`l${i}`, SITE, i)), dates: Array.from({ length: 4 }, (_, i) => date(`d${i}`, SITE, i)) }) },
    { punteggio: 18, densita: "high", righe: input({ photoKit: Array.from({ length: 4 }, (_, i) => photo(`p${i}`, SITE, i)), links: Array.from({ length: 5 }, (_, i) => link(`l${i}`, SITE, i)), dates: Array.from({ length: 5 }, (_, i) => date(`d${i}`, SITE, i)) }) },
  ])("punteggio $punteggio → $densita", ({ punteggio, densita, righe }) => {
    expect(materialScore(righe)).toBe(punteggio);
    expect(chooseDensity(righe)).toBe(densita);
  });
});

/**
 * L'ordine fra scarto e calcolo, misurato dove cambia l'esito.
 *
 * In entrambi i casi il tenant proprietario ha materiale da `low`, e il tenant estraneo porta
 * abbastanza righe da spingere il punteggio complessivo in `high`. Se il filtro scivolasse dopo
 * il calcolo, il foglio verrebbe composto con la geometria sbagliata — foto piccole, due colonne,
 * corpo del testo compresso — a causa di righe che non appartengono al sito e che non compaiono
 * nemmeno nella pagina. È un tenant esterno che decide come si stampa il foglio di un altro.
 */
describe("la densità si calcola dopo lo scarto delle righe di un altro tenant", () => {
  const proprie = [photo("p1", SITE, 0), photo("p2", SITE, 1)];
  const estranee = {
    photoKit: [photo("x1", OTHER, 0), photo("x2", OTHER, 1)],
    links: Array.from({ length: 5 }, (_, i) => link(`x-l${i}`, OTHER, i)),
    metrics: Array.from({ length: 5 }, (_, i) => metric(`x-m${i}`, OTHER, i)),
  };

  it("il punteggio non filtrato sarebbe high: è la premessa della misura", () => {
    // Se questa premessa smettesse di valere, i due test qui sotto passerebbero a vuoto.
    const gonfio = input({
      photoKit: [...proprie, ...estranee.photoKit],
      links: estranee.links,
      metrics: estranee.metrics,
      dates: [date("d1", SITE, 0), date("d2", SITE, 1), date("d3", SITE, 2)],
    });
    expect(materialScore(gonfio)).toBe(21);
    expect(chooseDensity(gonfio)).toBe("high");
  });

  it("la densità resta low: le righe altrui non entrano nel punteggio", () => {
    const prepared = prepareOneSheet(input({
      photoKit: [...proprie, ...estranee.photoKit],
      links: estranee.links,
      metrics: estranee.metrics,
      dates: [date("d1", SITE, 0), date("d2", SITE, 1), date("d3", SITE, 2)],
    }));

    expect(prepared.density).toBe("low");
    // E il taglio segue la densità scelta: `low` mostra due date, non cinque.
    expect(prepared.dates.map((item) => item.id)).toEqual(["d1", "d2"]);
    expect(prepared.links).toEqual([]);
    expect(prepared.metrics).toEqual([]);
  });

  it("scarta la foto di un altro tenant prima di scegliere la densità", () => {
    const prepared = prepareOneSheet(input({ photoKit: [...proprie, ...estranee.photoKit] }));
    expect(prepared.photoKit.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(prepared.density).toBe("low");
  });

  it("scarta la data di un altro tenant prima di scegliere la densità", () => {
    const prepared = prepareOneSheet(input({
      dates: [date("mine-date", SITE, 0), ...Array.from({ length: 5 }, (_, i) => date(`other-${i}`, OTHER, i))],
      photoKit: [...proprie, ...estranee.photoKit],
      links: estranee.links,
    }));
    expect(prepared.dates.map((item) => item.id)).toEqual(["mine-date"]);
    expect(prepared.density).toBe("low");
  });
});

describe("confini di pubblicazione", () => {
  it("un contatto che porta il campo consenso non viene mai reso, nemmeno se valorizzato", () => {
    const hostile = {
      id: "c-bad", site_id: SITE, role: "press" as const, name: "Privato", email: "private@example.test", sort_order: 0,
      consent_confirmed_at: null,
    } as unknown as OneSheetInput["contacts"][number];
    const safe = { id: "c-ok", site_id: SITE, role: "booking" as const, name: "Pubblico", email: "public@example.test", sort_order: 1 };
    const prepared = prepareOneSheet(input({ contacts: [hostile, safe] }));
    expect(prepared.contacts.map((item) => item.email)).toEqual(["public@example.test"]);
  });

  it("rifiuta anche il contatto che dichiara il consenso confermato: conta la provenienza, non il valore", () => {
    const hostile = {
      id: "c-bad", site_id: SITE, role: "press" as const, name: "Privato", email: "private@example.test", sort_order: 0,
      consent_confirmed_at: "2026-07-02T09:00:00+02:00", consent_confirmed_by: "00000000-0000-0000-0000-000000000000",
    } as unknown as OneSheetInput["contacts"][number];
    const prepared = prepareOneSheet(input({ contacts: [hostile] }));
    expect(prepared.contacts).toEqual([]);
  });

  it("un asset che non è photo_hi non entra nel kit stampa: rifiutato il logo del sito giusto", () => {
    const prepared = prepareOneSheet(input({
      photoKit: [photo("logo", SITE, 0, "logo"), photo("vera", SITE, 1)],
    }));
    expect(prepared.photoKit.map((item) => item.id)).toEqual(["vera"]);
  });

  it("le righe rifiutate della fixture ricca non compaiono nel foglio composto", () => {
    const prepared = prepareOneSheet(richInput());
    const identificativi = [
      ...prepared.photoKit.map((item) => item.id),
      ...prepared.dates.map((item) => item.id),
    ];
    for (const rifiutata of ["p-altrui", "p-logo", "d-altrui"]) {
      expect(identificativi, `riga rifiutata presente: ${rifiutata}`).not.toContain(rifiutata);
    }
  });

  it("l'ordine è quello di sort_order, non quello di arrivo", () => {
    const prepared = prepareOneSheet(input({
      dates: [date("terza", SITE, 2), date("prima", SITE, 0), date("seconda", SITE, 1)],
      photoKit: [photo("p1", SITE, 0), photo("p2", SITE, 1)],
    }));
    expect(prepared.dates.map((item) => item.id)).toEqual(["prima", "seconda"]);
  });
});
