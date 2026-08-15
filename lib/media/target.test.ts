import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MEDIA_FIXTURE_IDS } from "./fixtures";
import { parseMediaTarget } from "./target";

describe("bordo della richiesta", () => {
  it("accetta le due sole forme di media previste da §5", () => {
    for (const kind of ["asset", "track"]) {
      const parsed = parseMediaTarget({
        kind,
        siteId: MEDIA_FIXTURE_IDS.publishedSite,
        id: MEDIA_FIXTURE_IDS.publishedAsset,
      });
      expect(parsed.ok, kind).toBe(true);
    }
  });

  it("rifiuta un kind fuori vocabolario e dichiara il campo", () => {
    const parsed = parseMediaTarget({
      kind: "one-sheet",
      siteId: MEDIA_FIXTURE_IDS.publishedSite,
      id: MEDIA_FIXTURE_IDS.publishedAsset,
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toContain("kind");
  });

  /**
   * La misura che giustifica `z.guid()`, non una convinzione. Gli identificativi di
   * `supabase/seed.sql` non rispettano versione e variante RFC 9562: con `z.uuid()` la
   * fixture del repo sarebbe rifiutata dal bordo, e ogni test positivo del filone
   * girerebbe su identificativi che il prodotto non possiede.
   */
  it("z.uuid() rifiuta gli identificativi del seed, z.guid() li accetta", () => {
    const seedId = MEDIA_FIXTURE_IDS.publishedSite;

    expect(z.uuid().safeParse(seedId).success).toBe(false);
    expect(z.guid().safeParse(seedId).success).toBe(true);

    expect(
      parseMediaTarget({ kind: "asset", siteId: seedId, id: MEDIA_FIXTURE_IDS.publishedAsset }).ok,
    ).toBe(true);
  });

  it("non appiattisce un segmento ripetuto in stringa", () => {
    const parsed = parseMediaTarget({
      kind: "asset",
      siteId: [MEDIA_FIXTURE_IDS.publishedSite],
      id: MEDIA_FIXTURE_IDS.publishedAsset,
    });
    expect(parsed.ok).toBe(false);
  });
});
