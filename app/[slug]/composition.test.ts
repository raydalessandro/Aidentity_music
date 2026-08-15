import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  configureSiteReader,
  isSiteReaderConfigured,
  resetSiteReader,
  siteReader,
} from "./composition";
import { StubSiteReader } from "./fixtures";
import { unconfiguredSiteReader } from "./site-reader";

afterEach(() => {
  resetSiteReader();
});

describe("bordo di composizione", () => {
  it("parte dal lettore neutro: nessuno slug risolve finché nessuno inietta l'adattatore", async () => {
    expect(isSiteReaderConfigured()).toBe(false);
    expect(siteReader()).toBe(unconfiguredSiteReader);
    expect(await siteReader().findPublishedSite("nvll-click")).toBeNull();
    expect(await siteReader().listPublishedSites()).toEqual([]);
  });

  it("accetta un'implementazione iniettata dall'esterno", async () => {
    configureSiteReader(new StubSiteReader());
    expect(isSiteReaderConfigured()).toBe(true);
    expect((await siteReader().findPublishedSite("nvll-click"))?.slug).toBe("nvll-click");
  });

  it("torna al lettore neutro dopo il reset", () => {
    configureSiteReader(new StubSiteReader());
    resetSiteReader();
    expect(siteReader()).toBe(unconfiguredSiteReader);
  });
});

/**
 * Decisione di Ray: `SiteReader` è la porta del filone D e il renderer non dipende mai
 * direttamente dal client Supabase, né ora né dopo il merge del filone B.
 * Questo test è l'invariante architetturale corrispondente.
 */
describe("invariante: app/[slug]/** non importa mai il client Supabase", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const surfaceRoot = join("app", "[slug]");

  function sourceFiles(dir: string): string[] {
    return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return /\.tsx?$/.test(entry.name) ? [relative] : [];
    });
  }

  it("non contiene nessun import da lib/supabase né da @supabase/*", () => {
    const offenders = sourceFiles(surfaceRoot).filter((file) => {
      const source = readFileSync(join(repoRoot, file), "utf8");
      return /from\s+["'][^"']*(lib\/supabase|@supabase\/)/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("sitemap e robots passano dal bordo di composizione, non da un client", () => {
    for (const route of ["sitemap.ts", "robots.ts"]) {
      const source = readFileSync(join(repoRoot, "app", route), "utf8");
      expect(/from\s+["'][^"']*(lib\/supabase|@supabase\/)/.test(source), route).toBe(false);
    }
  });
});
