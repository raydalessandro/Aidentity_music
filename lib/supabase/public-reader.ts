import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readPublicSupabaseEnv } from "./public-env";

/**
 * Client server di sola lettura pubblica.
 *
 * Serve alle superfici pubbliche rese in SSR: legge con la chiave `anon`,
 * quindi vede esclusivamente cio' che RLS concede all'anonimo (le proiezioni
 * dei siti `published`).
 *
 * Tre cose che NON fa, di proposito:
 *   - non tocca i cookie e non porta con se' la sessione dell'utente: due
 *     richieste diverse ottengono la stessa identita' anonima, quindi la
 *     risposta e' cacheable e non puo' trapelare il draft di nessuno;
 *   - non conosce `service_role`;
 *   - non definisce nessuna interfaccia di lettura di dominio. E' un mattone
 *     da avvolgere in un adattatore, non una porta.
 *
 * Essendo privo di stato di sessione puo' essere riusato nel processo.
 */
let cached: SupabaseClient | null = null;

export function createSupabasePublicReaderClient(): SupabaseClient {
  if (cached) return cached;

  const { supabaseUrl, supabaseAnonKey } = readPublicSupabaseEnv();
  cached = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
