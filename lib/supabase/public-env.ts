import { z } from "zod";

/**
 * Variabili pubbliche: possono finire nel bundle client per definizione.
 * Sono lette lazy, mai al caricamento del modulo, perche' `next build` gira
 * anche senza `.env` (la CI non ha e non deve avere segreti).
 *
 * `process.env.NEXT_PUBLIC_*` va scritto letteralmente: Next sostituisce il
 * testo esatto, non l'accesso dinamico.
 */
/**
 * Host su cui `http://` è accettabile. Non è una lista di comodo: sono gli indirizzi che
 * non escono dalla macchina, dove non esiste una rete su cui intercettare o degradare la
 * connessione. Tutto ciò che non è qui dentro deve essere HTTPS.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * HTTPS obbligatorio, tranne sul loopback.
 *
 * Perché l'eccezione esiste — e perché è nata da un rosso vero. Lo stack locale della CLI
 * Supabase serve la propria API su `http://127.0.0.1:54321`: non ha, e non può avere, un
 * certificato. Con il vincolo `https://` secco, in CI **nessun client server si costruiva**:
 * `createSupabaseServiceRoleClient()` lanciava, la route media rispondeva 500 «media non
 * configurato» a qualunque richiesta — comprese quelle che devono essere negate — e
 * `registerSiteReader` falliva in silenzio, lasciando ogni slug a 404. Nessun test se ne era
 * accorto perché nessun test leggeva ancora dal database.
 *
 * Misurato: `next dev` con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` rispondeva
 * `500 {"error":"media non configurato"}`, e il log del server riportava proprio questo
 * messaggio di configurazione.
 *
 * L'eccezione è più stretta di «accetta http»: un `http://progetto.supabase.co` resta
 * rifiutato, ed esiste un test che lo verifica. Ciò che si concede è soltanto l'indirizzo
 * che per definizione non attraversa una rete.
 */
function isAcceptableSupabaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}

const publicEnvSchema = z.object({
  supabaseUrl: z.url().refine(isAcceptableSupabaseUrl, {
    message: "deve essere HTTPS, oppure HTTP su loopback per lo stack locale",
  }),
  supabaseAnonKey: z.string().trim().min(1),
});

export type PublicSupabaseEnv = z.infer<typeof publicEnvSchema>;

export function readPublicSupabaseEnv(): PublicSupabaseEnv {
  const parsed = publicEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Configurazione Supabase pubblica mancante o non valida: servono NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return parsed.data;
}

/** URL assoluto dell'applicazione, usato per i redirect di auth e Stripe. */
export function readSiteUrl(): string {
  const parsed = z.url().startsWith("http").safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if (!parsed.success) {
    throw new Error("NEXT_PUBLIC_SITE_URL mancante o non valida.");
  }
  return parsed.data.replace(/\/+$/, "");
}
