// Parità fra gli schemi del bordo e le viste che li alimentano.
//
// I contratti Zod dichiarano quali colonne l'adattatore chiede; le migrazioni dichiarano
// quali colonne esistono. Sono due copie della stessa verità e possono divergere in
// silenzio: qui la divergenza diventa rossa. Stesso spirito di `slug.parity.test.ts` e
// `embed.parity.test.ts`, che presidiano le altre due copie del repo.
//
// Nota su cosa NON prova: che il database risponda. Queste sono le migrazioni lette come
// testo, non uno schema applicato. La lettura vera contro Postgres non è eseguibile qui
// (il job `e2e` della CI non avvia Supabase); il presidio contro la deriva dello schema
// resta `supabase db diff` nel job `db`.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  publicContactContract,
  publicDateContract,
  publicLinkContract,
  publicMetricContract,
  publicPostContract,
  publicPressContract,
  publicSiteContract,
  publicTrackContract,
  publishedSiteIndexContract,
} from "./rows";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function migrations(): string {
  const dir = join(repoRoot, "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

/** Divide una select list rispettando le parentesi: `greatest(a, b) as x` è un elemento solo. */
function splitSelectList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of list) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim() !== "") items.push(current);
  return items;
}

/** Nome pubblico di una colonna proiettata: l'alias se c'è, altrimenti il nome dopo il punto. */
function columnName(item: string): string {
  const trimmed = item.trim().replace(/\s+/gu, " ");
  const aliased = /\bas\s+([a-z_][a-z0-9_]*)$/iu.exec(trimmed);
  if (aliased?.[1] !== undefined) return aliased[1];
  const parts = trimmed.split(".");
  return (parts[parts.length - 1] ?? trimmed).trim();
}

function projectedColumns(): ReadonlyMap<string, readonly string[]> {
  const pattern =
    /create\s+view\s+public\.(\w+)\s+with\s*\([^)]*\)\s*as\s*select\s+([\s\S]*?)\s+from\s/giu;
  const found = new Map<string, readonly string[]>();
  for (const match of migrations().matchAll(pattern)) {
    const [, name, list] = match;
    if (name === undefined || list === undefined) continue;
    found.set(name, splitSelectList(list).map(columnName));
  }
  return found;
}

const VIEWS = projectedColumns();

describe("il lettore delle migrazioni funziona davvero", () => {
  it("trova tutte e dieci le proiezioni pubbliche", () => {
    expect([...VIEWS.keys()].sort()).toEqual([
      "public_assets",
      "public_contacts",
      "public_dates",
      "public_links",
      "public_metrics",
      "public_posts",
      "public_press",
      "public_site_meta",
      "public_sites",
      "public_tracks",
    ]);
  });

  it("risolve gli alias invece di prendere il nome della colonna sorgente", () => {
    // `va.id as visual_asset_id`: senza alias risolto la colonna si chiamerebbe `id`.
    expect(VIEWS.get("public_posts")).toContain("visual_asset_id");
    expect(VIEWS.get("public_posts")).toContain("cover_asset_id");
    expect(VIEWS.get("public_site_meta")).toContain("updated_at");
  });
});

describe("ogni colonna chiesta dal bordo esiste nella vista", () => {
  it.each([
    { nome: "public_sites", contratto: publicSiteContract },
    { nome: "public_sites (indice sitemap)", contratto: publishedSiteIndexContract },
    { nome: "public_tracks", contratto: publicTrackContract },
    { nome: "public_posts", contratto: publicPostContract },
    { nome: "public_links", contratto: publicLinkContract },
    { nome: "public_press", contratto: publicPressContract },
    { nome: "public_dates", contratto: publicDateContract },
    { nome: "public_metrics", contratto: publicMetricContract },
    { nome: "public_contacts", contratto: publicContactContract },
  ])("$nome", ({ contratto }) => {
    const columns = VIEWS.get(contratto.relation);
    expect(columns, contratto.relation).toBeDefined();
    expect(contratto.columns.filter((column) => !(columns ?? []).includes(column))).toEqual([]);
  });
});

describe("ciò che il bordo non chiede, perché la vista non ce l'ha", () => {
  // Quando la PR che firma gli URL dei media aggiungerà la sorgente pubblica a
  // `public_assets`, questo test diventerà rosso: è il promemoria che FEED, MERCH e kit
  // foto possono finalmente smettere di essere vuoti. Fino ad allora documenta il perché.
  it("public_assets non espone nessun URL pubblico né un testo alternativo", () => {
    const columns = [...(VIEWS.get("public_assets") ?? [])];
    expect(columns.sort()).toEqual(["id", "kind", "site_id", "sort_order"]);
    expect(columns).not.toContain("public_url");
    expect(columns).not.toContain("alt");
    expect(columns).not.toContain("storage_path");
  });

  it("public_tracks non espone storage_path: l'upload resta senza sorgente riproducibile", () => {
    expect(VIEWS.get("public_tracks")).not.toContain("storage_path");
    expect(publicTrackContract.columns).not.toContain("audio_url");
  });

  it("public_contacts non espone il consenso: è un filtro di riga, non una colonna", () => {
    const columns = [...(VIEWS.get("public_contacts") ?? [])];
    expect(columns).not.toContain("consent_confirmed_at");
    expect(columns).not.toContain("consent_confirmed_by");
    expect(columns.sort()).toEqual(["email", "id", "name", "role", "site_id", "sort_order"]);
  });
});
