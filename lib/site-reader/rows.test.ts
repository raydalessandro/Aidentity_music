import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FIXTURE_IDS, fixtureSites } from "./fixtures";
import {
  SiteReaderRowError,
  parseRows,
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

const seedSite = fixtureSites()[0];
if (seedSite === undefined) throw new Error("fixture vuota");

describe("la trappola di z.uuid()", () => {
  // Questa non è una curiosità: è la ragione per cui il bordo usa `z.guid()`. Gli
  // identificativi di `supabase/seed.sql` non sono UUID v4 e `z.uuid()` di Zod 4 li rifiuta,
  // quindi un bordo scritto con `z.uuid()` respingerebbe la fixture che gira in CI.
  it("z.uuid() rifiuta l'identificativo del seed, z.guid() lo accetta", () => {
    expect(z.uuid().safeParse(FIXTURE_IDS.nvllClick).success).toBe(false);
    expect(z.guid().safeParse(FIXTURE_IDS.nvllClick).success).toBe(true);
  });

  it("il contratto del sito accetta l'identificativo del seed", () => {
    expect(() => parseRows(publicSiteContract, [seedSite.site])).not.toThrow();
  });
});

describe("le righe canoniche della fixture passano il bordo", () => {
  // Ogni voce porta il proprio `parse` perché i contratti hanno forme diverse: un solo
  // parametro tipizzato costringerebbe a un cast, e un cast in un test sulla validazione
  // sarebbe esattamente la scorciatoia che questo bordo esiste per impedire.
  it.each([
    {
      nome: "public_sites",
      attese: 1,
      parse: () => parseRows(publicSiteContract, [seedSite.site]),
    },
    {
      nome: "public_sites (indice sitemap)",
      attese: 1,
      parse: () =>
        parseRows(publishedSiteIndexContract, [
          { id: seedSite.site.id, slug: seedSite.site.slug, config: seedSite.site.config },
        ]),
    },
    {
      nome: "public_tracks",
      attese: seedSite.tracks.length,
      parse: () => parseRows(publicTrackContract, seedSite.tracks),
    },
    {
      nome: "public_posts",
      attese: seedSite.posts.length,
      parse: () => parseRows(publicPostContract, seedSite.posts),
    },
    {
      nome: "public_links",
      attese: seedSite.links.length,
      parse: () => parseRows(publicLinkContract, seedSite.links),
    },
    {
      nome: "public_press",
      attese: seedSite.press.length,
      parse: () => parseRows(publicPressContract, seedSite.press),
    },
    {
      nome: "public_dates",
      attese: seedSite.dates.length,
      parse: () => parseRows(publicDateContract, seedSite.dates),
    },
    {
      nome: "public_metrics",
      attese: seedSite.metrics.length,
      parse: () => parseRows(publicMetricContract, seedSite.metrics),
    },
    {
      nome: "public_contacts",
      attese: seedSite.contacts.length,
      parse: () => parseRows(publicContactContract, seedSite.contacts),
    },
  ])("$nome", ({ attese, parse }) => {
    expect(attese).toBeGreaterThan(0);
    expect(parse()).toHaveLength(attese);
  });
});

/** Riga valida di contatto, da rompere un campo alla volta. */
function contactRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "0a0a0001-0000-0000-0000-000000000000",
    site_id: FIXTURE_IDS.nvllClick,
    role: "booking",
    name: "Marco Bianchi",
    email: "booking@nvllclick.it",
    sort_order: 0,
    ...overrides,
  };
}

describe("ogni rifiuto dichiara che cosa è stato rifiutato", () => {
  it.each([
    {
      caso: "colonna del consenso trapelata dalla vista",
      riga: contactRow({ consent_confirmed_at: "2026-05-01T10:00:00+00:00" }),
      atteso: "riga 0: Unrecognized key: \"consent_confirmed_at\"",
    },
    {
      caso: "ruolo fuori vocabolario",
      riga: contactRow({ role: "legal" }),
      atteso: 'riga 0.role: Invalid option: expected one of "booking"|"management"|"press"',
    },
    {
      caso: "nome fatto di soli spazi",
      riga: contactRow({ name: "   " }),
      atteso: "riga 0.name: Too small: expected string to have >=1 characters",
    },
    {
      caso: "identificativo non conforme",
      riga: contactRow({ id: "non-un-identificativo" }),
      atteso: "riga 0.id: Invalid GUID",
    },
    {
      caso: "sort_order non intero",
      riga: contactRow({ sort_order: 1.5 }),
      atteso: "riga 0.sort_order: Invalid input: expected int, received number",
    },
    {
      caso: "email nulla dove il contratto non ammette null",
      riga: contactRow({ email: null }),
      atteso: "riga 0.email: Invalid input: expected string, received null",
    },
  ])("$caso", ({ riga, atteso }) => {
    const failure = (() => {
      try {
        parseRows(publicContactContract, [riga]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    const error = failure as SiteReaderRowError;
    expect(error.relation).toBe("public_contacts");
    expect(error.issues).toEqual([atteso]);
    expect(error.message).toContain("public_contacts");
  });
});

describe("i formati che il database garantisce e il bordo ricontrolla", () => {
  it("una data di concerto senza fuso orario non passa", () => {
    const row = {
      id: "eeee0001-0000-0000-0000-000000000000",
      site_id: FIXTURE_IDS.nvllClick,
      starts_at: "2026-09-12 20:30:00",
      city: "Milano",
      venue: "Circolo Magnolia",
      ticket_url: null,
      sort_order: 0,
    };
    expect(() => parseRows(publicDateContract, [row])).toThrowError(SiteReaderRowError);
  });

  it("un timestamptz serializzato da PostgREST passa, con o senza microsecondi", () => {
    const base = {
      id: "eeee0001-0000-0000-0000-000000000000",
      site_id: FIXTURE_IDS.nvllClick,
      city: "Milano",
      venue: "Circolo Magnolia",
      ticket_url: null,
      sort_order: 0,
    };
    const rows = [
      { ...base, starts_at: "2026-09-12T20:30:00+00:00" },
      { ...base, starts_at: "2026-09-12T20:30:00.123456+00:00" },
    ];
    expect(parseRows(publicDateContract, rows)).toHaveLength(2);
  });

  it("un link non https viene rifiutato come lo rifiuterebbe private.is_https_url", () => {
    const row = {
      id: "cccc0001-0000-0000-0000-000000000000",
      site_id: FIXTURE_IDS.nvllClick,
      provider: "spotify",
      url: "http://open.spotify.com/artist/x",
      sort_order: 0,
    };
    expect(() => parseRows(publicLinkContract, [row])).toThrowError(
      /must start with "https:\/\/"/u,
    );
  });

  it("una quota stampa senza data resta valida: `published_on` è nullable nel database", () => {
    const row = {
      id: "dddd0001-0000-0000-0000-000000000000",
      site_id: FIXTURE_IDS.nvllClick,
      publication: "Rolling Stone Italia",
      quote: "Un debutto che non chiede permesso.",
      published_on: null,
      url: null,
      sort_order: 0,
    };
    expect(parseRows(publicPressContract, [row])).toHaveLength(1);
  });
});

describe("tutte le righe o nessuna", () => {
  it("una riga malata in mezzo a due sane non lascia passare le sane", () => {
    const rows = [
      contactRow(),
      contactRow({ id: "0a0a0002-0000-0000-0000-000000000000", email: "rotta" }),
      contactRow({ id: "0a0a0003-0000-0000-0000-000000000000", role: "press" }),
    ];

    const failure = (() => {
      try {
        return parseRows(publicContactContract, rows);
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(SiteReaderRowError);
    expect((failure as SiteReaderRowError).issues).toEqual(["riga 1.email: Invalid email address"]);
  });

  it("una collezione vuota è un esito legittimo, non un errore", () => {
    expect(parseRows(publicContactContract, [])).toEqual([]);
  });
});

describe("config: una sola autorità", () => {
  it("il bordo verifica che sia un oggetto JSON, non che sia pubblicabile", () => {
    const incompleta = { version: 1, identity: { name: null } };
    const row = { id: FIXTURE_IDS.nvllClick, slug: "nvll-click", config: incompleta };

    // Passa qui — e sarà `siteConfigSchema`, dal read model, a dichiararla non pubblicabile.
    expect(parseRows(publishedSiteIndexContract, [row])).toHaveLength(1);
  });

  it("una config che non è un oggetto non è nemmeno trasportabile", () => {
    const row = { id: FIXTURE_IDS.nvllClick, slug: "nvll-click", config: "{}" };
    expect(() => parseRows(publishedSiteIndexContract, [row])).toThrowError(SiteReaderRowError);
  });
});

describe("colonne e schema non possono divergere", () => {
  it.each([
    { nome: "public_sites", contratto: publicSiteContract },
    { nome: "public_tracks", contratto: publicTrackContract },
    { nome: "public_posts", contratto: publicPostContract },
    { nome: "public_links", contratto: publicLinkContract },
    { nome: "public_press", contratto: publicPressContract },
    { nome: "public_dates", contratto: publicDateContract },
    { nome: "public_metrics", contratto: publicMetricContract },
    { nome: "public_contacts", contratto: publicContactContract },
  ])("$nome chiede esattamente i campi che sa validare", ({ contratto }) => {
    expect([...contratto.columns].sort()).toEqual(Object.keys(contratto.schema.shape).sort());
  });
});
