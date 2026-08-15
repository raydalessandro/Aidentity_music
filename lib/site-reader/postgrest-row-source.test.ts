import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  bridgeSupabaseClient,
  createPostgrestRowSource,
  type PostgrestClientLike,
  type PostgrestFilterLike,
  type PostgrestResponseLike,
} from "./postgrest-row-source";
import { SiteReaderQueryError, type RowQuery } from "./row-source";
import { publicSiteContract } from "./rows";

/** Client di prova che registra la catena invece di eseguirla. */
class RecordingClient implements PostgrestClientLike {
  readonly calls: string[] = [];

  constructor(private readonly response: PostgrestResponseLike) {}

  from(relation: string) {
    this.calls.push(`from(${relation})`);
    return {
      select: (columns: string): PostgrestFilterLike => {
        this.calls.push(`select(${columns})`);
        return this.filter();
      },
    };
  }

  private filter(): PostgrestFilterLike {
    const builder: PostgrestFilterLike = {
      eq: (column, value) => {
        this.calls.push(`eq(${column},${value})`);
        return builder;
      },
      order: (column, options) => {
        this.calls.push(`order(${column},${options.ascending ? "asc" : "desc"})`);
        return builder;
      },
      limit: (count) => {
        this.calls.push(`limit(${count})`);
        return builder;
      },
      run: async () => {
        this.calls.push("run()");
        return this.response;
      },
    };
    return builder;
  }
}

const QUERY: RowQuery = {
  relation: "public_tracks",
  columns: ["id", "title", "sort_order"],
  filters: [{ column: "site_id", value: "22222222-2222-2222-2222-222222222222" }],
  order: [{ column: "sort_order", ascending: true }],
  limit: 5,
};

describe("da RowQuery a catena PostgREST", () => {
  it("traduce relazione, colonne, filtri, ordinamento e limite nell'ordine dichiarato", async () => {
    const client = new RecordingClient({ data: [], error: null });
    await createPostgrestRowSource(() => client).fetchRows(QUERY);

    expect(client.calls).toEqual([
      "from(public_tracks)",
      "select(id,title,sort_order)",
      "eq(site_id,22222222-2222-2222-2222-222222222222)",
      "order(sort_order,asc)",
      "limit(5)",
      "run()",
    ]);
  });

  it("una query senza filtri non ne inventa", async () => {
    const client = new RecordingClient({ data: [], error: null });
    await createPostgrestRowSource(() => client).fetchRows({
      relation: "public_sites",
      columns: ["id", "slug"],
    });

    expect(client.calls).toEqual(["from(public_sites)", "select(id,slug)", "run()"]);
  });

  it("il client è chiesto alla prima query, non alla costruzione della sorgente", () => {
    let creations = 0;
    createPostgrestRowSource(() => {
      creations += 1;
      return new RecordingClient({ data: [], error: null });
    });

    expect(creations).toBe(0);
  });

  it("restituisce le righe così come arrivano, senza fidarsene", async () => {
    const righe = [{ id: "1", title: "x", sort_order: 0 }];
    const client = new RecordingClient({ data: righe, error: null });

    expect(await createPostgrestRowSource(() => client).fetchRows(QUERY)).toEqual(righe);
  });
});

describe("un guasto del trasporto non diventa un 404", () => {
  it("un errore PostgREST diventa SiteReaderQueryError con la relazione", async () => {
    const client = new RecordingClient({
      data: null,
      error: { message: 'permission denied for view "public_tracks"' },
    });

    const failure = await createPostgrestRowSource(() => client)
      .fetchRows(QUERY)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SiteReaderQueryError);
    expect((failure as SiteReaderQueryError).relation).toBe("public_tracks");
    expect((failure as SiteReaderQueryError).message).toContain("permission denied");
  });

  it("una risposta senza errore e senza array non viene scambiata per lista vuota", async () => {
    const client = new RecordingClient({ data: null, error: null });

    const failure = await createPostgrestRowSource(() => client)
      .fetchRows(QUERY)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SiteReaderQueryError);
    expect((failure as SiteReaderQueryError).message).toContain(
      "risposta senza righe utilizzabili",
    );
  });
});

/**
 * Il ponte verso il client vero, provato senza database: `@supabase/supabase-js` accetta un
 * `fetch` iniettato, quindi si può osservare la richiesta HTTP che PostgREST costruirebbe.
 * È il pezzo che un doppio non può dimostrare — che la catena diventi *quella* URL — e non
 * richiede un Postgres in ascolto.
 */
describe("il ponte verso il client Supabase produce la richiesta attesa", () => {
  function clientWithSpy(body: unknown) {
    const requests: string[] = [];
    const client = createClient("https://progetto.supabase.co", "chiave-anon-di-prova", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL) => {
          requests.push(input instanceof Request ? input.url : String(input));
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    return { requests, client };
  }

  it("chiede alla vista pubblica le sole colonne dello schema, filtrate per slug", async () => {
    const { requests, client } = clientWithSpy([]);
    const source = createPostgrestRowSource(() => bridgeSupabaseClient(client));

    await source.fetchRows({
      relation: publicSiteContract.relation,
      columns: publicSiteContract.columns,
      filters: [{ column: "slug", value: "nvll-click" }],
      limit: 1,
    });

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0] ?? "");
    expect(url.pathname).toBe("/rest/v1/public_sites");
    expect(url.searchParams.get("select")).toBe("id,slug,config,hero_asset_id");
    expect(url.searchParams.get("slug")).toBe("eq.nvll-click");
    expect(url.searchParams.get("limit")).toBe("1");
    // Nessuna tabella base, nessuna colonna interna nella richiesta.
    expect(url.search).not.toContain("storage_path");
  });

  it("ordinamento e filtro per sito finiscono nella query string", async () => {
    const { requests, client } = clientWithSpy([]);
    const source = createPostgrestRowSource(() => bridgeSupabaseClient(client));

    await source.fetchRows({
      relation: "public_contacts",
      columns: ["id", "email"],
      filters: [{ column: "site_id", value: "22222222-2222-2222-2222-222222222222" }],
      order: [{ column: "sort_order", ascending: true }],
    });

    const url = new URL(requests[0] ?? "");
    expect(url.pathname).toBe("/rest/v1/public_contacts");
    expect(url.searchParams.get("site_id")).toBe("eq.22222222-2222-2222-2222-222222222222");
    expect(url.searchParams.get("order")).toBe("sort_order.asc");
  });

  it("le righe di risposta tornano intatte al chiamante", async () => {
    const righe = [{ id: "0a0a0001-0000-0000-0000-000000000000", email: "booking@nvllclick.it" }];
    const { client } = clientWithSpy(righe);
    const source = createPostgrestRowSource(() => bridgeSupabaseClient(client));

    expect(
      await source.fetchRows({ relation: "public_contacts", columns: ["id", "email"] }),
    ).toEqual(righe);
  });
});
