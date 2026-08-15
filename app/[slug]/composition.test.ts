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
 * Specificatori di modulo, in tutte le posizioni sintattiche in cui possono comparire.
 *
 * Cercare la parola `from` non basta e dà l'illusione della copertura: `import "x"`,
 * `import("x")` e `require("x")` raggiungono il modulo senza scriverla mai. Il presidio
 * estrae lo specificatore e poi lo giudica, invece di riconoscere una sola forma di import.
 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bimport\s+[^;'"()]*?\bfrom\s*["']([^"']+)["']/g, // import … from "x", import type … from "x"
  /\bexport\s+[^;'"()]*?\bfrom\s*["']([^"']+)["']/g, // export … from "x", export * from "x"
  /\bimport\s*["']([^"']+)["']/g, // import "x" — solo effetto collaterale
  /\bimport\s*\(\s*["']([^"']+)["']/g, // import("x") — dinamico
  /\brequire\s*\(\s*["']([^"']+)["']/g, // require("x")
];

export function moduleSpecifiers(source: string): readonly string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

/** `lib/supabase/**` con qualunque prefisso di percorso o alias, e ogni pacchetto `@supabase/*`. */
const FORBIDDEN_MODULE = /(?:^|\/)lib\/supabase(?:\/|$)|^@supabase(?:\/|$)/;

function forbiddenImports(source: string): readonly string[] {
  return moduleSpecifiers(source).filter((specifier) => FORBIDDEN_MODULE.test(specifier));
}

/**
 * Il presidio deve reggere anche alle forme che non nominano `from`.
 * Se questo test diventa rosso, il presidio architetturale sotto sta guardando meno di
 * quanto dichiara: va aggiustato l'estrattore, non l'aspettativa.
 */
describe("il presidio riconosce ogni forma che raggiunge un modulo", () => {
  it.each([
    { forma: "import con from", codice: 'import { createClient } from "../../lib/supabase/server";' },
    { forma: "import di tipo", codice: 'import type { Db } from "../../lib/supabase/types";' },
    { forma: "import per effetto collaterale", codice: 'import "../../lib/supabase/server";' },
    { forma: "import dinamico", codice: 'const c = await import("../../lib/supabase/server");' },
    { forma: "import dinamico su più righe", codice: 'await import(\n  "../../lib/supabase/server"\n);' },
    { forma: "require", codice: 'const c = require("../../lib/supabase/server");' },
    { forma: "ri-esportazione", codice: 'export { createClient } from "../../lib/supabase/server";' },
    { forma: "ri-esportazione totale", codice: 'export * from "../../lib/supabase/server";' },
    { forma: "pacchetto npm", codice: 'import { createBrowserClient } from "@supabase/ssr";' },
    { forma: "alias di percorso", codice: 'import { c } from "@/lib/supabase/server";' },
  ])("intercetta la $forma", ({ codice }) => {
    expect(forbiddenImports(codice)).toHaveLength(1);
  });

  it("non scambia per violazione un import legittimo o una stringa qualunque", () => {
    const codice = [
      'import { cache } from "react";',
      'import { resolveSite } from "./read-model";',
      'import type { SiteReader } from "./site-reader";',
      'const nome = "lib/supabase/server";',
      "// nel testo di un commento si può nominare lib/supabase senza importarlo",
    ].join("\n");
    expect(forbiddenImports(codice)).toEqual([]);
  });

  // Scelta deliberata: il presidio non interpreta i commenti, quindi un import commentato
  // viene segnalato. Un falso positivo costa la riscrittura di un commento; un falso
  // negativo costerebbe l'invariante. Meglio chiuso che aperto.
  it("segnala anche un import commentato, perché non prova a interpretare i commenti", () => {
    expect(forbiddenImports('// import { c } from "@supabase/ssr";')).toHaveLength(1);
  });

  it("estrae lo specificatore da tutte e cinque le posizioni sintattiche", () => {
    const codice = [
      'import a from "uno";',
      'import "due";',
      'const c = await import("tre");',
      'const d = require("quattro");',
      'export * from "cinque";',
    ].join("\n");
    expect([...moduleSpecifiers(codice)].sort()).toEqual([
      "cinque",
      "due",
      "quattro",
      "tre",
      "uno",
    ]);
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

  /** Sorgente di prodotto: i file di test contengono per forza i casi da riconoscere. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      if (!/\.tsx?$/.test(entry.name)) return [];
      return /\.(test|spec)\.tsx?$/.test(entry.name) ? [] : [relative];
    });
  }

  it("scandisce ogni file di prodotto della cartella", () => {
    // Se il filtro smettesse di trovare i file, il presidio passerebbe a vuoto.
    const files = sourceFiles(surfaceRoot);
    expect(files.length).toBeGreaterThanOrEqual(18);
    expect(files).toContain(join("app", "[slug]", "read-model.ts"));
    expect(files).toContain(join("app", "[slug]", "listen", "page.tsx"));
    expect(files.some((file) => /\.test\.tsx?$/.test(file))).toBe(false);
  });

  it("non raggiunge lib/supabase né @supabase/* in nessuna forma", () => {
    const offenders = sourceFiles(surfaceRoot).flatMap((file) =>
      forbiddenImports(readFileSync(join(repoRoot, file), "utf8")).map(
        (specifier) => `${file} → ${specifier}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("sitemap e robots passano dal bordo di composizione, non da un client", () => {
    for (const route of ["sitemap.ts", "robots.ts"]) {
      const source = readFileSync(join(repoRoot, "app", route), "utf8");
      expect(forbiddenImports(source), route).toEqual([]);
    }
  });
});
