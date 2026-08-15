// Porta di trasporto dell'adattatore: "leggi righe da una proiezione pubblica".
//
// Sta *sotto* `SiteReader`, non accanto: `SiteReader` parla di superfici (LISTEN, EPK),
// questa parla di righe. Separarle serve a una cosa sola, e concreta: la mappatura da
// riga a superficie resta pura e provabile con un doppio, mentre l'unico pezzo che
// conosce PostgREST è il modulo che traduce `RowQuery` in una catena di chiamate.
//
// `PublicRelation` è un'unione chiusa e questo è il presidio più economico del filone:
// l'adattatore **non può compilare** una query verso `sites`, `site_contacts` o
// qualunque tabella base. Le sole relazioni nominabili sono le dieci proiezioni
// pubbliche della migrazione 20260815170304, che filtrano già `published`, righe
// purgate e consenso confermato.

/** Le sole relazioni leggibili da `anon` (migrazioni PR-0 righe 262-263 e 20260815170304). */
export type PublicRelation =
  | "public_sites"
  | "public_tracks"
  | "public_assets"
  | "public_posts"
  | "public_links"
  | "public_press"
  | "public_dates"
  | "public_metrics"
  | "public_contacts"
  | "public_site_meta";

export type RowFilter = { readonly column: string; readonly value: string };
export type RowOrder = { readonly column: string; readonly ascending: boolean };

/**
 * Descrizione dichiarativa di una lettura. Le colonne sono esplicite e mai `*`:
 * ciò che non viene chiesto non può tornare indietro, nemmeno se un giorno una vista
 * venisse ampliata per sbaglio.
 */
export type RowQuery = {
  readonly relation: PublicRelation;
  readonly columns: readonly string[];
  readonly filters?: readonly RowFilter[];
  readonly order?: readonly RowOrder[];
  readonly limit?: number;
};

export interface PublicRowSource {
  fetchRows(query: RowQuery): Promise<readonly unknown[]>;
}

/** Il trasporto ha fallito: rete, privilegi, relazione inesistente. Non è "nessuna riga". */
export class SiteReaderQueryError extends Error {
  readonly relation: PublicRelation;

  constructor(relation: PublicRelation, detail: string) {
    super(`Lettura di ${relation} fallita: ${detail}`);
    this.name = "SiteReaderQueryError";
    this.relation = relation;
  }
}

/** Forma canonica della `select` PostgREST a partire dalle colonne dichiarate. */
export function selectList(columns: readonly string[]): string {
  return columns.join(",");
}
