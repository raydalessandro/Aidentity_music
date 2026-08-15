// Gli adattatori verso Supabase, provati con doppi che applicano davvero i parametri.
//
// Il client vero non è raggiungibile da qui (né lo Storage: senza docker `supabase start`
// non gira). Ciò che si può provare, e che qui si prova, è la traduzione: quali tabelle
// vengono lette, con quali colonne, con quale filtro, e che cosa succede quando la risposta
// non è quella che il contratto descrive.

import { describe, expect, it } from "vitest";

import { MEDIA_FIXTURE_IDS, MEDIA_FIXTURE_PATHS } from "./fixtures";
import {
  MediaSignatureError,
  MediaSourceError,
  createSupabaseMediaSigner,
  createSupabaseMediaSource,
  type MediaQueryClientLike,
  type SingleResponseLike,
  type StorageSignerLike,
} from "./supabase-media";

type Call = { relation: string; columns: string; filters: [string, string][] };

function client(
  responses: Record<string, SingleResponseLike>,
): MediaQueryClientLike & { readonly calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    from: (relation) => ({
      select: (columns) => {
        const call: Call = { relation, columns, filters: [] };
        calls.push(call);
        const query = {
          eq(column: string, value: string) {
            call.filters.push([column, value]);
            return query;
          },
          async maybeSingle(): Promise<SingleResponseLike> {
            return responses[relation] ?? { data: null, error: null };
          },
        };
        return query;
      },
    }),
  };
}

const ROW = {
  site_id: MEDIA_FIXTURE_IDS.publishedSite,
  storage_path: MEDIA_FIXTURE_PATHS.publishedAsset,
  mime_type: "image/jpeg",
  purged_at: null,
};

describe("lettura privilegiata", () => {
  it("legge la tabella del kind e poi lo stato del sito, per identificativo", async () => {
    const double = client({
      site_assets: { data: ROW, error: null },
      sites: { data: { publication_status: "published" }, error: null },
    });

    const row = await createSupabaseMediaSource(() => double).findRow(
      "asset",
      MEDIA_FIXTURE_IDS.publishedAsset,
    );

    expect(row).toEqual({
      siteId: MEDIA_FIXTURE_IDS.publishedSite,
      storagePath: MEDIA_FIXTURE_PATHS.publishedAsset,
      mimeType: "image/jpeg",
      purgedAt: null,
      publicationStatus: "published",
    });

    expect(double.calls).toEqual([
      {
        relation: "site_assets",
        columns: "site_id, storage_path, mime_type, purged_at",
        filters: [["id", MEDIA_FIXTURE_IDS.publishedAsset]],
      },
      {
        relation: "sites",
        columns: "publication_status",
        filters: [["id", MEDIA_FIXTURE_IDS.publishedSite]],
      },
    ]);
  });

  it("il kind track legge site_tracks", async () => {
    const double = client({
      site_tracks: { data: { ...ROW, mime_type: "audio/mpeg" }, error: null },
      sites: { data: { publication_status: "published" }, error: null },
    });

    await createSupabaseMediaSource(() => double).findRow("track", MEDIA_FIXTURE_IDS.publishedTrack);
    expect(double.calls[0]?.relation).toBe("site_tracks");
  });

  /**
   * La query NON filtra su `publication_status`, `purged_at` o `site_id`: quei giudizi sono
   * di `decideMediaAccess`, dove un test può renderli rossi. Se un filtro comparisse qui,
   * la prova di mutazione sul controllo `published` diventerebbe una finzione.
   */
  it("non filtra su stato, purga o tenant: il giudizio non vive nella query", async () => {
    const double = client({
      site_assets: { data: ROW, error: null },
      sites: { data: { publication_status: "draft" }, error: null },
    });

    const row = await createSupabaseMediaSource(() => double).findRow(
      "asset",
      MEDIA_FIXTURE_IDS.publishedAsset,
    );

    // La riga di un sito in bozza torna indietro: è il giudice a fermarla, non la query.
    expect(row?.publicationStatus).toBe("draft");
    for (const call of double.calls) {
      expect(call.filters.map(([column]) => column)).toEqual(["id"]);
    }
  });

  it("nessuna riga → null, senza inventare uno stato", async () => {
    const double = client({ site_assets: { data: null, error: null } });
    const row = await createSupabaseMediaSource(() => double).findRow("asset", MEDIA_FIXTURE_IDS.absent);
    expect(row).toBeNull();
  });

  it("errore di trasporto → eccezione, non «nessuna riga»", async () => {
    const double = client({ site_assets: { data: null, error: { message: "permesso negato" } } });
    await expect(
      createSupabaseMediaSource(() => double).findRow("asset", MEDIA_FIXTURE_IDS.publishedAsset),
    ).rejects.toBeInstanceOf(MediaSourceError);
  });

  it("una riga di forma inattesa non entra nel dominio", async () => {
    const double = client({
      site_assets: { data: { site_id: "non-un-guid", storage_path: null, mime_type: null, purged_at: null }, error: null },
    });
    await expect(
      createSupabaseMediaSource(() => double).findRow("asset", MEDIA_FIXTURE_IDS.publishedAsset),
    ).rejects.toThrow();
  });
});

describe("firma", () => {
  it("chiede createSignedUrl con bucket, path e TTL, e restituisce l'URL", async () => {
    const chiamate: [string, string, number][] = [];
    const storage: StorageSignerLike = {
      createSignedUrl: async (bucket, path, expiresIn) => {
        chiamate.push([bucket, path, expiresIn]);
        return { data: { signedUrl: "https://storage.test/firma" }, error: null };
      },
    };

    const url = await createSupabaseMediaSigner(() => storage).sign(
      "site-assets",
      MEDIA_FIXTURE_PATHS.publishedAsset,
      60,
    );

    expect(url).toBe("https://storage.test/firma");
    expect(chiamate).toEqual([["site-assets", MEDIA_FIXTURE_PATHS.publishedAsset, 60]]);
  });

  it("un errore dello Storage non propaga il messaggio, che può contenere il path", async () => {
    const storage: StorageSignerLike = {
      createSignedUrl: async () => ({
        data: null,
        error: { message: `object not found: ${MEDIA_FIXTURE_PATHS.publishedAsset}` },
      }),
    };

    const signer = createSupabaseMediaSigner(() => storage);
    await expect(signer.sign("site-assets", MEDIA_FIXTURE_PATHS.publishedAsset, 60)).rejects.toBeInstanceOf(
      MediaSignatureError,
    );
    await signer
      .sign("site-assets", MEDIA_FIXTURE_PATHS.publishedAsset, 60)
      .catch((error: unknown) => {
        expect(String(error)).not.toContain(MEDIA_FIXTURE_PATHS.publishedAsset);
      });
  });
});
