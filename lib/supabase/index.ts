/**
 * Mappa dei client Supabase. Ogni client va importato dal suo percorso, mai da
 * qui: `import "server-only"` protegge il modulo che lo dichiara, e un barrel
 * che ri-esporta tutto lo aggirerebbe.
 *
 *   ./client         createSupabaseBrowserClient()          browser, chiave anon
 *   ./server         createSupabaseServerClient()           SSR con sessione su cookie
 *   ./server         createSupabaseRouteHandlerClient()     idem, legato a una risposta
 *   ./public-reader  createSupabasePublicReaderClient()     SSR anonimo, senza sessione
 *   ./service-role   createSupabaseServiceRoleClient()      server-only, mai nel bundle
 *
 * Qui vive soltanto la lettura delle variabili pubbliche, che e' sicura da
 * entrambi i lati.
 *
 * Nessuna interfaccia di lettura di dominio abita questo modulo: la porta la
 * definisce il consumatore (filone D), qui ci sono i mattoni per l'adattatore.
 */
export { readPublicSupabaseEnv, readSiteUrl, type PublicSupabaseEnv } from "./public-env";
