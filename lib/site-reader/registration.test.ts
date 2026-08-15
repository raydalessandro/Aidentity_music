import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSiteReaderConfigured,
  resetSiteReader,
  siteReader,
} from "../../app/[slug]/composition";
import { unconfiguredSiteReader } from "../../app/[slug]/site-reader";
import { FIXTURE_IDS, FIXTURE_SLUGS } from "./fixtures";
import type { PostgrestClientLike, PostgrestFilterLike } from "./postgrest-row-source";
import { registerSiteReader } from "./registration";

afterEach(() => {
  resetSiteReader();
});

/** Client minimo che risponde con una riga sola: basta a dimostrare che il giro si chiude. */
function clientReturning(rows: readonly unknown[]): PostgrestClientLike {
  const filter: PostgrestFilterLike = {
    eq: () => filter,
    order: () => filter,
    limit: () => filter,
    run: async () => ({ data: rows, error: null }),
  };
  return { from: () => ({ select: () => filter }) };
}

const SITE_ROW = {
  id: FIXTURE_IDS.nvllClick,
  slug: FIXTURE_SLUGS.nvllClick,
  config: { version: 1 },
  hero_asset_id: null,
};

describe("il bordo di composizione riceve davvero l'adattatore", () => {
  it("dopo la registrazione lo slug risolve attraverso il client iniettato", async () => {
    const outcome = registerSiteReader(() => clientReturning([SITE_ROW]));

    expect(outcome).toEqual({ registered: true });
    expect(isSiteReaderConfigured()).toBe(true);
    expect((await siteReader().findPublishedSite(FIXTURE_SLUGS.nvllClick))?.id).toBe(
      FIXTURE_IDS.nvllClick,
    );
  });

  it("il client viene costruito una volta sola, non a ogni query", async () => {
    let creations = 0;
    registerSiteReader(() => {
      creations += 1;
      return clientReturning([SITE_ROW]);
    });

    await siteReader().findPublishedSite(FIXTURE_SLUGS.nvllClick);
    await siteReader().findPublishedSite(FIXTURE_SLUGS.miriam);

    expect(creations).toBe(1);
  });
});

describe("senza configurazione pubblica resta il lettore neutro", () => {
  // `npm run check` esegue `next build` in una CI priva di segreti, e la sitemap viene
  // prerenderizzata: se la registrazione non degradasse, il build fallirebbe per assenza
  // di variabili d'ambiente invece che per un difetto del codice.
  it("un client che non si può costruire produce un esito dichiarato, non un'eccezione", () => {
    const outcome = registerSiteReader(() => {
      throw new Error(
        "Configurazione Supabase pubblica mancante o non valida: servono NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    });

    expect(outcome.registered).toBe(false);
    if (outcome.registered) return;
    expect(outcome.reason).toBe("public-reader-client-unavailable");
    expect(outcome.detail).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("dopo un fallimento nessun lettore è configurato e ogni slug dà `null`", async () => {
    registerSiteReader(() => {
      throw new Error("niente ambiente");
    });

    expect(isSiteReaderConfigured()).toBe(false);
    expect(siteReader()).toBe(unconfiguredSiteReader);
    expect(await siteReader().findPublishedSite(FIXTURE_SLUGS.nvllClick)).toBeNull();
  });

  it("un fallimento che non è un Error conserva comunque una diagnosi leggibile", () => {
    const outcome = registerSiteReader(() => {
      throw "stringa nuda";
    });

    expect(outcome.registered).toBe(false);
    if (outcome.registered) return;
    expect(outcome.detail).toBe("stringa nuda");
  });
});

// ---------------------------------------------------------------- invariante del bordo

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    if (entry.isDirectory()) return sourceFiles(relativePath);
    if (!/\.tsx?$/u.test(entry.name)) return [];
    return /\.(test|spec)\.tsx?$/u.test(entry.name) ? [] : [relativePath];
  });
}

function rootFiles(): string[] {
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
    .map((entry) => entry.name);
}

function productionSources(): readonly string[] {
  return [...["app", "lib", "components"].flatMap((dir) => sourceFiles(dir)), ...rootFiles()];
}

function callersOf(symbol: string, exclude: readonly string[]): readonly string[] {
  const pattern = new RegExp(`\\b${symbol}\\s*\\(`, "u");
  return productionSources().filter(
    (file) =>
      !exclude.includes(file) && pattern.test(readFileSync(join(repoRoot, file), "utf8")),
  );
}

describe("un solo punto chiama configureSiteReader", () => {
  it("la scansione vede davvero i file, altrimenti non prova nulla", () => {
    const files = productionSources();
    expect(files).toContain(join("app", "[slug]", "composition.ts"));
    expect(files).toContain(join("lib", "site-reader", "registration.ts"));
    expect(files).toContain("instrumentation.ts");
    expect(files.some((file) => /\.test\.tsx?$/u.test(file))).toBe(false);
  });

  it("l'unico chiamante è lib/site-reader/registration.ts", () => {
    // `composition.ts` è escluso perché la funzione la *dichiara*, non la chiama.
    const callers = callersOf("configureSiteReader", [join("app", "[slug]", "composition.ts")]);
    expect(callers).toEqual([join("lib", "site-reader", "registration.ts")]);
  });

  it("l'unico chiamante di registerSiteReader è instrumentation.ts", () => {
    const callers = callersOf("registerSiteReader", [join("lib", "site-reader", "registration.ts")]);
    expect(callers).toEqual(["instrumentation.ts"]);
  });

  it("instrumentation.ts sta alla radice, fuori dal perimetro presidiato", () => {
    const source = readFileSync(join(repoRoot, "instrumentation.ts"), "utf8");
    expect(relative(repoRoot, join(repoRoot, "instrumentation.ts")).startsWith("app")).toBe(false);
    expect(source).toContain("export async function register()");
    // La guardia sul runtime precede l'import del client: `server-only` non ha senso su edge.
    expect(source).toContain('process.env.NEXT_RUNTIME !== "nodejs"');
  });
});

describe("la registrazione sopravvive a una seconda istanza del modulo", () => {
  /**
   * Riproduce in vitest ciò che è stato misurato su Next 16.3.1 con Turbopack:
   * `instrumentation.ts` e le route dell'app router caricano due istanze distinte di
   * `app/[slug]/composition.ts` **nello stesso processo**. Con lo stato in una variabile di
   * modulo, la registrazione fatta dall'instrumentation era invisibile alle route e ogni
   * slug rispondeva 404 pur essendo l'adattatore registrato.
   *
   * `vi.resetModules()` più un import dinamico dà esattamente due istanze nello stesso
   * realm. Se lo stato tornasse a essere una variabile di modulo, questo test diventa rosso.
   */
  it("un'istanza registra, un'altra istanza legge lo stesso lettore", async () => {
    registerSiteReader(() => clientReturning([SITE_ROW]));

    vi.resetModules();
    const seconda = await import("../../app/[slug]/composition");

    expect(seconda.isSiteReaderConfigured()).toBe(true);
    expect((await seconda.siteReader().findPublishedSite(FIXTURE_SLUGS.nvllClick))?.id).toBe(
      FIXTURE_IDS.nvllClick,
    );
    seconda.resetSiteReader();
    expect(isSiteReaderConfigured()).toBe(false);
  });
});

describe("instrumentation non registra nulla fuori dal runtime node", () => {
  it("in un runtime che non è nodejs esce prima di toccare il client", async () => {
    // In vitest `NEXT_RUNTIME` non è definito: è esattamente il caso in cui la guardia deve
    // fermare tutto. Se non lo facesse, l'import di `lib/supabase/public-reader` fallirebbe
    // qui, perché `server-only` esiste solo dentro il build di Next.
    const { register } = await import("../../instrumentation");
    await expect(register()).resolves.toBeUndefined();
    expect(isSiteReaderConfigured()).toBe(false);
  });
});
