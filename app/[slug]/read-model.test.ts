import { describe, expect, it } from "vitest";

import { isAllowedEmbed } from "./embed";
import {
  StubSiteReader,
  bootstrapDraftConfig,
  seedPublishedConfig,
  secondIdentityConfig,
} from "./fixtures";
import {
  buildListenView,
  buildSurfaces,
  contrastRatio,
  isSurfaceReachable,
  parseSiteConfig,
  resolvePalette,
  resolveSite,
  surfaceHref,
} from "./read-model";
import type { PublicTrackRow } from "./site-reader";

function configOf(value: unknown) {
  const parsed = parseSiteConfig(value);
  if (!parsed.ok) throw new Error(`config non valida: ${parsed.issues.join(" | ")}`);
  return parsed.config;
}

describe("validazione della configurazione", () => {
  it("accetta la fixture NVLL CLICK letta da supabase/seed.sql", () => {
    const parsed = parseSiteConfig(seedPublishedConfig());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config.identity.name).toBe("NVLL CLICK");
    expect(parsed.config.identity.locale).toBe("it-IT");
    expect(parsed.config.surfaces).toHaveLength(5);
  });

  // Caso che DEVE essere rifiutato: la config di bozza creata dal trigger sui nuovi siti.
  it("rifiuta la config di bootstrap elencando ogni campo identità mancante", () => {
    const parsed = parseSiteConfig(bootstrapDraftConfig());
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect([...parsed.issues].sort()).toEqual(
      [
        "identity.claim: Campo obbligatorio per la pubblicazione.",
        "identity.handle: Campo obbligatorio per la pubblicazione.",
        "identity.location: Campo obbligatorio per la pubblicazione.",
        "identity.longBio: Campo obbligatorio per la pubblicazione.",
        "identity.name: Campo obbligatorio per la pubblicazione.",
        "identity.shortBio: Campo obbligatorio per la pubblicazione.",
      ].sort(),
    );
  });

  it("rifiuta una config con EPK spento", () => {
    const config = { ...(seedPublishedConfig() as Record<string, unknown>) };
    config.surfaces = [
      { id: "feed", enabled: true },
      { id: "listen", enabled: true },
      { id: "epk", enabled: false },
      { id: "merch", enabled: true },
      { id: "home", enabled: true },
    ];
    const parsed = parseSiteConfig(config);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues).toContain("EPK e HOME devono restare abilitate.");
  });

  it("rifiuta una chiave sconosciuta nella config", () => {
    const config = { ...(seedPublishedConfig() as Record<string, unknown>), layout: "custom" };
    expect(parseSiteConfig(config).ok).toBe(false);
  });

  it("rifiuta un valore che non è nemmeno un oggetto", () => {
    expect(parseSiteConfig(null).ok).toBe(false);
    expect(parseSiteConfig("{}").ok).toBe(false);
  });
});

describe("risoluzione dello slug verso il sito", () => {
  it("risolve il sito pubblicato della fixture", async () => {
    const reader = new StubSiteReader();
    const resolution = await resolveSite("nvll-click", reader);
    expect(resolution.status).toBe("ok");
    if (resolution.status !== "ok") return;
    expect(resolution.site.slug).toBe("nvll-click");
    expect(resolution.site.config.identity.name).toBe("NVLL CLICK");
    expect(resolution.site.heroAssetId).toBe("33333333-3333-3333-3333-333333333333");
  });

  // Caso che DEVE essere rifiutato: uno slug riservato non deve nemmeno interrogare il lettore.
  it("rifiuta uno slug riservato con `reserved-slug` senza interrogare il lettore", async () => {
    const reader = new StubSiteReader();
    expect(await resolveSite("epk", reader)).toEqual({ status: "reserved-slug", slug: "epk" });
    expect(await resolveSite("one-sheet", reader)).toEqual({
      status: "reserved-slug",
      slug: "one-sheet",
    });
    expect(reader.calls).toEqual([]);
  });

  it("rifiuta uno slug malformato con `malformed-slug` senza interrogare il lettore", async () => {
    const reader = new StubSiteReader();
    expect(await resolveSite("NVLL-Click", reader)).toEqual({
      status: "malformed-slug",
      slug: "NVLL-Click",
    });
    expect(reader.calls).toEqual([]);
  });

  // Caso che DEVE essere rifiutato: un sito draft ad anon è "non disponibile".
  it("rifiuta un sito in bozza con `not-published`", async () => {
    const reader = new StubSiteReader();
    expect(await resolveSite("owner-b-draft", reader)).toEqual({
      status: "not-published",
      slug: "owner-b-draft",
    });
    expect(reader.calls).toEqual(["findPublishedSite:owner-b-draft"]);
  });

  it("rifiuta un sito in revisione con `not-published`", async () => {
    expect(await resolveSite("owner-c-review", new StubSiteReader())).toEqual({
      status: "not-published",
      slug: "owner-c-review",
    });
  });

  it("rifiuta uno slug inesistente con `not-published`", async () => {
    expect(await resolveSite("non-esiste", new StubSiteReader())).toEqual({
      status: "not-published",
      slug: "non-esiste",
    });
  });

  // Caso che DEVE essere rifiutato: pubblicato ma con config incompleta.
  it("rifiuta un sito pubblicato con config incompleta con `config-invalid`", async () => {
    const resolution = await resolveSite("config-rotta", new StubSiteReader());
    expect(resolution.status).toBe("config-invalid");
    if (resolution.status !== "config-invalid") return;
    expect(resolution.issues).toContain("identity.name: Campo obbligatorio per la pubblicazione.");
  });
});

describe("superfici", () => {
  it("costruisce cinque superfici nell'ordine canonico con gli href di route", () => {
    const surfaces = buildSurfaces(configOf(seedPublishedConfig()), "nvll-click");
    expect(surfaces.map((surface) => surface.id)).toEqual([
      "feed",
      "listen",
      "epk",
      "merch",
      "home",
    ]);
    expect(surfaces.map((surface) => surface.href)).toEqual([
      "/nvll-click/feed",
      "/nvll-click/listen",
      "/nvll-click/epk",
      "/nvll-click/merch",
      "/nvll-click",
    ]);
    expect(surfaces.every((surface) => surface.enabled)).toBe(true);
  });

  it("usa l'etichetta di sectionCopy quando c'è e quella canonica quando manca", () => {
    const surfaces = buildSurfaces(configOf(secondIdentityConfig()), "miriam-serra");
    expect(surfaces.find((surface) => surface.id === "listen")?.label).toBe("ASCOLTI");
    expect(surfaces.find((surface) => surface.id === "feed")?.label).toBe("FEED");
  });

  // Caso che DEVE essere rifiutato: una superficie spenta non è raggiungibile.
  it("dichiara non raggiungibile una superficie spenta", () => {
    const config = configOf(secondIdentityConfig());
    expect(isSurfaceReachable(config, "merch")).toBe(false);
    expect(buildSurfaces(config, "miriam-serra").find((s) => s.id === "merch")?.enabled).toBe(false);
  });

  it("dichiara sempre raggiungibili HOME ed EPK", () => {
    const config = configOf(secondIdentityConfig());
    expect(isSurfaceReachable(config, "home")).toBe(true);
    expect(isSurfaceReachable(config, "epk")).toBe(true);
  });

  it("HOME non ha suffisso di superficie", () => {
    expect(surfaceHref("nvll-click", "home")).toBe("/nvll-click");
    expect(surfaceHref("nvll-click", "epk")).toBe("/nvll-click/epk");
  });
});

describe("palette derivata dalla config", () => {
  it("rende i sette token della config, non quelli del preset", () => {
    const palette = resolvePalette(configOf(seedPublishedConfig()).theme);
    expect(palette.acid).toBe("#ccff00");
    expect(palette.paper).toBe("#f5f2ea");
    expect(palette.ink).toBe("#111111");
  });

  it("riconosce un tema che coincide con un preset del filone A", () => {
    const palette = resolvePalette(configOf(secondIdentityConfig()).theme);
    expect(palette.id).toBe("petal");
    expect(palette.label).toBe("Petal");
    expect(palette.acidInk).toBe("#FFFFFF");
  });

  it("marca come personalizzato un tema che non coincide con nessun preset", () => {
    expect(resolvePalette(configOf(seedPublishedConfig()).theme).label).toBe("Personalizzata");
  });

  it("sceglie sopra l'acid il testo che legge meglio, sopra 4.5:1", () => {
    for (const source of [seedPublishedConfig(), secondIdentityConfig()]) {
      const palette = resolvePalette(configOf(source).theme);
      expect(contrastRatio(palette.acidInk, palette.acid)).toBeGreaterThanOrEqual(4.5);
    }
    expect(resolvePalette(configOf(seedPublishedConfig()).theme).acidInk).toBe("#000000");
  });
});

describe("catalogo LISTEN", () => {
  const base: PublicTrackRow = {
    id: "t1",
    site_id: "s1",
    title: "Brano",
    source: "embed",
    duration_seconds: null,
    embed_provider: "spotify",
    embed_url: "https://open.spotify.com/track/1",
    sort_order: 0,
  };

  it("ordina per sort_order e conserva upload ed embed nella stessa lista", () => {
    const view = buildListenView(
      [
        { ...base, id: "b", sort_order: 2 },
        {
          ...base,
          id: "a",
          sort_order: 1,
          source: "upload",
          embed_provider: null,
          embed_url: null,
          audio_url: "https://cdn.example/a.mp3",
          duration_seconds: 185,
        },
      ],
      isAllowedEmbed,
    );
    expect(view.tracks.map((track) => track.id)).toEqual(["a", "b"]);
    expect(view.tracks[0]?.kind).toBe("upload");
    expect(view.tracks[1]?.kind).toBe("embed");
    expect(view.rejected).toEqual([]);
  });

  // Caso che DEVE essere rifiutato: oggi `public_tracks` non espone alcuna sorgente audio.
  it("scarta un upload senza sorgente con `upload-source-missing`", () => {
    const view = buildListenView(
      [{ ...base, source: "upload", embed_provider: null, embed_url: null }],
      isAllowedEmbed,
    );
    expect(view.tracks).toEqual([]);
    expect(view.rejected).toEqual([
      { id: "t1", title: "Brano", reason: "upload-source-missing" },
    ]);
  });

  it("scarta un embed senza provider o senza URL con `embed-incomplete`", () => {
    expect(
      buildListenView([{ ...base, embed_url: null }], isAllowedEmbed).rejected[0]?.reason,
    ).toBe("embed-incomplete");
    expect(
      buildListenView([{ ...base, embed_provider: null }], isAllowedEmbed).rejected[0]?.reason,
    ).toBe("embed-incomplete");
  });

  it("scarta un embed fuori allowlist con `embed-host-not-allowed`", () => {
    const view = buildListenView(
      [{ ...base, embed_url: "https://open.spotify.com.evil.test/track/1" }],
      isAllowedEmbed,
    );
    expect(view.tracks).toEqual([]);
    expect(view.rejected[0]?.reason).toBe("embed-host-not-allowed");
  });
});
