import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: (): never => { throw new Error("ONE_SHEET_NOT_FOUND"); } }));

import { configureSiteReader, resetSiteReader } from "../composition";
import { StubSiteReader, fixtureSites } from "../fixtures";
import type { EpkRecords, SiteReader } from "../site-reader";
import OneSheetPage from "./page";

const SITE = "22222222-2222-2222-2222-222222222222";

/**
 * `StubSiteReader` dichiara `loadFeed()` e `loadMerch()` senza parametri: sono superfici che
 * la fixture non differenzia per sito. Inoltrare loro un `siteId` non è una svista innocua —
 * `tsc` la rifiuta (TS2554, «Expected 0 arguments, but got 1») e il typecheck era rosso.
 * Si delega senza argomento, come fa già `app/[slug]/epk/page.test.tsx`.
 */
function readerWith(epk: EpkRecords): SiteReader {
  const base = new StubSiteReader(fixtureSites());
  return {
    findPublishedSite: (slug) => base.findPublishedSite(slug),
    listPublishedSites: () => base.listPublishedSites(),
    loadListen: (siteId) => base.loadListen(siteId),
    loadFeed: () => base.loadFeed(),
    loadEpk: async () => epk,
    loadMerch: () => base.loadMerch(),
  };
}

afterEach(() => resetSiteReader());

describe("/ [slug] /one-sheet", () => {
  it("rende la preview A4 usando route media e non path Storage", async () => {
    const records: EpkRecords = {
      contacts: [{ id: "c1", site_id: SITE, role: "booking", name: "Giulia", email: "booking@example.test", sort_order: 0 }],
      links: [], press: [], dates: [], metrics: [],
      photoKit: [{ id: "p1", site_id: SITE, kind: "photo_hi", public_url: "ignored", alt: null, sort_order: 0 }],
    };
    configureSiteReader(readerWith(records));
    const markup = renderToStaticMarkup(await OneSheetPage({ params: Promise.resolve({ slug: "nvll-click" }) }));
    expect(markup).toContain('data-density="low"');
    expect(markup).toContain(`/api/media/asset/${SITE}/p1`);
    // L'attributo reso, non la stringa nuda: `data-one-sheet-photo` compare anche dentro il
    // selettore dello script di stampa, quindi la forma nuda era verde pure senza nessuna foto.
    expect(markup).toContain('data-one-sheet-photo="true"');
    expect(markup).toContain("beforeprint");
    expect(markup).not.toContain("storage_path");
    expect(markup).not.toContain("seed/nvll-click-hero.jpg");
  });

  it("righe di un altro tenant non compaiono né nel testo né negli URL media", async () => {
    const otherSite = "55555555-5555-5555-5555-555555555555";
    const records: EpkRecords = {
      contacts: [
        { id: "foreign-contact", site_id: otherSite, role: "booking", name: "Altro Tenant", email: "foreign@example.test", sort_order: 0 },
      ],
      links: [],
      press: [],
      dates: [],
      metrics: [],
      photoKit: [
        { id: "foreign-photo", site_id: otherSite, kind: "photo_hi", public_url: "ignored", alt: "Altro tenant", sort_order: 0 },
      ],
    };
    configureSiteReader(readerWith(records));
    const markup = renderToStaticMarkup(await OneSheetPage({ params: Promise.resolve({ slug: "nvll-click" }) }));
    expect(markup).not.toContain("foreign@example.test");
    expect(markup).not.toContain("Altro Tenant");
    expect(markup).not.toContain("foreign-photo");
  });

  it("un contatto senza consenso simulato come deriva della proiezione non compare", async () => {
    const hostile = { id: "bad", site_id: SITE, role: "press", name: "Privato", email: "private@example.test", sort_order: 0, consent_confirmed_at: null } as unknown as EpkRecords["contacts"][number];
    configureSiteReader(readerWith({ contacts: [hostile], links: [], press: [], dates: [], metrics: [], photoKit: [] }));
    const markup = renderToStaticMarkup(await OneSheetPage({ params: Promise.resolve({ slug: "nvll-click" }) }));
    expect(markup).not.toContain("private@example.test");
    expect(markup).not.toContain("Privato");
  });

  it("un sito draft non produce one-sheet: esito preciso 404", async () => {
    configureSiteReader(readerWith({ contacts: [], links: [], press: [], dates: [], metrics: [], photoKit: [] }));
    await expect(OneSheetPage({ params: Promise.resolve({ slug: "owner-b-draft" }) })).rejects.toThrow("ONE_SHEET_NOT_FOUND");
  });
});
