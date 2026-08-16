// Il difetto che questo banco presidia non era teorico: la stessa regola era scritta due
// volte e le due copie non concordavano. Un'immagine caricata senza farne un post compariva
// nell'anteprima dell'owner e spariva una volta pubblicata.

import { describe, expect, it } from "vitest";

import { RIBBON_MAX_VISUALS, ribbonVisuals } from "./site-visuals";

type Asset = { readonly id: string; readonly kind: string };
type Post = {
  readonly kind: string;
  readonly visual_asset_id: string | null;
  readonly cover_asset_id?: string | null;
  readonly caption: string | null;
};

const src = (asset: Asset) => `/media/${asset.id}`;
const alt = (asset: Asset) => `alt ${asset.id}`;

describe("la ribbon mostra i visual che il sito pubblica davvero", () => {
  it("un visual senza post NON entra: è il caso che deve essere rifiutato", () => {
    const assets: Asset[] = [
      { id: "usato", kind: "visual" },
      { id: "orfano", kind: "visual" },
    ];
    const posts: Post[] = [{ kind: "visual", visual_asset_id: "usato", caption: "IN STUDIO" }];

    const visuals = ribbonVisuals(assets, posts, src, alt);

    expect(visuals.map((visual) => visual.id)).toEqual(["usato"]);
    // Se la riga sopra passasse perché la ribbon è vuota, il banco non proverebbe nulla.
    expect(visuals).toHaveLength(1);
  });

  it("la didascalia del post arriva all'immagine, e senza post-visual resta VISUAL", () => {
    const assets: Asset[] = [
      { id: "con-caption", kind: "visual" },
      { id: "cover", kind: "visual" },
    ];
    const posts: Post[] = [
      { kind: "visual", visual_asset_id: "con-caption", caption: "IN STUDIO" },
      { kind: "track", visual_asset_id: null, cover_asset_id: "cover", caption: "SINGOLO" },
    ];

    const visuals = ribbonVisuals(assets, posts, src, alt);

    expect(visuals.find((visual) => visual.id === "con-caption")?.caption).toBe("IN STUDIO");
    // La cover appartiene a una traccia: l'immagine è pubblicata, ma la didascalia della
    // traccia non è la didascalia di quel visual.
    expect(visuals.find((visual) => visual.id === "cover")?.caption).toBe("VISUAL");
  });

  it("un asset che non è un visual non entra nemmeno se un post lo referenzia", () => {
    const assets: Asset[] = [{ id: "stampa", kind: "photo_hi" }];
    const posts: Post[] = [{ kind: "visual", visual_asset_id: "stampa", caption: null }];

    expect(ribbonVisuals(assets, posts, src, alt)).toEqual([]);
  });

  it("si ferma al massimo dichiarato", () => {
    const assets: Asset[] = Array.from({ length: RIBBON_MAX_VISUALS + 3 }, (_, index) => ({
      id: `v${index}`,
      kind: "visual",
    }));
    const posts: Post[] = assets.map((asset) => ({
      kind: "visual",
      visual_asset_id: asset.id,
      caption: null,
    }));

    expect(ribbonVisuals(assets, posts, src, alt)).toHaveLength(RIBBON_MAX_VISUALS);
  });

  it("indirizzo e testo alternativo restano del chiamante", () => {
    // È l'unica cosa che distingue davvero anteprima e pubblicato: la prima passa dalla
    // route owner autenticata, il secondo dalla route media.
    const assets: Asset[] = [{ id: "a", kind: "visual" }];
    const posts: Post[] = [{ kind: "visual", visual_asset_id: "a", caption: null }];

    const visuals = ribbonVisuals(assets, posts, (asset) => `/owner/${asset.id}`, () => "bozza");

    expect(visuals[0]?.src).toBe("/owner/a");
    expect(visuals[0]?.alt).toBe("bozza");
  });
});

describe("le due pagine usano quella regola, e nessun'altra", () => {
  it("né il sito pubblicato né l'anteprima owner ricostruiscono la selezione a mano", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = fileURLToPath(new URL("../", import.meta.url));

    for (const file of [
      join("app", "[slug]", "page.tsx"),
      join("app", "app", "wizard", "preview", "[siteId]", "page.tsx"),
    ]) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      expect(source, `${file} deve usare la regola condivisa`).toContain("ribbonVisuals(");
      expect(
        source,
        `${file} ricostruisce la selezione a mano: è così che le due copie erano divergere`,
      ).not.toMatch(/\.filter\(\([a-z]+\) => [a-z]+\.kind === "visual"\)/u);
    }
  });
});
