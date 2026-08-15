import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RESERVED_SLUGS, SLUG_PATTERN, classifySlug } from "./slug";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function migrationSql(): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(files.length, "nessuna migrazione trovata").toBeGreaterThan(0);
  return files.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");
}

/**
 * Estrae il CHECK della colonna `slug` di public.sites.
 *
 * Le migrazioni sono concatenate in ordine, quindi una definizione successiva
 * vincerebbe sul database mentre l'estrattore continuerebbe a leggere la prima:
 * la parità passerebbe a vuoto. Perciò la fonte deve essere **una sola**, e ogni
 * `alter table` che tocchi lo slug rende rosso questo presidio invece di scavalcarlo.
 */
function slugCheck(): string {
  const sql = migrationSql();

  expect(
    sql.match(/create table public\.sites \(/g) ?? [],
    "public.sites deve essere definita una volta sola",
  ).toHaveLength(1);
  expect(
    sql.match(/slug not in \(/g) ?? [],
    "la lista degli slug riservati deve avere una sola fonte nelle migrazioni",
  ).toHaveLength(1);
  expect(
    sql.match(/alter table (?:only )?public\.sites[^;]*slug/g) ?? [],
    "un alter table sullo slug va riletto qui prima di essere accettato",
  ).toHaveLength(0);

  const table = /create table public\.sites \(([\s\S]*?)\n\);/.exec(sql);
  expect(table?.[1], "tabella public.sites non trovata nelle migrazioni").toBeTruthy();
  const column = /slug text not null unique check \(([\s\S]*?)\),\n/.exec(`${table?.[1] ?? ""}\n`);
  expect(column?.[1], "CHECK della colonna slug non trovato").toBeTruthy();
  return column?.[1] ?? "";
}

describe("parità fra la costante applicativa e il contratto database", () => {
  it("la lista degli slug riservati coincide con il CHECK della migrazione", () => {
    const list = /slug not in \(([^)]*)\)/.exec(slugCheck());
    expect(list?.[1], "clausola `slug not in (...)` non trovata").toBeTruthy();

    const fromDatabase = (list?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""))
      .filter((value) => value !== "");

    // Confronto insiemistico: l'ordine non è normativo, l'insieme sì.
    expect([...fromDatabase].sort()).toEqual([...RESERVED_SLUGS].sort());
    expect(fromDatabase).toHaveLength(10);
  });

  it("la forma dello slug coincide con la regex del CHECK", () => {
    const pattern = /slug ~ '(\^[^']*)'/.exec(slugCheck());
    expect(pattern?.[1], "regex dello slug non trovata nel CHECK").toBeTruthy();
    expect(SLUG_PATTERN.source).toBe(pattern?.[1]);
  });
});

describe("classificazione dello slug", () => {
  it("accetta uno slug normalizzato", () => {
    expect(classifySlug("nvll-click")).toEqual({ kind: "valid", slug: "nvll-click" });
  });

  // Casi che DEVONO essere rifiutati, con l'esito atteso dichiarato.
  it.each(RESERVED_SLUGS)("rifiuta lo slug riservato %s con verdetto `reserved`", (slug) => {
    expect(classifySlug(slug)).toEqual({ kind: "reserved", slug });
  });

  it.each([
    ["NVLL-Click", "maiuscole"],
    ["-nvll", "trattino iniziale"],
    ["nvll-", "trattino finale"],
    ["nvll--click", "trattino doppio"],
    ["nvll click", "spazio"],
    ["", "vuoto"],
    ["nvll_click", "underscore"],
    ["../etc", "traversal"],
  ])("rifiuta %s con verdetto `malformed` (%s)", (slug) => {
    expect(classifySlug(slug).kind).toBe("malformed");
  });
});
