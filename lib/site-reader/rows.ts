import { z } from "zod";

import { SLUG_PATTERN } from "../../app/[slug]/slug";
import type { PublicRelation } from "./row-source";

export class SiteReaderRowError extends Error {
  readonly relation: PublicRelation;
  readonly issues: readonly string[];

  constructor(relation: PublicRelation, issues: readonly string[]) {
    super(`Riga non valida da ${relation}: ${issues.join("; ")}`);
    this.name = "SiteReaderRowError";
    this.relation = relation;
    this.issues = issues;
  }
}

const guid = z.guid();
const nullableGuid = guid.nullable();
const sortOrder = z.int();
const filledText = z.string().trim().min(1);
const httpsUrl = z.url().startsWith("https://");
const jsonObject = z.record(z.string(), z.unknown());

export type RelationContract<Shape extends z.ZodRawShape> = {
  readonly relation: PublicRelation;
  readonly columns: readonly string[];
  readonly schema: z.ZodObject<Shape>;
};

function contract<Shape extends z.ZodRawShape>(
  relation: PublicRelation,
  shape: Shape,
): RelationContract<Shape> {
  return { relation, columns: Object.keys(shape), schema: z.strictObject(shape) };
}

export const publicSiteContract = contract("public_sites", {
  id: guid,
  slug: z.string().regex(SLUG_PATTERN),
  config: jsonObject,
  hero_asset_id: nullableGuid,
});

export const publishedSiteIndexContract = contract("public_sites", {
  id: guid,
  slug: z.string().regex(SLUG_PATTERN),
  config: jsonObject,
});

export const publicTrackContract = contract("public_tracks", {
  id: guid,
  site_id: guid,
  title: filledText,
  source: z.enum(["upload", "embed"]),
  duration_seconds: z.int().positive().nullable(),
  embed_provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud"]).nullable(),
  embed_url: z.string().nullable(),
  sort_order: sortOrder,
});

/**
 * `public_assets` espone soltanto metadati pubblici. L'URL viene derivato nell'adattatore
 * dalla route media usando `(site_id, id)`: nessun path Storage attraversa questa vista.
 */
export const publicAssetContract = contract("public_assets", {
  id: guid,
  site_id: guid,
  kind: z.enum(["logo", "visual", "photo_hi", "merch", "video"]),
  sort_order: sortOrder,
});

export const publicPostContract = contract("public_posts", {
  id: guid,
  site_id: guid,
  kind: z.enum(["visual", "track"]),
  caption: z.string().nullable(),
  visual_asset_id: nullableGuid,
  cover_asset_id: nullableGuid,
  track_id: nullableGuid,
  sort_order: sortOrder,
});

export const publicLinkContract = contract("public_links", {
  id: guid,
  site_id: guid,
  provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud", "instagram", "tiktok"]),
  url: httpsUrl,
  sort_order: sortOrder,
});

export const publicPressContract = contract("public_press", {
  id: guid,
  site_id: guid,
  publication: filledText,
  quote: filledText,
  published_on: z.iso.date().nullable(),
  url: httpsUrl.nullable(),
  sort_order: sortOrder,
});

export const publicDateContract = contract("public_dates", {
  id: guid,
  site_id: guid,
  starts_at: z.iso.datetime({ offset: true }),
  city: filledText,
  venue: filledText,
  ticket_url: httpsUrl.nullable(),
  sort_order: sortOrder,
});

export const publicMetricContract = contract("public_metrics", {
  id: guid,
  site_id: guid,
  label: filledText,
  value: filledText,
  sort_order: sortOrder,
});

export const publicContactContract = contract("public_contacts", {
  id: guid,
  site_id: guid,
  role: z.enum(["booking", "management", "press"]),
  name: filledText,
  email: z.email(),
  sort_order: sortOrder,
});

function describe(issue: z.core.$ZodIssue, index: number): string {
  const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
  return `riga ${index}${path}: ${issue.message}`;
}

export function parseRows<Shape extends z.ZodRawShape>(
  { relation, schema }: RelationContract<Shape>,
  rows: readonly unknown[],
): readonly z.infer<z.ZodObject<Shape>>[] {
  const parsed: z.infer<z.ZodObject<Shape>>[] = [];
  const issues: string[] = [];

  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) parsed.push(result.data);
    else issues.push(...result.error.issues.map((issue) => describe(issue, index)));
  });

  if (issues.length > 0) throw new SiteReaderRowError(relation, issues);
  return parsed;
}
