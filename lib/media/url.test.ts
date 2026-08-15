// Parità fra ciò che il renderer scrive nell'HTML e ciò che la route serve.
//
// Non è un test di stringhe: la cartella della route è la fonte, e il costruttore dell'URL
// deve derivarne la forma. Spostare la route senza aggiornare `mediaUrl()` — o viceversa —
// rende rosso questo file invece di produrre immagini rotte in produzione.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MEDIA_FIXTURE_IDS } from "./fixtures";
import { mediaUrl } from "./url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const routeDir = join(repoRoot, "app", "api", "media", "[kind]", "[siteId]", "[id]");

describe("mediaUrl", () => {
  it("compone /api/media/<kind>/<siteId>/<id>", () => {
    expect(mediaUrl("asset", MEDIA_FIXTURE_IDS.publishedSite, MEDIA_FIXTURE_IDS.publishedAsset)).toBe(
      `/api/media/asset/${MEDIA_FIXTURE_IDS.publishedSite}/${MEDIA_FIXTURE_IDS.publishedAsset}`,
    );
    expect(mediaUrl("track", MEDIA_FIXTURE_IDS.publishedSite, MEDIA_FIXTURE_IDS.publishedTrack)).toBe(
      `/api/media/track/${MEDIA_FIXTURE_IDS.publishedSite}/${MEDIA_FIXTURE_IDS.publishedTrack}`,
    );
  });

  it("codifica i segmenti: un identificativo non può iniettare un altro percorso", () => {
    expect(mediaUrl("asset", "../../altro", "x/y")).toBe("/api/media/asset/..%2F..%2Faltro/x%2Fy");
  });

  it("la route esiste davvero, con i segmenti che mediaUrl produce", () => {
    expect(existsSync(join(routeDir, "route.ts"))).toBe(true);

    const url = mediaUrl("asset", MEDIA_FIXTURE_IDS.publishedSite, MEDIA_FIXTURE_IDS.publishedAsset);
    const segments = url.split("/").filter((segment) => segment !== "");
    expect(segments.slice(0, 2)).toEqual(["api", "media"]);
    expect(segments).toHaveLength(5);
  });

  it("non esiste una seconda route media che possa divergere da questa", () => {
    const mediaRoot = join(repoRoot, "app", "api", "media");

    function routeFiles(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const child = join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(child);
        return entry.name === "route.ts" ? [child] : [];
      });
    }

    expect(routeFiles(mediaRoot)).toEqual([join(routeDir, "route.ts")]);
  });
});

/**
 * `app/[slug]/**` non può importare il client Supabase in nessuna forma. `url.ts` è l'unico
 * modulo di questo filone che quel perimetro tocca: se acquisisse un import, potrebbe
 * portarcelo dentro transitivamente. Zero import è la garanzia più semplice da verificare.
 */
describe("url.ts resta senza dipendenze", () => {
  it("non contiene alcun import, require o export from", () => {
    const source = readFileSync(join(repoRoot, "lib", "media", "url.ts"), "utf8");
    const specifiers = [
      ...source.matchAll(/(?:^|\s)(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g),
      ...source.matchAll(/(?:^|\s)import\s*\(\s*["']([^"']+)["']/g),
      ...source.matchAll(/(?:^|\s)require\s*\(\s*["']([^"']+)["']/g),
      ...source.matchAll(/(?:^|\s)import\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);

    expect(specifiers).toEqual([]);
  });
});
