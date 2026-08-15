import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteShell } from "../../components/site-shell/SiteShell";
import { isAllowedEmbed } from "./embed";
import { StubSiteReader } from "./fixtures";
import { PlayerProvider } from "./player-provider";
import { buildListenView, resolveSite, type SiteView } from "./read-model";
import { EpkIdentity, SurfaceShell, TrackCatalogue } from "./surface-content";
import type { PublicTrackRow } from "./site-reader";

async function siteView(slug: string): Promise<SiteView> {
  const resolution = await resolveSite(slug, new StubSiteReader());
  if (resolution.status !== "ok") throw new Error(`atteso sito risolvibile: ${resolution.status}`);
  return resolution.site;
}

/**
 * DoD 4: il renderer è parametrico per definizione. Questi test falliscono se config,
 * palette o superfici vengono ignorate e il renderer produce sempre la stessa cosa.
 */
describe("il renderer è parametrico", () => {
  it("due config producono due HOME diverse con lo stesso layout", async () => {
    const first = await siteView("nvll-click");
    const second = await siteView("miriam-serra");

    const markupFirst = renderToStaticMarkup(
      <SiteShell config={first.config} palette={first.palette} previewId={first.slug} />,
    );
    const markupSecond = renderToStaticMarkup(
      <SiteShell config={second.config} palette={second.palette} previewId={second.slug} />,
    );

    expect(markupFirst).not.toBe(markupSecond);

    // identità
    expect(markupFirst).toContain("NVLL CLICK");
    expect(markupSecond).toContain("MIRIAM SERRA");
    expect(markupFirst).not.toContain("MIRIAM SERRA");

    // palette: i sette token della config finiscono nelle variabili CSS
    expect(markupFirst).toContain("--acid:#ccff00");
    expect(markupSecond).toContain("--acid:#8C173D");

    // coppia tipografica e famiglia icone
    expect(markupFirst).toContain("font-grotesk-mono");
    expect(markupSecond).toContain("font-serif-sans");
    expect(markupFirst).toContain("icons-line");
    expect(markupSecond).toContain("icons-block");

    // grana
    expect(markupFirst).toContain('data-grain="false"');
    expect(markupSecond).toContain('data-grain="true"');

    // stesso layout: entrambe hanno dock, topbar e skip link
    for (const markup of [markupFirst, markupSecond]) {
      expect(markup).toContain('class="dock"');
      expect(markup).toContain('class="topbar"');
      expect(markup).toContain("Salta al contenuto");
    }
  });

  it("la superficie spenta non compare nella navigazione dell'altro sito", async () => {
    const first = renderToStaticMarkup(
      <SurfaceShell site={await siteView("nvll-click")} surface="listen">
        <p>contenuto</p>
      </SurfaceShell>,
    );
    const second = renderToStaticMarkup(
      <SurfaceShell site={await siteView("miriam-serra")} surface="listen">
        <p>contenuto</p>
      </SurfaceShell>,
    );

    expect(first).toContain('href="/nvll-click/merch"');
    expect(second).not.toContain('href="/miriam-serra/merch"');
    expect(second).toContain('href="/miriam-serra/epk"');

    // l'etichetta viene da sectionCopy, non da una costante
    expect(second).toContain("ASCOLTI");
    expect(first).not.toContain("ASCOLTI");

    // la superficie corrente non è un link
    expect(second).toContain('aria-current="page"');
  });

  it("EPK rende bio e luogo del sito, non un testo fisso", async () => {
    const markup = renderToStaticMarkup(<EpkIdentity site={await siteView("nvll-click")} />);
    expect(markup).toContain("Fixture locale.");
    expect(markup).toContain("Fixture locale per reset e test CI.");
    expect(markup).toContain("Milano");
  });
});

describe("un solo elemento audio, iframe isolato per gli embed", () => {
  const uploadRow: PublicTrackRow = {
    id: "u1",
    site_id: "s1",
    title: "Traccia caricata",
    source: "upload",
    duration_seconds: 185,
    embed_provider: null,
    embed_url: null,
    audio_url: "https://cdn.example/u1.mp3",
    sort_order: 0,
  };
  const embedRow: PublicTrackRow = {
    id: "e1",
    site_id: "s1",
    title: "Traccia incorporata",
    source: "embed",
    duration_seconds: null,
    embed_provider: "spotify",
    embed_url: "https://open.spotify.com/track/1",
    sort_order: 1,
  };

  it("rende un solo elemento audio anche con più tracce upload", () => {
    const view = buildListenView(
      [uploadRow, { ...uploadRow, id: "u2", title: "Seconda", sort_order: 2 }, embedRow],
      isAllowedEmbed,
    );
    const markup = renderToStaticMarkup(
      <PlayerProvider>
        <TrackCatalogue view={view} />
      </PlayerProvider>,
    );

    expect(markup.match(/<audio/g) ?? []).toHaveLength(1);
    expect(markup.match(/<iframe/g) ?? []).toHaveLength(1);
    expect(markup).toContain('src="https://open.spotify.com/embed/track/1"');
    expect(markup).toContain("sandbox=");
  });

  it("non rende iframe per un embed fuori allowlist", () => {
    const view = buildListenView(
      [{ ...embedRow, embed_url: "https://evil.test/track/1" }],
      isAllowedEmbed,
    );
    const markup = renderToStaticMarkup(
      <PlayerProvider>
        <TrackCatalogue view={view} />
      </PlayerProvider>,
    );
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("evil.test");
  });
});

/**
 * Invariante di piano §D verificata sul sorgente: un solo elemento `audio` in tutta l'app.
 * Un secondo `<audio` in qualunque file di prodotto rende rosso questo test.
 */
describe("invariante: un solo `audio` in tutto il sorgente di prodotto", () => {
  const roots = ["app", "components", "lib"];
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

  function sourceFiles(dir: string): string[] {
    const entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
    return entries.flatMap((entry) => {
      const relative = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
      return [relative];
    });
  }

  it("dichiara l'elemento audio una volta sola, dentro il provider del player", () => {
    const occurrences = roots
      .flatMap((root) => sourceFiles(root))
      .flatMap((file) => {
        const matches = readFileSync(join(repoRoot, file), "utf8").match(/<audio[\s>]/g) ?? [];
        return matches.map(() => file);
      });

    expect(occurrences).toEqual([join("app", "[slug]", "player-provider.tsx")]);
  });
});
