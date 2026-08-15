/**
 * Prova della saldatura E↔D: il markup che esce da `app/[slug]/epk/page.tsx`.
 *
 * Non si testano qui gli invarianti di selezione — quelli hanno già il loro banco in
 * `components/epk/epk.test.tsx` e ripeterli sarebbe una seconda copia destinata a divergere.
 * Si testa ciò che quel banco non può vedere: che la **route** passi davvero i dati di
 * `loadEpk` ai componenti, nell'ordine deciso dal filone E, e che le righe che il contratto
 * rifiuta non compaiano nel markup **servito**, non solo nel valore di ritorno di una funzione.
 *
 * La fixture qui sotto è per metà fatta di righe che devono essere rifiutate, e ogni rifiuto
 * dichiara la stringa esatta che non deve comparire (`mustNotAppear`). Un banco di soli casi
 * validi proverebbe soltanto che il codice sa copiare l'input nell'output.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { configureSiteReader, resetSiteReader } from "../composition";
import { StubSiteReader, fixtureSites } from "../fixtures";
import type {
  EpkRecords,
  FeedRecords,
  ListenRecords,
  MerchRecords,
  PublicContactRow,
  PublicDateRow,
  PublicLinkRow,
  PublicMetricRow,
  PublicPressRow,
  PublicSiteRow,
  PublishedSiteIndexRow,
  SiteReader,
} from "../site-reader";
import { EMPTY_EPK } from "../site-reader";
import EpkPage from "./page";

/**
 * Riga che i tipi vieterebbero ma che la rete può consegnare comunque. Il cast serve a
 * simulare una proiezione che è derivata — una vista rifatta a mano, una `select *` di troppo —
 * non ad aggirare un vincolo: TypeScript non è un confine di runtime e questa è esattamente
 * la condizione contro cui l'invariante del consenso deve reggere.
 */
function hostile<T>(row: Record<string, unknown>): T {
  return row as T;
}

const SITE_ID = "22222222-2222-2222-2222-222222222222";

const contacts: readonly PublicContactRow[] = [
  {
    id: "cccc0001-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    role: "booking",
    name: "Giulia Ferri",
    email: "booking@nvllclick.example",
    sort_order: 0,
  },
  // RIFIUTATO — il caso obbligatorio. Riga che si porta dietro il campo del consenso, non
  // valorizzato: L0.7 §6.3 vieta al campo di entrare nella proiezione, quindi una riga che
  // ce l'ha non viene da `public_contacts` e non si rende. Vale a maggior ragione qui, dove
  // il campo dice per giunta che il consenso non c'è.
  hostile<PublicContactRow>({
    id: "cccc0002-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    role: "management",
    name: "Luca Ferrante",
    email: "nonconsentito@nvllclick.example",
    consent_confirmed_at: null,
    sort_order: 1,
  }),
  // RIFIUTATO — stesso motivo, consenso confermato. Il controllo guarda la provenienza, non
  // il valore: se il campo è arrivato fin qui, ciò che si è rotto sta a monte.
  hostile<PublicContactRow>({
    id: "cccc0003-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    role: "press",
    name: "Marta Sesti",
    email: "consenso-trapelato@nvllclick.example",
    consent_confirmed_at: "2026-07-02T09:00:00+02:00",
    sort_order: 2,
  }),
];

const links: readonly PublicLinkRow[] = [
  {
    id: "1111aaaa-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    provider: "spotify",
    url: "https://open.spotify.com/artist/nvllclick",
    sort_order: 0,
  },
  // RIFIUTATO: provider fuori dall'insieme chiuso di L0.7 §5.
  hostile<PublicLinkRow>({
    id: "1111bbbb-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    provider: "bandcamp",
    url: "https://nvllclick.bandcamp.example/album",
    sort_order: 1,
  }),
  // RIFIUTATO: URL non https.
  {
    id: "1111cccc-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    provider: "youtube",
    url: "http://www.youtube.com/@nvllclick",
    sort_order: 2,
  },
];

const press: readonly PublicPressRow[] = [
  {
    id: "2222aaaa-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    publication: "Rumore",
    quote: "Un disco che non chiede il permesso.",
    published_on: "2026-03-14",
    url: "https://rumore.example/nvll-click",
    sort_order: 0,
  },
  // RIFIUTATO: quote vuota (L0.7 §5 la richiede non vuota).
  {
    id: "2222bbbb-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    publication: "Testata Senza Quote",
    quote: "   ",
    published_on: null,
    url: null,
    sort_order: 1,
  },
];

/**
 * Le date sono lontane da qualunque istante di esecuzione, in entrambe le direzioni: la route
 * non inietta `now` — in produzione l'orologio è quello vero — e un banco che dipendesse dal
 * giorno in cui gira sarebbe un banco che un giorno diventa rosso da solo.
 */
const dates: readonly PublicDateRow[] = [
  {
    id: "3333aaaa-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    starts_at: "2099-09-12T21:30:00+02:00",
    city: "Milano",
    venue: "Circolo Magnolia",
    ticket_url: "https://biglietti.example/magnolia",
    sort_order: 0,
  },
  {
    id: "3333bbbb-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    starts_at: "2001-10-03T21:00:00+02:00",
    city: "Torino",
    venue: "sPAZIO211",
    ticket_url: null,
    sort_order: 1,
  },
  // RIFIUTATA: `timestamptz` senza offset, l'istante sarebbe ambiguo.
  {
    id: "3333cccc-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    starts_at: "2099-12-31T23:00:00",
    city: "Napoli",
    venue: "Duel Beat",
    ticket_url: null,
    sort_order: 2,
  },
];

const metrics: readonly PublicMetricRow[] = [
  {
    id: "4444aaaa-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    label: "Ascolti mensili",
    value: "184.000",
    sort_order: 0,
  },
  // RIFIUTATA: etichetta vuota.
  {
    id: "4444bbbb-0000-0000-0000-000000000000",
    site_id: SITE_ID,
    label: "   ",
    value: "999999",
    sort_order: 1,
  },
];

const records: EpkRecords = { contacts, links, press, dates, metrics, photoKit: [] };

/**
 * Esiti attesi dichiarati uno per uno: quale stringa esatta non deve comparire, e perché.
 * «Non contiene nulla» non è un esito atteso, è una speranza.
 */
const mustNotAppear: readonly { value: string; because: string }[] = [
  {
    value: "nonconsentito@nvllclick.example",
    because:
      "email del contatto la cui riga porta consent_confirmed_at: null — L0.7 §6.3, il consenso non entra nella proiezione",
  },
  { value: "Luca Ferrante", because: "nome dello stesso contatto" },
  {
    value: "consenso-trapelato@nvllclick.example",
    because: "email del contatto la cui riga porta il campo del consenso valorizzato",
  },
  { value: "bandcamp", because: "provider fuori dall'insieme chiuso di L0.7 §5" },
  { value: "http://www.youtube.com/@nvllclick", because: "URL del link non https" },
  { value: "Testata Senza Quote", because: "quote stampa vuota" },
  { value: "Duel Beat", because: "data live senza offset: istante ambiguo" },
  { value: "999999", because: "metrica con etichetta vuota" },
];

/** Lettore di prova: risoluzione del sito da `StubSiteReader`, EPK iniettato. */
function readerWith(epk: EpkRecords): SiteReader {
  const base = new StubSiteReader(fixtureSites());
  return {
    findPublishedSite: (slug: string): Promise<PublicSiteRow | null> =>
      base.findPublishedSite(slug),
    listPublishedSites: (): Promise<readonly PublishedSiteIndexRow[]> => base.listPublishedSites(),
    loadListen: (siteId: string): Promise<ListenRecords> => base.loadListen(siteId),
    loadFeed: (): Promise<FeedRecords> => base.loadFeed(),
    loadEpk: async (): Promise<EpkRecords> => epk,
    loadMerch: (): Promise<MerchRecords> => base.loadMerch(),
  };
}

async function renderEpk(slug: string, epk: EpkRecords): Promise<string> {
  configureSiteReader(readerWith(epk));
  return renderToStaticMarkup(await EpkPage({ params: Promise.resolve({ slug }) }));
}

afterEach(() => {
  resetSiteReader();
});

describe("la route EPK rende i componenti di components/epk", () => {
  it("monta le sei sezioni nell'ordine deciso dal filone E", async () => {
    const markup = await renderEpk("nvll-click", records);

    const order = ["Contatti", "Bio", "Ascolta e segui", "Stampa", "Date live", "Numeri"].map(
      (heading) => markup.indexOf(`>${heading}<`),
    );

    expect(order, `intestazioni trovate: ${JSON.stringify(order)}`).not.toContain(-1);
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it("rende il contenuto ammesso di tutte e cinque le collezioni", async () => {
    const markup = await renderEpk("nvll-click", records);

    // contatti
    expect(markup).toContain('href="mailto:booking@nvllclick.example"');
    // bio, da `config.identity` (la stessa che rende `render.test.tsx`)
    expect(markup).toContain("Fixture locale per reset e test CI.");
    // link
    expect(markup).toContain('href="https://open.spotify.com/artist/nvllclick"');
    expect(markup).toContain(">Spotify<");
    // stampa
    expect(markup).toContain("Un disco che non chiede il permesso.");
    // date live: futura e passata, ciascuna sotto la propria intestazione
    expect(markup).toContain("Prossime date");
    expect(markup).toContain("Circolo Magnolia");
    expect(markup).toContain("Date passate");
    expect(markup).toContain("sPAZIO211");
    // numeri
    expect(markup).toContain("Ascolti mensili");
    expect(markup).toContain("184.000");
  });

  it.each(mustNotAppear)("non rende $value ($because)", async ({ value }) => {
    expect(await renderEpk("nvll-click", records)).not.toContain(value);
  });
});

/**
 * DoD 4: un test che non può diventare rosso non conta.
 *
 * Se la route ignorasse `loadEpk` e rendesse sempre la stessa cosa — com'è stato finora, che
 * rendeva solo bio e identità — questi due test sarebbero gli unici a vederlo. Il primo
 * confronta due markup prodotti da due insiemi di righe diversi; il secondo pretende che con
 * zero righe le sezioni non esistano affatto, invece di comparire vuote.
 */
describe("la route è parametrica rispetto a ciò che loadEpk restituisce", () => {
  it("due EPK diversi producono due markup diversi", async () => {
    const first = await renderEpk("nvll-click", records);
    const second = await renderEpk("nvll-click", {
      ...records,
      links: [
        {
          id: "1111dddd-0000-0000-0000-000000000000",
          site_id: SITE_ID,
          provider: "tiktok",
          url: "https://www.tiktok.com/@nvllclick",
          sort_order: 0,
        },
      ],
      metrics: [],
    });

    expect(first).not.toBe(second);
    expect(first).toContain(">Spotify<");
    expect(second).not.toContain(">Spotify<");
    expect(second).toContain('href="https://www.tiktok.com/@nvllclick"');
    expect(first).toContain(">Numeri<");
    expect(second).not.toContain(">Numeri<");
  });

  it("senza righe non nasce nessuna intestazione orfana", async () => {
    const markup = await renderEpk("nvll-click", EMPTY_EPK);

    for (const heading of ["Contatti", "Ascolta e segui", "Stampa", "Date live", "Numeri"]) {
      expect(markup, `sezione vuota resa comunque: ${heading}`).not.toContain(`>${heading}<`);
    }
    // La bio viene dalla config, non da `loadEpk`: resta, ed è la prova che la pagina è viva.
    expect(markup).toContain(">Bio<");
  });
});
