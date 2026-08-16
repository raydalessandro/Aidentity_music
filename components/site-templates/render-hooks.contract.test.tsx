import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Root from "../../app/page";
import { shellPalettes } from "../site-shell/palettes";
import type { ShellConfig } from "../site-shell/types";
import { siteTemplates } from "./registry";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const palette = shellPalettes[0]!;

const config: ShellConfig = {
  identity: {
    name: "CONTRACT ARTIST",
    handle: "contract-artist",
    claim: "Hook contract",
    shortBio: "Bio breve",
    longBio: "Bio lunga",
    location: "Milano",
    locale: "it-IT",
  },
  sectionCopy: { version: 1 },
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

/**
 * API di render: solo data-*.
 * Le classi possono cambiare con CSS Modules e non sono mai un contratto e2e.
 */
const TEMPLATE_HOOKS = [
  "data-palette",
  "data-hero-image",
  "data-dock-center",
  "data-player-shell",
] as const;

describe("contratto stabile dei ganci di render", () => {
  it("la landing espone il proprio gancio semantico", () => {
    const markup = renderToStaticMarkup(<Root />);
    expect(markup).toContain("data-landing");
  });

  for (const template of siteTemplates) {
    it(`${template.id} espone tutti i ganci del contratto`, () => {
      const Home = template.Home;
      const markup = renderToStaticMarkup(
        <Home
          config={config}
          palette={palette}
          previewId={`contract-${template.id}`}
          heroSrc="/api/media/asset/contract/hero"
          embedded
        >
          <span data-template-preview-child>preview owner</span>
        </Home>,
      );

      for (const hook of TEMPLATE_HOOKS) {
        expect(markup, `${template.id} ha dimenticato ${hook}`).toContain(hook);
      }
      expect(markup, `${template.id} ha perso il contenuto della preview owner`)
        .toContain("data-template-preview-child");
    });
  }

  it("gli e2e consumano soltanto ganci data-* per il chrome variabile", () => {
    const shellSpec = readFileSync(join(repoRoot, "e2e", "shell.spec.ts"), "utf8");
    const mediaSpec = readFileSync(join(repoRoot, "e2e", "media.spec.ts"), "utf8");

    expect(shellSpec).toContain("[data-landing]");
    expect(shellSpec).toContain("[data-dock-center]");
    expect(shellSpec).toContain("[data-player-shell] button");
    expect(mediaSpec).toContain("[data-hero-image]");

    expect(shellSpec).not.toContain('".dock-center"');
    expect(shellSpec).not.toContain('".player-shell button"');
    expect(mediaSpec).not.toContain("img.hero-image");
  });
});
