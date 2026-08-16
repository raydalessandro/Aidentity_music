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

  it("le collezioni restano isolate per tenant e ordinate", async () => {
    const { siteReader } = reader();
    const [nvllListen, miriamListen, nvllFeed, nvllEpk] = await Promise.all([
      siteReader.loadListen(FIXTURE_IDS.nvllClick),
      siteReader.loadListen(FIXTURE_IDS.miriam),
      siteReader.loadFeed(FIXTURE_IDS.nvllClick),
      siteReader.loadEpk(FIXTURE_IDS.nvllClick),
    ]);

    expect(nvllListen.tracks.map((track) => track.title)).toEqual([
      "Traccia caricata",
      "Traccia incorporata",
    ]);
    expect(miriamListen.tracks.map((track) => track.title)).toEqual(["Solo per Miriam"]);
    expect(nvllListen.tracks.every((track) => track.site_id === FIXTURE_IDS.nvllClick)).toBe(true);
    expect(nvllFeed.posts.map((post) => post.sort_order)).toEqual([0, 1]);
    expect(nvllEpk.links.map((link) => link.sort_order)).toEqual([0, 1]);
    expect(nvllEpk.contacts.map((contact) => contact.email)).toEqual([
      "booking@nvllclick.it",
      "press@nvllclick.it",
    ]);
  });

  it("la sitemap elenca i soli siti pubblicati, in ordine stabile", async () => {
    const { siteReader } = reader();
    expect((await siteReader.listPublishedSites()).map((site) => site.slug)).toEqual([
      FIXTURE_SLUGS.miriam,
      FIXTURE_SLUGS.nvllClick,
    ]);
  });
});

describe("ciò che non è pubblicato non esiste", () => {
  it("la fixture contiene davvero siti non pubblicati", () => {
    const { database } = reader();
    expect(database.allSlugs()).toContain(FIXTURE_SLUGS.draft);
    expect(database.allSlugs()).toContain(FIXTURE_SLUGS.review);
    expect(fixtureSites().filter((site) => site.publicationStatus !== "published")).toHaveLength(2);
  });

  it.each([
    { stato: "draft", slug: FIXTURE_SLUGS.draft },
    { stato: "pending_review", slug: FIXTURE_SLUGS.review },
  ])("un sito $stato non risolve", async ({ slug }) => {
    const { siteReader } = reader();
    expect(await siteReader.findPublishedSite(slug)).toBeNull();
  });

  it("i contatti di un sito in bozza non sono leggibili nemmeno conoscendone l'id", async () => {
    const { siteReader } = reader();
    expect((await siteReader.loadEpk(FIXTURE_IDS.draft)).contacts).toEqual([]);
  });

  it.each(["admin", "Nvll Click"])("%s non produce una query", async (slug) => {
    const { database, siteReader } = reader();
    await resolveSite(slug, siteReader);
    expect(database.queries).toEqual([]);
  });
});

describe("i media pubblici derivano URL senza esporre path Storage", () => {
  it("FEED risolve solo gli asset effettivamente referenziati dai post", async () => {
    const { database, siteReader } = reader();
    const feed = await siteReader.loadFeed(FIXTURE_IDS.nvllClick);

    expect(database.relationsQueried()).toContain("public_assets");
    expect(feed.posts.map((post) => post.caption)).toEqual(["Scatto di copertina", "In studio"]);
    expect(feed.assets.map((asset) => asset.id)).toEqual([
      "33333333-3333-3333-3333-333333333333",
    ]);
    expect(feed.assets[0]?.public_url).toBe(
      mediaUrl("asset", FIXTURE_IDS.nvllClick, "33333333-3333-3333-3333-333333333333"),
    );
    expect(feed.assets[0]?.alt).toBeNull();
  });

  it("EPK riceve le photo_hi e MERCH soltanto i render merch", async () => {
    const { siteReader } = reader();
    const [epk, merch] = await Promise.all([
      siteReader.loadEpk(FIXTURE_IDS.nvllClick),
      siteReader.loadMerch(FIXTURE_IDS.nvllClick),
    ]);

    expect(epk.photoKit.map((asset) => asset.id)).toEqual([
      "66666666-6666-6666-6666-666666666666",
    ]);
    expect(epk.photoKit[0]?.public_url).toBe(
      mediaUrl("asset", FIXTURE_IDS.nvllClick, "66666666-6666-6666-6666-666666666666"),
    );
    expect(merch.items.map((asset) => asset.id)).toEqual([
      "44444444-4444-4444-4444-444444444444",
    ]);
    expect(merch.items[0]?.public_url).toBe(
      mediaUrl("asset", FIXTURE_IDS.nvllClick, "44444444-4444-4444-4444-444444444444"),
    );
  });

  it("una traccia upload arriva con audio_url che punta alla route media", async () => {
    const { siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    const upload = tracks.find((track) => track.source === "upload");

    expect(upload?.audio_url).toBe(
      mediaUrl("track", FIXTURE_IDS.nvllClick, "aaaa0001-0000-0000-0000-000000000000"),
    );
    const view = buildListenView(tracks, isAllowedEmbed);
    expect(view.rejected).toEqual([]);
    expect(view.tracks.map((track) => track.kind)).toEqual(["upload", "embed"]);
    expect(view.tracks.find((track) => track.kind === "upload")?.src).toBe(upload?.audio_url);
  });

  it("una traccia embed non riceve una sorgente audio interna", async () => {
    const { siteReader } = reader();
    const { tracks } = await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    expect(tracks.find((track) => track.source === "embed")?.audio_url).toBeUndefined();
  });

  it("gli URL media nominano il tenant della riga e non contengono path privati", async () => {
    const { database, siteReader } = reader();
    const [listen, feed] = await Promise.all([
      siteReader.loadListen(FIXTURE_IDS.nvllClick),
      siteReader.loadFeed(FIXTURE_IDS.nvllClick),
    ]);
    const urls = [
      ...listen.tracks.map((track) => track.audio_url ?? ""),
      ...feed.assets.map((asset) => asset.public_url),
    ];
    for (const url of urls.filter(Boolean)) {
      expect(url).toContain(FIXTURE_IDS.nvllClick);
      expect(url).not.toContain("storage");
      expect(url).not.toContain(".mp3");
      expect(url).not.toContain(".jpg");
    }
    expect(database.queries.flatMap((query) => query.columns)).not.toContain("storage_path");
  });
});

describe("le query chiedono solo proiezioni e colonne pubbliche", () => {
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

  it("nessuna query nomina una colonna interna o una tabella base", async () => {
    const { database, siteReader } = reader();
    await siteReader.findPublishedSite(FIXTURE_SLUGS.nvllClick);
    await siteReader.listPublishedSites();
    await siteReader.loadListen(FIXTURE_IDS.nvllClick);
    await siteReader.loadFeed(FIXTURE_IDS.nvllClick);
    await siteReader.loadEpk(FIXTURE_IDS.nvllClick);
    await siteReader.loadMerch(FIXTURE_IDS.nvllClick);

    const asked = database.queries.flatMap((query) => query.columns);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((column) => PRIVATE_COLUMNS.includes(column))).toEqual([]);
    expect(database.relationsQueried().every((relation) => relation.startsWith("public_"))).toBe(true);
  });
});

describe("una riga che non rispetta il contratto non entra nel dominio", () => {
  function withBrokenContact(email: unknown) {
    const sites = fixtureSites().map((site) =>
      site.site.id === FIXTURE_IDS.nvllClick
        ? { ...site, contacts: site.contacts.map((contact) => ({ ...contact, email })) }
        : site,
    );
    return createPublicSiteReader(new FakePublicDatabase(sites));
  }

  it("un'email invalida fa fallire tutta la collezione", async () => {
    const failure = await withBrokenContact("booking(at)nvllclick.it")
      .loadEpk(FIXTURE_IDS.nvllClick)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    expect((failure as SiteReaderRowError).relation).toBe("public_contacts");
    expect((failure as SiteReaderRowError).issues).toHaveLength(2);
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
