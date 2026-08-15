import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { readPublicSupabaseEnv } from "./public-env";

/**
 * Client `service_role`. L0.7 §6.9: non appare mai nel client, nei log o nel
 * repository.
 *
 * Tre difese, non una:
 *   1. `import "server-only"` — Next fa fallire il BUILD se questo modulo
 *      entra nel grafo di un Client Component;
 *   2. la chiave non ha prefisso `NEXT_PUBLIC_`, quindi non viene inlinata
 *      nel bundle nemmeno per errore;
 *   3. guardia a runtime su `window`, per il caso in cui qualcuno aggiri le
 *      prime due (per esempio con un bundler diverso).
 *
 * Non e' memoizzato di proposito: chi lo usa deve farlo in un percorso
 * server esplicito e breve, non tenerselo in un modulo condiviso.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("Il client service_role non puo' essere costruito nel browser.");
  }

  const { supabaseUrl } = readPublicSupabaseEnv();
  const key = z.string().trim().min(1).safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key.success) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante.");
  }

  return createClient(supabaseUrl, key.data, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
