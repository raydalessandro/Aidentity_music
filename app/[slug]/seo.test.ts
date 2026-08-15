import { describe, expect, it } from "vitest";

import { StubSiteReader, bootstrapDraftConfig, fixtureSites } from "./fixtures";
import { buildListenView, resolveSite, type SiteView } from "./read-model";
import { isAllowedEmbed } from "./embed";
import {
  PRIVATE_PATHS,
  UNAVAILABLE_METADATA,
  buildMusicGroupJsonLd,
  buildRobots,
  buildSitemapEntries,
  buildSurfaceMetadata,
  jsonLdScriptContent,
} from "./seo";

const BASE = "https://aidentity.example";

async function siteView(slug: string): Promise<SiteView> {
  const resolution = await resolveSite(slug, new StubSiteReader());
  if (resolution.status !== "ok") throw new Error(`atteso sito risolvibile: ${resolution.status}`);
  return resolution.site;
}

describe("metadata per superficie", () => {
  it("usa identità e URL canonico del sito", async () => {
    const metadata = buildSurfaceMetadata(await siteView("nvll-click"), "home", BASE);
    expect(metadata.title).toBe("NVLL CLICK");
    expect(metadata.description).toBe("Fixture locale.");
    expect(metadata.alternates?.canonical).toBe("https://aidentity.example/nvll-click");
    expect(metadata.openGraph?.locale).toBe("it_IT");
  });

  it("qualifica il titolo con la superficie e ne segue l'etichetta personalizzata", async () => {
    const nvll = await siteView("nvll-click");
    expect(buildSurfaceMetadata(nvll, "epk", BASE).title).toBe("NVLL CLICK — EPK");
    expect(buildSurfaceMetadata(nvll, "listen", BASE).alternates?.canonical).toBe(
      "https://aidentity.example/nvll-click/listen",
    );

    const miriam = await siteView("miriam-serra");
    expect(buildSurfaceMetadata(miriam, "listen", BASE).title).toBe("MIRIAM SERRA — ASCOLTI");
  });

  it("distingue due siti diversi: il metadata è parametrico, non fisso", async () => {
    const first = buildSurfaceMetadata(await siteView("nvll-click"), "home", BASE);
    const second = buildSurfaceMetadata(await siteView("miriam-serra"), "home", BASE);
    expect(first.title).not.toBe(second.title);
    expect(first.description).not.toBe(second.description);
    expect(first.alternates?.canonical).not.toBe(second.alternates?.canonical);
  });

  it("non indicizza ciò che non è disponibile", () => {
    expect(UNAVAILABLE_METADATA.robots).toEqual({ index: false, follow: false });
    expect(UNAVAILABLE_METADATA.title).toBe("Sito non disponibile");
  });
});

describe("schema.org MusicGroup", () => {
  it("produce i campi dichiarati a partire dalla sola config", async () => {
    const site = await siteView("nvll-click");
    const jsonLd = buildMusicGroupJsonLd(site, BASE);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("MusicGroup");
    expect(jsonLd.name).toBe("NVLL CLICK");
    expect(jsonLd.alternateName).toBe("@nvll-click");
    expect(jsonLd.url).toBe("https://aidentity.example/nvll-click");
    expect(jsonLd.description).toBe("Fixture locale per reset e test CI.");
    expect(jsonLd.foundingLocation).toEqual({ "@type": "Place", name: "Milano" });
  });

  it("lascia `sameAs` vuoto finché non esiste una proiezione pubblica di site_links", async () => {
    expect(buildMusicGroupJsonLd(await siteView("nvll-click"), BASE).sameAs).toEqual([]);
    expect(
      buildMusicGroupJsonLd(await siteView("nvll-click"), BASE, {
        sameAs: ["https://open.spotify.com/artist/1"],
      }).sameAs,
    ).toEqual(["https://open.spotify.com/artist/1"]);
  });

  it("elenca le tracce rese, con la durata solo dove esiste", async () => {
    const site = await siteView("nvll-click");
    const listen = buildListenView(
      [
        {
          id: "u1",
          site_id: site.id,
          title: "Con durata",
          source: "upload",
          duration_seconds: 185,
          embed_provider: null,
          embed_url: null,
          audio_url: "https://cdn.example/u1.mp3",
          sort_order: 0,
        },
        {
          id: "e1",
          site_id: site.id,
          title: "Senza durata",
          source: "embed",
          duration_seconds: null,
          embed_provider: "spotify",
          embed_url: "https://open.spotify.com/track/1",
          sort_order: 1,
        },
      ],
      isAllowedEmbed,
    );

    expect(buildMusicGroupJsonLd(site, BASE, { tracks: listen.tracks }).track).toEqual([
      { "@type": "MusicRecording", name: "Con durata", duration: "PT3M5S" },
      { "@type": "MusicRecording", name: "Senza durata" },
    ]);
  });

  it("neutralizza `<` nella serializzazione, perché il testo arriva dal database", () => {
    expect(jsonLdScriptContent({ name: "</script><img src=x>" })).toBe(
      '{"name":"\\u003c/script>\\u003cimg src=x>"}',
    );
    expect(jsonLdScriptContent({ name: "</script>" })).not.toContain("</script>");
  });
});

describe("sitemap", () => {
  it("elenca solo le superfici accese di ogni sito pubblicato", () => {
    const rows = fixtureSites()
      .filter((site) => site.publicationStatus === "published")
      .map(({ row }) => ({ id: row.id, slug: row.slug, config: row.config }));

    const urls = buildSitemapEntries(rows, BASE).map((entry) => entry.url);

    expect(urls).toEqual([
      "https://aidentity.example/nvll-click/feed",
      "https://aidentity.example/nvll-click/listen",
      "https://aidentity.example/nvll-click/epk",
      "https://aidentity.example/nvll-click/merch",
      "https://aidentity.example/nvll-click",
      "https://aidentity.example/miriam-serra/feed",
      "https://aidentity.example/miriam-serra/listen",
      "https://aidentity.example/miriam-serra/epk",
      "https://aidentity.example/miriam-serra",
    ]);
  });

  // Casi che DEVONO essere esclusi.
  it("esclude la superficie spenta e il sito con config non pubblicabile", () => {
    const rows = fixtureSites()
      .filter((site) => site.publicationStatus === "published")
      .map(({ row }) => ({ id: row.id, slug: row.slug, config: row.config }));
    const urls = buildSitemapEntries(rows, BASE).map((entry) => entry.url);

    expect(urls).not.toContain("https://aidentity.example/miriam-serra/merch");
    expect(urls.some((url) => url.includes("config-rotta"))).toBe(false);
  });

  it("salta per intero un sito la cui config non è pubblicabile", () => {
    expect(
      buildSitemapEntries([{ id: "x", slug: "bozza", config: bootstrapDraftConfig() }], BASE),
    ).toEqual([]);
  });

  it("dà priorità massima a HOME e alta a EPK", () => {
    const rows = [{ id: "s", slug: "nvll-click", config: fixtureSites()[0]?.row.config }];
    const entries = buildSitemapEntries(rows, BASE);
    expect(entries.find((entry) => entry.url.endsWith("/nvll-click"))?.priority).toBe(1);
    expect(entries.find((entry) => entry.url.endsWith("/epk"))?.priority).toBe(0.8);
  });
});

describe("robots", () => {
  it("indica la sitemap sull'origine risolta", () => {
    expect(buildRobots(BASE).sitemap).toBe("https://aidentity.example/sitemap.xml");
    expect(buildRobots(BASE).host).toBe(BASE);
  });

  it("nega le aree applicative che non sono siti di clienti", () => {
    const rules = buildRobots(BASE).rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.disallow).toEqual([...PRIVATE_PATHS]);
    expect(PRIVATE_PATHS).toContain("/api/");
    expect(PRIVATE_PATHS).toContain("/auth/");
    // `/epk` non è negato: è un segmento di superficie, non un'area privata.
    expect(PRIVATE_PATHS).not.toContain("/epk");
  });
});
