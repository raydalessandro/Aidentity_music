// Banco di prova del renderer. Non è codice di prodotto: nessuna route lo importa.
//
// Due delle configurazioni non sono scritte a mano ma **lette dagli artefatti reali**:
// - la config di NVLL CLICK arriva da `supabase/seed.sql`;
// - la config di bozza arriva dal trigger `private.create_site_dependents` della migrazione.
// Così il banco non può divergere in silenzio dalla fixture che gira in CI sul database.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EpkRecords,
  FeedRecords,
  ListenRecords,
  MerchRecords,
  PublicSiteRow,
  PublicTrackRow,
  PublishedSiteIndexRow,
  SiteReader,
} from "./site-reader";
import { EMPTY_EPK, EMPTY_FEED, EMPTY_MERCH } from "./site-reader";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function readSeed(): string {
  return readFileSync(join(repoRoot, "supabase", "seed.sql"), "utf8");
}

function readMigrations(): string {
  const dir = join(repoRoot, "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

/** Config pubblicata della fixture NVLL CLICK, presa da `supabase/seed.sql`. */
export function seedPublishedConfig(): unknown {
  const match = /set config = '(\{[\s\S]*?\})'::jsonb/.exec(readSeed());
  if (match?.[1] === undefined) {
    throw new Error("config della fixture NVLL CLICK non trovata in supabase/seed.sql");
  }
  return JSON.parse(match[1]);
}

/** Config di bozza creata dal trigger sui nuovi siti: identità tutta nulla. */
export function bootstrapDraftConfig(): unknown {
  const match = /insert into public\.site_config\(site_id,config\) values\(new\.id,'(\{[\s\S]*?\})'::jsonb\)/.exec(
    readMigrations(),
  );
  if (match?.[1] === undefined) {
    throw new Error("config di bootstrap non trovata nella migrazione PR-0");
  }
  return JSON.parse(match[1]);
}

type ConfigObject = Record<string, unknown>;

function asObject(value: unknown): ConfigObject {
  if (typeof value !== "object" || value === null) throw new Error("config non è un oggetto");
  return { ...(value as ConfigObject) };
}

/** Seconda identità: stesso layout, tutto il resto diverso. Serve a provare la parametricità. */
export function secondIdentityConfig(): unknown {
  const config = asObject(seedPublishedConfig());
  return {
    ...config,
    identity: {
      name: "MIRIAM SERRA",
      handle: "miriam-serra",
      claim: "CANZONI LENTE, LUCI APERTE",
      shortBio: "Autrice e performer.",
      longBio: "Seconda configurazione del medesimo layout.",
      location: "Bologna",
      locale: "it-IT",
    },
    theme: {
      ink: "#241A2A",
      panel: "#FFF7F2",
      paper: "#F2D9CE",
      muted: "#5D4758",
      dim: "#715768",
      line: "#9A7789",
      acid: "#8C173D",
    },
    fontPair: "serif-sans",
    iconFamily: "block",
    grain: true,
    surfaces: [
      { id: "feed", enabled: true },
      { id: "listen", enabled: true },
      { id: "epk", enabled: true },
      { id: "merch", enabled: false },
      { id: "home", enabled: true },
    ],
    sectionCopy: { version: 1, listen: "ASCOLTI" },
  };
}

// ------------------------------------------------------------------ righe di prova

export const SEED_SITE_ID = "22222222-2222-2222-2222-222222222222";
export const DRAFT_SITE_ID = "55555555-5555-5555-5555-555555555555";
export const REVIEW_SITE_ID = "88888888-8888-8888-8888-888888888888";

export type FixtureSite = {
  readonly row: PublicSiteRow;
  readonly publicationStatus: "draft" | "pending_review" | "published" | "suspended";
  readonly tracks: readonly PublicTrackRow[];
};

export function fixtureSites(): readonly FixtureSite[] {
  return [
    {
      publicationStatus: "published",
      row: {
        id: SEED_SITE_ID,
        slug: "nvll-click",
        config: seedPublishedConfig(),
        hero_asset_id: "33333333-3333-3333-3333-333333333333",
      },
      tracks: [
        {
          id: "aaaa0001-0000-0000-0000-000000000000",
          site_id: SEED_SITE_ID,
          title: "Traccia caricata",
          source: "upload",
          duration_seconds: 185,
          embed_provider: null,
          embed_url: null,
          sort_order: 0,
        },
        {
          id: "aaaa0002-0000-0000-0000-000000000000",
          site_id: SEED_SITE_ID,
          title: "Traccia incorporata",
          source: "embed",
          duration_seconds: null,
          embed_provider: "spotify",
          embed_url: "https://open.spotify.com/track/1",
          sort_order: 1,
        },
      ],
    },
    {
      publicationStatus: "published",
      row: {
        id: "99999999-9999-9999-9999-999999999999",
        slug: "miriam-serra",
        config: secondIdentityConfig(),
        hero_asset_id: null,
      },
      tracks: [],
    },
    {
      // Sito in bozza con la config di bootstrap: due motivi indipendenti per non renderlo.
      publicationStatus: "draft",
      row: {
        id: DRAFT_SITE_ID,
        slug: "owner-b-draft",
        config: bootstrapDraftConfig(),
        hero_asset_id: null,
      },
      tracks: [],
    },
    {
      publicationStatus: "pending_review",
      row: {
        id: REVIEW_SITE_ID,
        slug: "owner-c-review",
        config: bootstrapDraftConfig(),
        hero_asset_id: null,
      },
      tracks: [],
    },
    {
      // Sito pubblicato ma con config incompleta: deve essere rifiutato dal read model,
      // non dal filtro di pubblicazione.
      publicationStatus: "published",
      row: {
        id: "abcd0000-0000-0000-0000-000000000000",
        slug: "config-rotta",
        config: bootstrapDraftConfig(),
        hero_asset_id: null,
      },
      tracks: [],
    },
  ];
}

/**
 * Lettore di prova: imita ciò che fanno le viste `public_sites` e `public_tracks`,
 * cioè filtrare per `publication_status = 'published'`. Conta le chiamate, così un test
 * può dimostrare che uno slug riservato non interroga mai il database.
 */
export class StubSiteReader implements SiteReader {
  readonly calls: string[] = [];
  private readonly sites: readonly FixtureSite[];

  constructor(sites: readonly FixtureSite[] = fixtureSites()) {
    this.sites = sites;
  }

  private published(): readonly FixtureSite[] {
    return this.sites.filter((site) => site.publicationStatus === "published");
  }

  async findPublishedSite(slug: string): Promise<PublicSiteRow | null> {
    this.calls.push(`findPublishedSite:${slug}`);
    return this.published().find((site) => site.row.slug === slug)?.row ?? null;
  }

  async listPublishedSites(): Promise<readonly PublishedSiteIndexRow[]> {
    this.calls.push("listPublishedSites");
    return this.published().map(({ row }) => ({ id: row.id, slug: row.slug, config: row.config }));
  }

  async loadListen(siteId: string): Promise<ListenRecords> {
    this.calls.push(`loadListen:${siteId}`);
    return { tracks: this.published().find((site) => site.row.id === siteId)?.tracks ?? [] };
  }

  async loadFeed(): Promise<FeedRecords> {
    return EMPTY_FEED;
  }

  async loadEpk(): Promise<EpkRecords> {
    return EMPTY_EPK;
  }

  async loadMerch(): Promise<MerchRecords> {
    return EMPTY_MERCH;
  }
}
