import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * L0.7 §6.9: `service_role` non appare mai nel client, nei log o nel
 * repository.
 *
 * Qui si dimostra la parte statica: nessun Client Component raggiunge il
 * modulo `service-role`, ne' direttamente ne' attraverso una catena di
 * import. La parte dinamica la dimostra il build: `import "server-only"` fa
 * fallire `next build` se il modulo entra nel grafo client.
 */

const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib"];
const SERVER_ONLY_MODULES = [
  "lib/supabase/server.ts",
  "lib/supabase/service-role.ts",
  "lib/supabase/public-reader.ts",
  "app/api/stripe/_lib/stripe.ts",
  "app/api/stripe/_lib/apply.ts",
  "app/api/stripe/_lib/customer.ts",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/u.test(full)) acc.push(full);
  }
  return acc;
}

const FILES = ROOTS.flatMap((dir) => walk(join(ROOT, dir)));

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu;
  let match = pattern.exec(source);
  while (match !== null) {
    if (match[1] !== undefined) specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(fromFile, "..", specifier);
  else return null; // pacchetto npm: fuori dal grafo del repository

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // percorso inesistente: si prova il candidato successivo
    }
  }
  return null;
}

const SOURCES = new Map(FILES.map((file) => [file, readFileSync(file, "utf8")]));

function isClientEntry(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/u.test(source);
}

/** Chiusura transitiva dei moduli raggiungibili dai Client Component. */
function clientReachable(): Set<string> {
  const queue = FILES.filter((file) => isClientEntry(SOURCES.get(file) ?? ""));
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const specifier of importsOf(SOURCES.get(current) ?? "")) {
      const target = resolveSpecifier(current, specifier);
      if (target !== null && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

describe("isolamento del client service_role", () => {
  it("i moduli server dichiarano `import \"server-only\"` come prima istruzione", () => {
    for (const modulePath of SERVER_ONLY_MODULES) {
      const source = readFileSync(join(ROOT, modulePath), "utf8");
      const firstStatement = source
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line !== "" && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"));
      expect(firstStatement, modulePath).toBe('import "server-only";');
    }
  });

  it("nessun Client Component raggiunge il modulo service-role", () => {
    const reachable = clientReachable();
    const forbidden = resolve(ROOT, "lib/supabase/service-role.ts");
    const offenders = [...reachable]
      .filter((file) => file === forbidden)
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("il nome della variabile service_role non compare in nessun modulo client", () => {
    const reachable = clientReachable();
    const offenders = [...reachable]
      .filter((file) => (SOURCES.get(file) ?? "").includes("SUPABASE_SERVICE_ROLE_KEY"))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("la chiave service_role non ha prefisso pubblico e non e' inlinabile", () => {
    const source = readFileSync(join(ROOT, "lib/supabase/service-role.ts"), "utf8");
    expect(source).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/u);
  });

  it("almeno un Client Component esiste davvero, altrimenti il test non prova nulla", () => {
    const entries = FILES.filter((file) => isClientEntry(SOURCES.get(file) ?? ""));
    expect(entries.length).toBeGreaterThan(0);
  });
});
