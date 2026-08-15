/**
 * Il foglio reso, non il modello che lo decide.
 *
 * `model.test.ts` prova quale densità viene scelta; `styles.test.ts` prova che il CSS abbia tre
 * geometrie distinte. Fra le due c'è un anello che nessuna delle due vede: che il componente
 * **scriva** la densità sul foglio (`data-density`) e che ciò che scrive cambi davvero il
 * contenuto. Senza questo banco, `data-density` poteva sparire dal markup e le regole
 * `.sheet[data-density=…]` sarebbero rimaste nel CSS a non selezionare niente, con tutti i test
 * verdi.
 *
 * La fixture è per metà fatta di righe che devono essere **rifiutate**, e ogni rifiuto dichiara
 * la stringa esatta che non deve comparire nel markup.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OneSheet } from "./OneSheet";
import type { OneSheetInput } from "./model";

const SITE = "22222222-2222-2222-2222-222222222222";
const OTHER = "55555555-5555-5555-5555-555555555555";

const BIO_BREVE = "Bio breve della fixture, quella che sta su un foglio arioso.";
const BIO_LUNGA = "Bio lunga della fixture, quella che riempie una colonna stretta.";

function input(overrides: Partial<OneSheetInput> = {}): OneSheetInput {
  return {
    siteId: SITE,
    slug: "nvll-click",
    identity: {
      name: "NVLL CLICK",
      handle: "nvll-click",
      claim: "Electro-pop italiano",
      shortBio: BIO_BREVE,
      longBio: BIO_LUNGA,
      location: "Milano",
    },
    palette: { ink: "#111111", panel: "#1a1a1a", paper: "#f5f2ea", muted: "#a0a0a0", dim: "#666666", line: "#333333", acid: "#ccff00", acidInk: "#111111" },
    contacts: [], links: [], press: [], dates: [], metrics: [], photoKit: [],
    ...overrides,
  };
}

const photo = (id: string, site_id = SITE, sort_order = 0, kind = "photo_hi") => ({ id, site_id, kind, alt: null, src: `/api/media/asset/${site_id}/${id}`, sort_order });
const date = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, starts_at: "2099-01-01T20:00:00+01:00", city: "Milano", venue: `Venue ${id}`, ticket_url: null, sort_order });
const link = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, provider: "spotify", url: `https://example.test/${id}`, sort_order });

function render(value: OneSheetInput): string {
  return renderToStaticMarkup(<OneSheet input={value} />);
}

/**
 * Un input per densità, con il punteggio che lo colloca in quella fascia. Ciascuno porta anche
 * `p-intrusa`, foto di un altro tenant con `sort_order` 0 — RIFIUTATA: se il filtro cadesse,
 * arriverebbe prima delle altre e comparirebbe in tutti e tre i fogli. Nessuno dei tre banchi è
 * fatto di soli casi validi.
 */
const intrusa = photo("p-intrusa", OTHER, 0);

const perDensita = {
  low: input({ photoKit: [photo("p0", SITE, 0), photo("p1", SITE, 1), intrusa], dates: [date("d0")] }),
  medium: input({
    photoKit: [...Array.from({ length: 3 }, (_, i) => photo(`p${i}`, SITE, i)), intrusa],
    dates: Array.from({ length: 3 }, (_, i) => date(`d${i}`, SITE, i)),
    metrics: [{ id: "m0", site_id: SITE, label: "Ascolti", value: "10k", sort_order: 0 }],
  }),
  high: input({
    photoKit: [...Array.from({ length: 4 }, (_, i) => photo(`p${i}`, SITE, i)), intrusa],
    links: Array.from({ length: 5 }, (_, i) => link(`l${i}`, SITE, i)),
    dates: Array.from({ length: 5 }, (_, i) => date(`d${i}`, SITE, i)),
  }),
} as const;

describe("il foglio porta scritta la densità con cui è stato composto", () => {
  it.each(["low", "medium", "high"] as const)("%s finisce in data-density", (densita) => {
    expect(render(perDensita[densita])).toContain(`data-density="${densita}"`);
  });

  it.each(["low", "medium", "high"] as const)(
    "%s non rende p-intrusa: la foto di un altro tenant è rifiutata a ogni densità",
    (densita) => {
      expect(render(perDensita[densita])).not.toContain("p-intrusa");
    },
  );

  /**
   * Le tre densità non sono tre etichette sullo stesso foglio: i fogli sono tre diversi.
   * Se il componente rendesse sempre lo stesso markup cambiando solo l'attributo, questo test
   * resterebbe verde — perciò non confronta i markup interi ma il numero di foto ammesse, che
   * è la decisione di composizione più visibile su A4.
   */
  it("ogni densità ammette un numero diverso di foto: 2, 3, 4", () => {
    // Si conta l'attributo reso (`data-one-sheet-photo="true"`), non la stringa nuda: quella
    // compare anche nel selettore dello script di stampa, e conterebbe una foto che non c'è.
    const foto = (markup: string) => (markup.match(/data-one-sheet-photo="true"/g) ?? []).length;
    expect(foto(render(perDensita.low))).toBe(2);
    expect(foto(render(perDensita.medium))).toBe(3);
    expect(foto(render(perDensita.high))).toBe(4);
  });

  /** Il foglio arioso usa la bio breve; gli altri due la lunga. È l'unico punto che lo decide. */
  it("low rende la bio breve, medium e high la bio lunga", () => {
    const basso = render(perDensita.low);
    expect(basso).toContain(BIO_BREVE);
    expect(basso).not.toContain(BIO_LUNGA);

    for (const densita of ["medium", "high"] as const) {
      const markup = render(perDensita[densita]);
      expect(markup, densita).toContain(BIO_LUNGA);
      expect(markup, densita).not.toContain(BIO_BREVE);
    }
  });

  it("porta con sé lo script di preparazione alla stampa, non un secondo template", () => {
    const markup = render(perDensita.high);
    expect(markup).toContain("beforeprint");
    expect(markup).toContain("afterprint");
    expect(markup).toContain("img[data-one-sheet-photo]");
  });
});

/**
 * Esiti attesi dichiarati uno per uno: quale stringa esatta non deve comparire, e perché.
 * «Non contiene nulla» non è un esito atteso, è una speranza.
 */
describe("ciò che il foglio rifiuta non compare nel markup", () => {
  const contattoAltrui = { id: "c-altrui", site_id: OTHER, role: "booking" as const, name: "Altro Tenant", email: "altrui@example.test", sort_order: 0 };
  const contattoConConsenso = {
    id: "c-consenso", site_id: SITE, role: "press" as const, name: "Riga Derivata", email: "derivata@example.test", sort_order: 1,
    consent_confirmed_at: "2026-07-02T09:00:00+02:00",
  } as unknown as OneSheetInput["contacts"][number];
  const contattoBuono = { id: "c-buono", site_id: SITE, role: "booking" as const, name: "Giulia", email: "booking@example.test", sort_order: 2 };

  const ostile = input({
    photoKit: [photo("p-buona", SITE, 0), photo("p-altrui", OTHER, 1), photo("p-logo", SITE, 2, "logo")],
    dates: [date("d-buona", SITE, 0), date("d-altrui", OTHER, 1)],
    links: [link("l-buono", SITE, 0), link("l-altrui", OTHER, 1)],
    contacts: [contattoAltrui, contattoConConsenso, contattoBuono],
  });

  const markup = render(ostile);

  it("rende comunque il materiale ammesso: il vuoto qui sotto è misurato, non una pagina spenta", () => {
    expect(markup).toContain("booking@example.test");
    expect(markup).toContain("/api/media/asset/22222222-2222-2222-2222-222222222222/p-buona");
    expect(markup).toContain("Venue d-buona");
    expect(markup).toContain("https://example.test/l-buono");
  });

  it.each([
    { valore: "altrui@example.test", perche: "email di un contatto di un altro tenant" },
    { valore: "Altro Tenant", perche: "nome dello stesso contatto" },
    { valore: "derivata@example.test", perche: "contatto la cui riga porta consent_confirmed_at: non viene da public_contacts" },
    { valore: "Riga Derivata", perche: "nome dello stesso contatto" },
    { valore: "p-altrui", perche: "foto di un altro tenant, quindi anche il suo URL media" },
    { valore: "p-logo", perche: "asset del sito giusto ma di kind logo: il kit stampa è photo_hi" },
    { valore: "Venue d-altrui", perche: "data live di un altro tenant" },
    { valore: "https://example.test/l-altrui", perche: "link di un altro tenant" },
  ])("non rende $valore ($perche)", ({ valore }) => {
    expect(markup).not.toContain(valore);
  });
});
