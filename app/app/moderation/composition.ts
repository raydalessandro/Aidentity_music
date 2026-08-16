// BORDO DI COMPOSIZIONE dell'area di moderazione: l'unico punto che risolve
// un'implementazione concreta della porta `ModerationGateway`.
//
// Perché esiste, dato che `app/app/wizard/page.tsx` importa il client Supabase
// direttamente: perché l'invariante che questo filone deve dimostrare è «chi non è
// amministratore riceve 404», e una dimostrazione che non esegue la pagina non è una
// dimostrazione. `lib/supabase/server.ts` apre con `import "server-only"`, un pacchetto che
// esiste solo dentro il build di Next: misurato in questo repo, `import("server-only")` da
// vitest fallisce con «Cannot find package 'server-only'», e così anche l'alias `@/…`
// (non c'è `vitest.config.*`, quindi nessuno risolve i path di tsconfig). Con l'import
// statico dell'adattatore dentro la pagina, `page.test.tsx` non potrebbe nemmeno caricarla.
//
// L'adattatore entra quindi da un `import()` **dentro una funzione**: non è nel grafo
// statico della pagina, i test iniettano uno stub e quel modulo non viene mai caricato,
// mentre in produzione viene caricato alla prima richiesta.
//
// Il riferimento vive nel registro globale dei simboli e non in una variabile di modulo,
// per la stessa ragione misurata in `app/[slug]/composition.ts`: su Next 16 con Turbopack
// lo stesso modulo può essere caricato in più istanze dentro lo stesso processo, e uno
// stato di modulo scritto da un'istanza sarebbe invisibile all'altra.

import type { ModerationGateway } from "../../../lib/moderation/types";

type GatewaySlot = { gateway: ModerationGateway | null };

const SLOT_KEY = Symbol.for("aidentity.moderation-gateway");
const globalSlots = globalThis as unknown as Record<symbol, GatewaySlot | undefined>;

function slot(): GatewaySlot {
  const existing = globalSlots[SLOT_KEY];
  if (existing !== undefined) return existing;
  const created: GatewaySlot = { gateway: null };
  globalSlots[SLOT_KEY] = created;
  return created;
}

/** Iniezione esplicita. Serve ai test, non al prodotto. */
export function configureModerationGateway(gateway: ModerationGateway): void {
  slot().gateway = gateway;
}

/** Ripristina l'adattatore reale. Serve ai test, non al prodotto. */
export function resetModerationGateway(): void {
  slot().gateway = null;
}

/**
 * La porta risolta. Una istanza per chiamata: il client Supabase dell'adattatore è legato
 * ai cookie della richiesta in corso e non va mai condiviso fra richieste.
 */
export async function moderationGateway(): Promise<ModerationGateway> {
  const injected = slot().gateway;
  if (injected !== null) return injected;
  const { createSupabaseModerationGateway } = await import("./supabase-gateway");
  return createSupabaseModerationGateway();
}
