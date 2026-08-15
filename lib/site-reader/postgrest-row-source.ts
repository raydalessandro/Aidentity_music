// L'unico modulo che sa com'è fatta una query PostgREST. Traduce `RowQuery` in una catena
// `.from().select().eq().order().limit()` e riporta indietro righe non ancora fidate.
//
// Il client non viene creato qui: arriva come parametro. Motivo operativo, non estetico —
// `lib/supabase/public-reader.ts` apre con `import "server-only"`, che non è un pacchetto
// installato ma un alias risolto solo dentro il build di Next: un test che importasse quel
// modulo non riuscirebbe a caricarlo. Tenendo la creazione fuori, la traduzione resta
// eseguibile in vitest.
//
// `PostgrestClientLike` è una forma minima e non un alias di `SupabaseClient`: i tipi
// generici di `@supabase/postgrest-js` sono troppo profondi perché il compilatore possa
// confrontarli con una forma ridotta (`TS2589: Type instantiation is excessively deep`,
// misurato). `bridgeSupabaseClient` risolve il problema nel verso giusto: **costruisce** la
// forma minima chiamando il client vero, invece di dichiarare che il client vero è già
// quella forma. Nessun cast, e il doppio dei test è un client legittimo a tutti gli effetti.
//
// Nessun `select("*")`: le colonne arrivano da `RowQuery`, che le prende dagli schemi Zod.
// Ciò che non viene chiesto non attraversa la rete.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SiteReaderQueryError,
  selectList,
  type PublicRowSource,
  type RowQuery,
} from "./row-source";

export type PostgrestResponseLike = {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
};

/**
 * `run()` invece di un thenable: PostgREST restituisce un builder che è anche una promessa,
 * ma replicarne la firma qui costringerebbe ogni doppio a imitare `Promise`. Il metodo
 * esplicito dice la stessa cosa e si implementa in una riga.
 */
export interface PostgrestFilterLike {
  eq(column: string, value: string): PostgrestFilterLike;
  order(column: string, options: { ascending: boolean }): PostgrestFilterLike;
  limit(count: number): PostgrestFilterLike;
  run(): Promise<PostgrestResponseLike>;
}

export interface PostgrestClientLike {
  from(relation: string): { select(columns: string): PostgrestFilterLike };
}

type SupabaseFilterBuilder = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

function wrapFilter(builder: SupabaseFilterBuilder): PostgrestFilterLike {
  return {
    eq: (column, value) => wrapFilter(builder.eq(column, value)),
    order: (column, options) => wrapFilter(builder.order(column, options)),
    limit: (count) => wrapFilter(builder.limit(count)),
    run: async () => {
      const { data, error } = await builder;
      return { data, error };
    },
  };
}

/** Riduce il client Supabase alla sola superficie che l'adattatore usa davvero. */
export function bridgeSupabaseClient(client: SupabaseClient): PostgrestClientLike {
  return {
    from: (relation) => ({
      select: (columns) => wrapFilter(client.from(relation).select(columns)),
    }),
  };
}

/**
 * Il client è chiesto pigramente, non alla costruzione della sorgente: `RowQuery` non deve
 * poter forzare la lettura dell'ambiente prima che serva davvero una riga.
 */
export function createPostgrestRowSource(client: () => PostgrestClientLike): PublicRowSource {
  return {
    async fetchRows(query: RowQuery): Promise<readonly unknown[]> {
      let builder = client().from(query.relation).select(selectList(query.columns));

      for (const filter of query.filters ?? []) builder = builder.eq(filter.column, filter.value);
      for (const order of query.order ?? []) {
        builder = builder.order(order.column, { ascending: order.ascending });
      }
      if (query.limit !== undefined) builder = builder.limit(query.limit);

      const { data, error } = await builder.run();
      if (error !== null) throw new SiteReaderQueryError(query.relation, error.message);
      // Una risposta senza errore e senza array non è una lista vuota: è una risposta che
      // non capiamo, e trattarla come "nessuna riga" trasformerebbe un guasto in un 404.
      if (!Array.isArray(data)) {
        throw new SiteReaderQueryError(query.relation, "risposta senza righe utilizzabili");
      }
      return data;
    },
  };
}
