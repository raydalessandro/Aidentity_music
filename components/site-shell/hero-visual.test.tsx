// L'hero di HOME: il punto in cui il filone media diventa visibile.
//
// Prima di questo lavoro `hero_asset_id` esisteva nella proiezione pubblica e non aveva
// nessun modo di diventare un'immagine: HOME rendeva un segnaposto con l'iniziale del nome.
// Qui si verifica che l'immagine compaia, che compaia **solo** come URL della route media, e
// che il segnaposto resti intatto per chi non passa la prop.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { mediaUrl } from "../../lib/media/url";
import { MEDIA_FIXTURE_IDS, MEDIA_FIXTURE_PATHS } from "../../lib/media/fixtures";
import { shellPalettes } from "./palettes";
import { SiteShell, type ShellConfig } from "./SiteShell";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const config: ShellConfig = {
  identity: {
    name: "NVLL CLICK",
    handle: "nvll-click",
    claim: "Electro-pop italiano",
    shortBio: "Fixture locale.",
    longBio: "Fixture locale.",
    location: "Milano",
    locale: "it-IT",
  },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true },
    { id: "listen", enabled: true },
    { id: "epk", enabled: true },
    { id: "merch", enabled: true },
    { id: "home", enabled: true },
  ],
};

const palette = shellPalettes[0];

function render(heroSrc?: string | null): string {
  if (palette === undefined) throw new Error("il filone A non dichiara nessuna palette");
  return renderToStaticMarkup(
    <SiteShell config={config} palette={palette} previewId="nvll-click" heroSrc={heroSrc} />,
  );
}

const HERO_URL = mediaUrl("asset", MEDIA_FIXTURE_IDS.publishedSite, MEDIA_FIXTURE_IDS.publishedAsset);

describe("hero di HOME", () => {
  it("senza sorgente resta il segnaposto di prima: l'aggiunta è additiva", () => {
    const markup = render();

    expect(markup).toContain("Visual principale segnaposto");
    expect(markup).toContain("hero-mark");
    expect(markup).not.toContain("<img");
    // Chi non passa la prop ottiene esattamente lo stesso HTML di chi passa `null`.
    expect(markup).toBe(render(null));
  });

  it("con la sorgente rende l'immagine dalla route media, con testo alternativo", () => {
    const markup = render(HERO_URL);

    expect(markup).toContain(`src="${HERO_URL}"`);
    expect(markup).toContain('alt="Visual principale di NVLL CLICK"');
    expect(markup).not.toContain("hero-mark");
  });

  /**
   * L'HTML pubblico non deve portare né il path privato né un URL firmato. È il motivo per
   * cui la pagina scrive l'URL della route e non una firma: una firma nell'HTML avrebbe una
   * scadenza, e in una pagina in cache scadrebbe prima di essere vista.
   */
  it("l'HTML non contiene path privati né firme", () => {
    const markup = render(HERO_URL);

    for (const path of Object.values(MEDIA_FIXTURE_PATHS)) {
      expect(markup).not.toContain(path);
    }
    expect(markup).not.toContain("object/sign");
    expect(markup).not.toContain("token=");
    expect(markup).not.toContain("storage_path");
  });
});

describe("il cablaggio in app/[slug]/page.tsx", () => {
  const source = readFileSync(join(repoRoot, "app", "[slug]", "page.tsx"), "utf8");

  it("passa l'hero costruendo l'URL con mediaUrl, non a mano", () => {
    expect(source).toContain("mediaUrl(");
    expect(source).toContain("heroSrc=");
    expect(source).toContain("site.heroAssetId");
  });

  it("non nomina lo Storage: la pagina non sa che esistano bucket o path", () => {
    expect(source).not.toContain("storage");
    expect(source).not.toContain("createSignedUrl");
  });
});
