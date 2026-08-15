// Parità fra la migrazione dei bucket e le costanti che il codice usa.
//
// Il database è la fonte, ma il codice deve nominare gli stessi bucket, altrimenti la route
// firma su un contenitore che non esiste e ogni immagine diventa un 502. Qui la migrazione
// viene letta e confrontata: è l'unico presidio del filone che si può eseguire senza docker,
// e vale soprattutto per la riga che conta — `public = false`.
//
// Il pgTAP `supabase/tests/database/media_storage_buckets_test.sql` verifica la stessa cosa
// sul database vero, nel job Database della CI. Questo la verifica sul testo, qui e adesso.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MEDIA_BUCKET, SERVABLE_MIME_TYPES } from "./media";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function migrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");
}

/** La riga `values` di un bucket: id, nome, `public`, limite, allowlist. */
function bucketDeclaration(sql: string, bucket: string): string | null {
  const pattern = new RegExp(
    `\\(\\s*'${bucket}'\\s*,\\s*'${bucket}'\\s*,\\s*(true|false)\\s*,([\\s\\S]*?)\\)\\s*(?:,|\\s*on conflict)`,
    "i",
  );
  const match = pattern.exec(sql);
  return match === null ? null : `${match[1]}|${match[2]}`;
}

describe("i bucket dichiarati dalla migrazione", () => {
  const sql = migrationSql();

  it("una migrazione li crea: prima di questo filone nessuna lo faceva", () => {
    expect(sql).toContain("storage.buckets");
    // Se la ricerca smettesse di trovare la dichiarazione, il presidio passerebbe a vuoto.
    for (const bucket of Object.values(MEDIA_BUCKET)) {
      expect(bucketDeclaration(sql, bucket), bucket).not.toBeNull();
    }
  });

  /**
   * Mutazione: cambiare `false` in `true` per uno qualunque dei due bucket rende rosso
   * questo test. È la riga che decide se un asset in bozza è leggibile da chiunque ne
   * indovini il path.
   */
  it.each(Object.values(MEDIA_BUCKET))("%s è privato", (bucket) => {
    const declaration = bucketDeclaration(sql, bucket);
    expect(declaration).not.toBeNull();
    expect(declaration?.startsWith("false|")).toBe(true);
  });

  it("nessun bucket accetta SVG: sarebbe XSS same-origin servito dalla piattaforma", () => {
    for (const bucket of Object.values(MEDIA_BUCKET)) {
      expect(bucketDeclaration(sql, bucket)).not.toContain("image/svg+xml");
    }
    expect(SERVABLE_MIME_TYPES.asset).not.toContain("image/svg+xml");
  });

  it("nessun bucket accetta video: §5 lo esclude dalla v1", () => {
    for (const bucket of Object.values(MEDIA_BUCKET)) {
      expect(bucketDeclaration(sql, bucket)).not.toContain("video/");
    }
    expect(SERVABLE_MIME_TYPES.asset.some((mime) => mime.startsWith("video/"))).toBe(false);
  });

  it("l'allowlist del codice non è più larga di quella del bucket", () => {
    const assets = bucketDeclaration(sql, MEDIA_BUCKET.asset) ?? "";
    for (const mime of SERVABLE_MIME_TYPES.asset) expect(assets, mime).toContain(mime);

    const tracks = bucketDeclaration(sql, MEDIA_BUCKET.track) ?? "";
    for (const mime of SERVABLE_MIME_TYPES.track) expect(tracks, mime).toContain(mime);
  });

  it("la migrazione non concede nulla ad anon sugli oggetti", () => {
    const mediaMigration = readFileSync(
      join(migrationsDir, "20260815190000_media_storage_buckets.sql"),
      "utf8",
    );
    expect(mediaMigration).not.toMatch(/create\s+policy/i);
    expect(mediaMigration).not.toMatch(/grant\s+[\s\S]{0,80}\bto\s+anon/i);
  });
});
