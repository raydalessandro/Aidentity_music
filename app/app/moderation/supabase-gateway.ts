// ADATTATORE — l'unico file del filone moderazione che conosce Supabase.
//
// Regola non negoziabile: **la sessione dell'utente, mai `service_role`.**
// `public.moderate_site` è `security definer` e la sua guardia è
// `private.is_platform_admin()`, che legge `(select auth.uid())`. Con il client
// privilegiato `auth.uid()` è nullo: la chiamata verrebbe rifiutata, e l'unico modo per
// «farla funzionare» sarebbe togliere la guardia — cioè trasformare la superficie in un
// buco. Qui si usa `createSupabaseServerClient()`, che porta la chiave anon e i cookie di
// sessione: RLS e guardia restano in piedi e l'identità è quella di chi ha premuto il
// pulsante. `no-service-role.test.ts` misura che nessun file di questo filone importi il
// client privilegiato.
//
// Questo file non prende decisioni: non sa cosa sia un esito, non sa cosa sia una coda,
// non conosce nessuno SQLSTATE. Traduce e basta. `supabase-gateway.test.ts` legge il
// sorgente e fallisce se una regola ricompare qui dentro, dove nessun test la eseguirebbe.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ModerationCommand,
  ModerationGateway,
  ModerationQueueSource,
  PlatformAdmin,
  RpcFailure,
} from "../../../lib/moderation/types";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const EMPTY_QUEUE: ModerationQueueSource = { sites: [], subscriptions: [] };

export function createSupabaseModerationGateway(): ModerationGateway {
  // Un solo client per richiesta, creato al primo uso: la pagina chiede l'amministratore e
  // poi la coda, e ricrearlo due volte significherebbe rileggere i cookie due volte.
  let pending: Promise<SupabaseClient> | null = null;
  const client = (): Promise<SupabaseClient> => (pending ??= createSupabaseServerClient());

  return {
    async currentAdmin(): Promise<PlatformAdmin | null> {
      try {
        const supabase = await client();
        const { data, error } = await supabase.auth.getUser();
        const user = data.user;
        if (error !== null || user === null) return null;

        // La verifica sta nel database, non qui: `public.platform_admins` ha RLS e FORCE
        // RLS con una sola policy di `select` sotto `private.is_platform_admin()`. Per
        // chiunque non sia amministratore la riga semplicemente non esiste — non è una
        // condizione che l'applicazione potrebbe dimenticare di controllare.
        const admin = await supabase
          .from("platform_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (admin.error !== null || admin.data === null) return null;
        return { userId: user.id };
      } catch {
        // Ambiente incompleto, rete assente, sessione illeggibile: casi diversi, stessa
        // risposta. Fail closed.
        return null;
      }
    },

    async listQueue(): Promise<ModerationQueueSource> {
      try {
        const supabase = await client();
        const [sites, subscriptions] = await Promise.all([
          supabase
            .from("sites")
            .select("id,slug,publication_status,created_at,moderation_reason")
            .order("created_at", { ascending: true }),
          supabase.from("site_subscriptions").select("site_id,billing_status"),
        ]);
        return {
          sites: sites.data ?? [],
          subscriptions: subscriptions.data ?? [],
        };
      } catch {
        return EMPTY_QUEUE;
      }
    },

    async moderate(command: ModerationCommand): Promise<RpcFailure | null> {
      try {
        const supabase = await client();
        const { error } = await supabase.rpc("moderate_site", {
          target: command.target,
          action: command.action,
          reason: command.reason,
        });
        if (error === null) return null;
        return { code: error.code ?? null, message: error.message };
      } catch (thrown) {
        // Un'eccezione qui non è un successo. Senza questo ramo risalirebbe fino alla
        // pagina di errore di Next, che non dice nulla su cosa sia successo al sito;
        // tradotta in esito diventa «errore, nulla è cambiato», che è la verità.
        return { code: null, message: thrown instanceof Error ? thrown.message : "rpc fallita" };
      }
    },
  };
}
