import { describe, expect, it } from "vitest";

import { isAllowedEmbed } from "../../app/[slug]/embed";
import { buildListenView, resolveSite } from "../../app/[slug]/read-model";
import { mediaUrl } from "../media/url";
import { FIXTURE_IDS, FIXTURE_SLUGS, FakePublicDatabase, fixtureSites } from "./fixtures";
import { createPublicSiteReader } from "./public-site-reader";
import { SiteReaderRowError } from "./rows";

function reader(database = new FakePublicDatabase()) {
  return { database, siteReader: createPublicSiteReader(database) };
}

describe("l'adattatore usa i parametri che riceve", () => {
  // Il test che rende falsificabile tutto il resto: un adattatore che ignorasse lo slug e
  // restituisse sempre la prima riga passerebbe qualunque assertion su un solo sito.
  it("due slug diversi risolvono due siti diversi", async () => {
    const { siteReader } = reader();

    const first = await siteReader.findPublishedSite(FIXTURE_SLUGS.nvllClick);
    const second = await siteReader.findPublishedSite(FIXTURE_SLUGS.miriam);

    expect(first?.id).toBe(FIXTURE_IDS.nvllClick);
    expect(second?.id).toBe(FIXTURE_IDS.miriam);
    expect(first?.hero_asset_id).toBe("33333333-3333-3333-3333-333333333333");
    expect(second?.hero_asset_id).toBeNull();
  });

  it("uno slug pubblicato ma inesistente non risolve", async () => {
    const { siteReader } = reader();
    expect(await siteReader.findPublishedSite("slug-che-non-esiste")).toBeNull();
  });

  it("le tracce di un sito non compaiono nell'altro", async () => {
    const { siteReader } = reader();

    const nvll = await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    const miriam = await siteReader.loadListen(FIXTURE_IDS.miriam);

    expect(nvll.tracks.map((track) => track.title)).toEqual([
      "Traccia caricata",
      "Traccia incorporata",
    ]);
    expect(miriam.tracks.map((track) => track.title)).toEqual(["Solo per Miriam"]);
    expect(nvll.tracks.every((track) => track.site_id === FIXTURE_IDS.nvllClick)).toBe(true);
  });

  it("i contatti di un sito non compaiono nell'altro", async () => {
    const { siteReader } = reader();

    const nvll = await siteReader.loadEpk(FIXTURE_IDS.nvllClick);
    const miriam = await siteReader.loadEpk(FIXTURE_IDS.miriam);

    expect(nvll.contacts.map((contact) => contact.email)).toEqual([
      "booking@nvllclick.it",
      "press@nvllclick.it",
    ]);
    expect(miriam.contacts.map((contact) => contact.email)).toEqual([
      "management@miriamserra.it",
    ]);
  });

  it("ordina per sort_order, non per ordine di inserimento", async () => {
    // La fixture tiene le righe fuori ordine: senza `order by` questi array sarebbero invertiti.
    const { siteReader } = reader();

    const listen = await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    const feed = await siteReader.loadFeed(FIXTURE_IDS.nvllClick);
    const epk = await siteReader.loadEpk(FIXTURE_IDS.nvllClick);

    expect(listen.tracks.map((track) => track.sort_order)).toEqual([0, 1]);
    expect(feed.posts.map((post) => post.sort_order)).toEqual([0, 1]);
    expect(epk.links.map((link) => link.sort_order)).toEqual([0, 1]);
    expect(epk.contacts.map((contact) => contact.sort_order)).toEqual([0, 1]);
  });

  it("la sitemap elenca i soli siti pubblicati, in ordine stabile", async () => {
    const { siteReader } = reader();
    const sites = await siteReader.listPublishedSites();

    expect(sites.map((site) => site.slug)).toEqual([FIXTURE_SLUGS.miriam, FIXTURE_SLUGS.nvllClick]);
  });
});

describe("ciò che non è pubblicato non esiste", () => {
  it("la fixture contiene davvero i siti non pubblicati, altrimenti il test non prova nulla", () => {
    const { database } = reader();
    expect(database.allSlugs()).toContain(FIXTURE_SLUGS.draft);
    expect(database.allSlugs()).toContain(FIXTURE_SLUGS.review);
    expect(fixtureSites().filter((site) => site.publicationStatus !== "published")).toHaveLength(2);
  });

  it.each([
    { stato: "draft", slug: FIXTURE_SLUGS.draft },
    { stato: "pending_review", slug: FIXTURE_SLUGS.review },
  ])("un sito $stato non risolve: `null`, non una riga", async ({ slug }) => {
    const { siteReader } = reader();
    expect(await siteReader.findPublishedSite(slug)).toBeNull();
  });

  it("un sito in bozza non compare nella sitemap", async () => {
    const { siteReader } = reader();
    const slugs = (await siteReader.listPublishedSites()).map((site) => site.slug);
    expect(slugs).not.toContain(FIXTURE_SLUGS.draft);
  });

  it("i contatti di un sito in bozza non sono leggibili nemmeno conoscendone l'id", async () => {
    const { siteReader } = reader();
    const epk = await siteReader.loadEpk(FIXTURE_IDS.draft);
    expect(epk.contacts).toEqual([]);
  });

  it("uno slug riservato non produce nessuna query", async () => {
    const { database, siteReader } = reader();
    const resolution = await resolveSite("admin", siteReader);

    expect(resolution.status).toBe("reserved-slug");
    expect(database.queries).toEqual([]);
  });

  it("uno slug malformato non produce nessuna query", async () => {
    const { database, siteReader } = reader();
    const resolution = await resolveSite("Nvll Click", siteReader);

    expect(resolution.status).toBe("malformed-slug");
    expect(database.queries).toEqual([]);
  });
});

describe("ciò che non ha una sorgente pubblica non viene inventato", () => {
  it("nessuna superficie interroga public_assets", async () => {
    const { database, siteReader } = reader();

    await siteReader.loadFeed(FIXTURE_IDS.nvllClick);
    await siteReader.loadEpk(FIXTURE_IDS.nvllClick);
    await siteReader.loadMerch(FIXTURE_IDS.nvllClick);

    expect(database.relationsQueried()).not.toContain("public_assets");
  });

  it("FEED rende i post ma non gli asset: `public_assets` non ha un URL pubblico", async () => {
    const { siteReader } = reader();
    const feed = await siteReader.loadFeed(FIXTURE_IDS.nvllClick);

    expect(feed.posts.map((post) => post.caption)).toEqual(["Scatto di copertina", "In studio"]);
    expect(feed.assets).toEqual([]);
  });

  it("EPK non ha kit foto e MERCH resta vuota, senza query", async () => {
    const { database, siteReader } = reader();

    const epk = await siteReader.loadEpk(FIXTURE_IDS.nvllClick);
    const before = database.queries.length;
    const merch = await siteReader.loadMerch(FIXTURE_IDS.nvllClick);

    expect(epk.photoKit).toEqual([]);
    expect(merch.items).toEqual([]);
    expect(database.queries).toHaveLength(before);
  });

  /**
   * Il test che prima dichiarava il buco: la traccia `upload` arrivava senza `audio_url` e
   * il read model la scartava con `upload-source-missing`. Ora la sorgente esiste, ed e' la
   * route media. Se qualcuno togliesse `withAudioUrl` dall'adattatore, questo torna rosso.
   */
  it("una traccia upload arriva con audio_url che punta alla route media", async () => {
    const { siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.nvllClick);

    const upload = tracks.find((track) => track.source === "upload");
    expect(upload?.audio_url).toBe(
      mediaUrl("track", FIXTURE_IDS.nvllClick, "aaaa0001-0000-0000-0000-000000000000"),
    );

    const view = buildListenView(tracks, isAllowedEmbed);
    // Nessuno scarto: l'upload ora e' riproducibile, l'embed lo era gia'.
    expect(view.rejected).toEqual([]);
    expect(view.tracks.map((track) => track.kind)).toEqual(["upload", "embed"]);
    expect(view.tracks.find((track) => track.kind === "upload")?.src).toBe(upload?.audio_url);
  });

  it("una traccia embed non riceve nessuna sorgente audio: non ha un file", async () => {
    const { siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.nvllClick);

    const embed = tracks.find((track) => track.source === "embed");
    expect(embed?.audio_url).toBeUndefined();
  });

  it("l'URL audio nomina il tenant della riga, non quello chiesto dal chiamante", async () => {
    const { siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.miriam);

    for (const track of tracks) {
      if (track.source !== "upload") continue;
      expect(track.audio_url).toContain(FIXTURE_IDS.miriam);
      expect(track.audio_url).not.toContain(FIXTURE_IDS.nvllClick);
    }
  });

  it("l'URL audio non porta il path privato, che l'adattatore non legge nemmeno", async () => {
    const { database, siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.nvllClick);

    for (const track of tracks) {
      expect(track.audio_url ?? "").not.toContain(".mp3");
      expect(track.audio_url ?? "").not.toContain("storage");
    }
    expect(database.queries.flatMap((query) => query.columns)).not.toContain("storage_path");
  });
});

describe("le query chiedono solo colonne pubbliche", () => {
  const PRIVATE_COLUMNS = [
    "storage_path",
    "mime_type",
    "byte_size",
    "purged_at",
    "consent_confirmed_at",
    "consent_confirmed_by",
    "owner_id",
    "publication_status",
    "stripe_subscription_id",
  ];

  it("nessuna query nomina una colonna interna", async () => {
    const { database, siteReader } = reader();

    await siteReader.findPublishedSite(FIXTURE_SLUGS.nvllClick);
    await siteReader.listPublishedSites();
    await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    await siteReader.loadFeed(FIXTURE_IDS.nvllClick);
    await siteReader.loadEpk(FIXTURE_IDS.nvllClick);

    const asked = database.queries.flatMap((query) => query.columns);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((column) => PRIVATE_COLUMNS.includes(column))).toEqual([]);
  });

  it("ogni query nomina una proiezione pubblica, mai una tabella base", async () => {
    const { database, siteReader } = reader();

    await siteReader.findPublishedSite(FIXTURE_SLUGS.nvllClick);
    await siteReader.loadEpk(FIXTURE_IDS.nvllClick);

    expect(database.relationsQueried().length).toBeGreaterThan(0);
    for (const relation of database.relationsQueried()) {
      expect(relation.startsWith("public_")).toBe(true);
    }
  });
});

describe("una riga che non rispetta il contratto non entra nel dominio", () => {
  function withBrokenContact(email: unknown) {
    const sites = fixtureSites().map((site) =>
      site.site.id === FIXTURE_IDS.nvllClick
        ? {
            ...site,
            contacts: site.contacts.map((contact) => ({ ...contact, email })),
          }
        : site,
    );
    return createPublicSiteReader(new FakePublicDatabase(sites));
  }

  it("un'email che non è un'email fa fallire la lettura con relazione e campo dichiarati", async () => {
    const siteReader = withBrokenContact("booking(at)nvllclick.it");

    const failure = await siteReader.loadEpk(FIXTURE_IDS.nvllClick).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    const error = failure as SiteReaderRowError;
    expect(error.relation).toBe("public_contacts");
    expect(error.issues).toEqual([
      "riga 0.email: Invalid email address",
      "riga 1.email: Invalid email address",
    ]);
  });

  it("una riga rotta invalida tutta la collezione, non solo se stessa", async () => {
    const sites = fixtureSites().map((site) =>
      site.site.id === FIXTURE_IDS.nvllClick
        ? {
            ...site,
            links: [
              ...site.links,
              {
                id: "cccc0003-0000-0000-0000-000000000000",
                site_id: FIXTURE_IDS.nvllClick,
                provider: "spotify",
                url: "http://open.spotify.com/artist/insicuro",
                sort_order: 2,
              },
            ],
          }
        : site,
    );
    const siteReader = createPublicSiteReader(new FakePublicDatabase(sites));

    const failure = await siteReader.loadEpk(FIXTURE_IDS.nvllClick).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    expect((failure as SiteReaderRowError).relation).toBe("public_links");
    expect((failure as SiteReaderRowError).issues).toEqual([
      'riga 2.url: Invalid string: must start with "https://"',
    ]);
  });

  it("uno slug fuori forma nella proiezione non diventa un URL del sito", async () => {
    const sites = fixtureSites().map((site) =>
      site.site.id === FIXTURE_IDS.nvllClick
        ? { ...site, site: { ...site.site, slug: "NVLL Click" } }
        : site,
    );
    const siteReader = createPublicSiteReader(new FakePublicDatabase(sites));

    const failure = await siteReader.findPublishedSite("NVLL Click").catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    expect((failure as SiteReaderRowError).relation).toBe("public_sites");
    expect((failure as SiteReaderRowError).issues).toHaveLength(1);
    expect((failure as SiteReaderRowError).issues[0]).toContain("riga 0.slug:");
  });
});

describe("il read model riceve ciò che si aspetta", () => {
  it("resolveSite produce una vista completa a partire dall'adattatore", async () => {
    const { siteReader } = reader();
    const resolution = await resolveSite(FIXTURE_SLUGS.nvllClick, siteReader);

    expect(resolution.status).toBe("ok");
    if (resolution.status !== "ok") return;
    expect(resolution.site.id).toBe(FIXTURE_IDS.nvllClick);
    expect(resolution.site.config.identity.name).toBe("NVLL CLICK");
    expect(resolution.site.heroAssetId).toBe("33333333-3333-3333-3333-333333333333");
  });
});
