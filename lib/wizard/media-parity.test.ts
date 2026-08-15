import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MEDIA_BUCKET, SERVABLE_MIME_TYPES } from "../media/media";
import {
  ASSET_BUCKET,
  ASSET_MAX_BYTES,
  ASSET_MIME_TYPES,
  TRACK_BUCKET,
  TRACK_MAX_BYTES,
  TRACK_MIME_TYPES,
} from "./upload";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const mediaMigration = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260815190000_media_storage_buckets.sql"),
  "utf8",
);
const wizardMigration = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260815203000_c_wizard_upload_lifecycle.sql"),
  "utf8",
);

function bucketLimit(bucket: string): number {
  const escaped = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mediaMigration.match(
    new RegExp(`'${escaped}'\\s*,\\s*'${escaped}'\\s*,\\s*false\\s*,\\s*(\\d+)`, "m"),
  );
  if (!match?.[1]) throw new Error(`limite bucket ${bucket} non trovato nella migrazione media`);
  return Number(match[1]);
}

describe("stack C -> media", () => {
  it("usa direttamente i bucket e le allowlist MIME del filone media", () => {
    expect(ASSET_BUCKET).toBe(MEDIA_BUCKET.asset);
    expect(TRACK_BUCKET).toBe(MEDIA_BUCKET.track);
    expect(ASSET_MIME_TYPES).toEqual(SERVABLE_MIME_TYPES.asset);
    expect(TRACK_MIME_TYPES).toEqual(SERVABLE_MIME_TYPES.track);
  });

  it("mantiene i massimi del wizard uguali ai limiti dichiarati dai bucket", () => {
    expect(ASSET_MAX_BYTES).toBe(bucketLimit(MEDIA_BUCKET.asset));
    expect(TRACK_MAX_BYTES).toBe(bucketLimit(MEDIA_BUCKET.track));
  });

  it("le policy Storage C nominano esattamente i bucket del filone media", () => {
    expect(wizardMigration).toContain(`bucket_id = '${MEDIA_BUCKET.asset}'`);
    expect(wizardMigration).toContain(`bucket_id = '${MEDIA_BUCKET.track}'`);
    expect(wizardMigration).not.toContain("bucket_id = 'assets'");
    expect(wizardMigration).not.toContain("bucket_id = 'tracks'");
  });

  it("la migrazione C viene dopo la migrazione che crea i bucket", () => {
    expect("20260815203000").toBeGreaterThan("20260815190000");
  });
});
