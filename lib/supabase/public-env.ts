import { z } from "zod";

/**
 * Variabili pubbliche: possono finire nel bundle client per definizione.
 * Sono lette lazy, mai al caricamento del modulo, perche' `next build` gira
 * anche senza `.env` (la CI non ha e non deve avere segreti).
 *
 * `process.env.NEXT_PUBLIC_*` va scritto letteralmente: Next sostituisce il
 * testo esatto, non l'accesso dinamico.
 */
const publicEnvSchema = z.object({
  supabaseUrl: z.url().startsWith("https://"),
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
