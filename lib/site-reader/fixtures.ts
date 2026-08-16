import type { PublicRowSource, RowQuery } from "./row-source";

export type FixtureRow = Readonly<Record<string, unknown>>;
export type PublicationStatus = "draft" | "pending_review" | "published" | "suspended";

export type FixtureSite = {
  readonly publicationStatus: PublicationStatus;
  readonly site: FixtureRow;
  readonly tracks: readonly FixtureRow[];
  readonly assets: readonly FixtureRow[];
  readonly posts: readonly FixtureRow[];
  readonly links: readonly FixtureRow[];
  readonly press: readonly FixtureRow[];
  readonly dates: readonly FixtureRow[];
  readonly metrics: readonly FixtureRow[];
  readonly contacts: readonly FixtureRow[];
};

const NVLL_CLICK_ID = "22222222-2222-2222-2222-222222222222";
const MIRIAM_ID = "99999999-9999-9999-9999-999999999999";
const DRAFT_ID = "55555555-5555-5555-5555-555555555555";
const REVIEW_ID = "88888888-8888-8888-8888-888888888888";

export const FIXTURE_IDS = {
  nvllClick: NVLL_CLICK_ID,
  miriam: MIRIAM_ID,
  draft: DRAFT_ID,
  review: REVIEW_ID,
} as const;

export const FIXTURE_SLUGS = {
  nvllClick: "nvll-click",
  miriam: "miriam-serra",
  draft: "owner-b-draft",
  review: "owner-c-review",
} as const;

function config(name: string, handle: string): FixtureRow {
  return {
    version: 1,
    identity: {
      name,
      handle,
      claim: "Electro-pop italiano",
      shortBio: "Fixture locale.",
      longBio: "Fixture locale dell'adattatore di lettura.",
      location: "Milano",
      locale: "it-IT",
    },
    theme: {
      ink: "#111111",
      panel: "#1a1a1a",
      paper: "#f5f2ea",
      muted: "#a0a0a0",
      dim: "#666666",
      line: "#333333",
      acid: "#ccff00",
    },
    fontPair: "grotesk-mono",
    iconFamily: "line",
    grain: false,
    surfaces: [
      { id: "feed", enabled: true },
      { id: "listen", enabled: true },
      { id: "epk", enabled: true },
      { id: "merch", enabled: true },
      { id: "home", enabled: true },
    ],
    sectionCopy: { version: 1 },
  };
}

const EMPTY_CONTENT = {
  tracks: [],
  assets: [],
  posts: [],
  links: [],
  press: [],
  dates: [],
  metrics: [],
  contacts: [],
} as const;

export function fixtureSites(): readonly FixtureSite[] {
  return [
    {
      publicationStatus: "published",
      site: {
        id: NVLL_CLICK_ID,
        slug: FIXTURE_SLUGS.nvllClick,
        config: config("NVLL CLICK", "nvll-click"),
        hero_asset_id: "33333333-3333-3333-3333-333333333333",
      },
      assets: [
        {
          id: "66666666-6666-6666-6666-666666666666",
          site_id: NVLL_CLICK_ID,
          kind: "photo_hi",
          sort_order: 2,
        },
        {
          id: "44444444-4444-4444-4444-444444444444",
          site_id: NVLL_CLICK_ID,
          kind: "merch",
          sort_order: 1,
        },
        {
          id: "33333333-3333-3333-3333-333333333333",
          site_id: NVLL_CLICK_ID,
          kind: "visual",
          sort_order: 0,
        },
      ],
      tracks: [
        {
          id: "aaaa0002-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          title: "Traccia incorporata",
          source: "embed",
          duration_seconds: null,
          embed_provider: "spotify",
          embed_url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
          sort_order: 1,
        },
        {
          id: "aaaa0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          title: "Traccia caricata",
          source: "upload",
          duration_seconds: 185,
          embed_provider: null,
          embed_url: null,
          sort_order: 0,
        },
      ],
      posts: [
        {
          id: "bbbb0002-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          kind: "track",
          caption: "In studio",
          visual_asset_id: null,
          cover_asset_id: "33333333-3333-3333-3333-333333333333",
          track_id: "aaaa0001-0000-0000-0000-000000000000",
          sort_order: 1,
        },
        {
          id: "bbbb0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          kind: "visual",
          caption: "Scatto di copertina",
          visual_asset_id: "33333333-3333-3333-3333-333333333333",
          cover_asset_id: null,
          track_id: null,
          sort_order: 0,
        },
      ],
      links: [
        {
          id: "cccc0002-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          provider: "instagram",
          url: "https://www.instagram.com/nvllclick",
          sort_order: 1,
        },
        {
          id: "cccc0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          provider: "spotify",
          url: "https://open.spotify.com/artist/4cOdK2wGLETKBW3PvgPWqT",
          sort_order: 0,
        },
      ],
      press: [
        {
          id: "dddd0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          publication: "Rolling Stone Italia",
          quote: "Un debutto che non chiede permesso.",
          published_on: "2026-03-14",
          url: "https://www.rollingstone.it/musica/recensioni/nvll-click",
          sort_order: 0,
        },
      ],
      dates: [
        {
          id: "eeee0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          starts_at: "2026-09-12T20:30:00+00:00",
          city: "Milano",
          venue: "Circolo Magnolia",
          ticket_url: "https://www.dice.fm/event/nvll-click-milano",
          sort_order: 0,
        },
      ],
      metrics: [
        {
          id: "ffff0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          label: "Ascoltatori mensili",
          value: "48.200",
          sort_order: 0,
        },
      ],
      contacts: [
        {
          id: "0a0a0002-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          role: "press",
          name: "Giulia Ferrari",
          email: "press@nvllclick.it",
          sort_order: 1,
        },
        {
          id: "0a0a0001-0000-0000-0000-000000000000",
          site_id: NVLL_CLICK_ID,
          role: "booking",
          name: "Marco Bianchi",
          email: "booking@nvllclick.it",
          sort_order: 0,
        },
      ],
    },
    {
      publicationStatus: "published",
      site: {
        id: MIRIAM_ID,
        slug: FIXTURE_SLUGS.miriam,
        config: config("MIRIAM SERRA", "miriam-serra"),
        hero_asset_id: null,
      },
      ...EMPTY_CONTENT,
      tracks: [
        {
          id: "aaaa0003-0000-0000-0000-000000000000",
          site_id: MIRIAM_ID,
          title: "Solo per Miriam",
          source: "embed",
          duration_seconds: null,
          embed_provider: "youtube",
          embed_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          sort_order: 0,
        },
      ],
      contacts: [
        {
          id: "0a0a0003-0000-0000-0000-000000000000",
          site_id: MIRIAM_ID,
          role: "management",
          name: "Studio Serra",
          email: "management@miriamserra.it",
          sort_order: 0,
        },
      ],
    },
    {
      publicationStatus: "draft",
      site: {
        id: DRAFT_ID,
        slug: FIXTURE_SLUGS.draft,
        config: config("OWNER B", "owner-b"),
        hero_asset_id: null,
      },
      ...EMPTY_CONTENT,
      contacts: [
        {
          id: "0a0a0004-0000-0000-0000-000000000000",
          site_id: DRAFT_ID,
          role: "booking",
          name: "Contatto in bozza",
          email: "booking@owner-b.test",
          sort_order: 0,
        },
      ],
    },
    {
      publicationStatus: "pending_review",
      site: {
        id: REVIEW_ID,
        slug: FIXTURE_SLUGS.review,
        config: config("OWNER C", "owner-c"),
        hero_asset_id: null,
      },
      ...EMPTY_CONTENT,
    },
  ];
}

const RELATION_COLLECTION = {
  public_tracks: "tracks",
  public_assets: "assets",
  public_posts: "posts",
  public_links: "links",
  public_press: "press",
  public_metrics: "metrics",
  public_dates: "dates",
  public_contacts: "contacts",
} as const;

type ModelledRelation = keyof typeof RELATION_COLLECTION;

function isModelled(relation: string): relation is ModelledRelation {
  return relation in RELATION_COLLECTION;
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

export class FakePublicDatabase implements PublicRowSource {
  readonly queries: RowQuery[] = [];
  private readonly sites: readonly FixtureSite[];

  constructor(sites: readonly FixtureSite[] = fixtureSites()) {
    this.sites = sites;
  }

  allSlugs(): readonly string[] { return this.sites.map((site) => String(site.site.slug)); }
  relationsQueried(): readonly string[] { return this.queries.map((query) => query.relation); }
  private published(): readonly FixtureSite[] { return this.sites.filter((site) => site.publicationStatus === "published"); }

  private rowsFor(relation: string): readonly FixtureRow[] {
    if (relation === "public_sites") return this.published().map((site) => site.site);
    if (isModelled(relation)) return this.published().flatMap((site) => site[RELATION_COLLECTION[relation]]);
    throw new Error(`La fixture non modella ${relation}.`);
  }

  async fetchRows(query: RowQuery): Promise<readonly unknown[]> {
    this.queries.push(query);
    let rows = [...this.rowsFor(query.relation)];
    for (const filter of query.filters ?? []) rows = rows.filter((row) => String(row[filter.column]) === filter.value);
    for (const order of [...(query.order ?? [])].reverse()) {
      rows.sort((left, right) => {
        const verdict = compare(left[order.column], right[order.column]);
        return order.ascending ? verdict : -verdict;
      });
    }
    if (query.limit !== undefined) rows = rows.slice(0, query.limit);
    return rows.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const column of query.columns) {
        if (!(column in row)) throw new Error(`Colonna sconosciuta in ${query.relation}: ${column}`);
        projected[column] = row[column];
      }
      return projected;
    });
  }
}
