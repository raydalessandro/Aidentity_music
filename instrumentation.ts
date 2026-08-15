// Punto di composizione dell'applicazione: qui l'adattatore del filone B entra nella porta
// del filone D, una volta sola, all'avvio del processo server.
//
// ── Perché `instrumentation.ts` e non un'altra sede ──────────────────────────────────────
//
// Il vincolo è duplice: la registrazione deve avvenire **prima** che la prima richiesta
// raggiunga una route, e **fuori** da `app/[slug]/**`. Le alternative considerate:
//
//   - `app/layout.tsx` (o un modulo importato da lì): gira per richiesta, non all'avvio, e
//     lega l'inizializzazione a un albero di render. Non copre `sitemap.ts` né `robots.ts`,
//     che non passano dal layout.
//   - un import per effetto collaterale dentro `app/[slug]/composition.ts`: è esattamente
//     ciò che il presidio architetturale vieta — l'import risalirebbe fino al client Supabase.
//   - `middleware.ts`: gira nel runtime edge e non su tutte le richieste; usarlo per
//     inizializzare lo stato del server sarebbe un effetto collaterale nel posto sbagliato.
//   - registrazione pigra al primo uso dentro i loader: renderebbe `composition.ts`
//     conoscitore di un'implementazione concreta, cioè romperebbe la porta.
//
// `instrumentation.ts` è l'unico gancio di Next 16 che sia *per processo*, che venga
// eseguito prima di servire e che stia alla radice, fuori dal perimetro presidiato.
//
// L'import è dinamico e successivo alla guardia sul runtime: `lib/supabase/public-reader.ts`
// apre con `import "server-only"` e non ha senso nel runtime edge. Con la guardia davanti,
// il modulo non entra nemmeno nel grafo di quel runtime.
//
// ── Il dettaglio che rende la scelta praticabile ─────────────────────────────────────────
//
// Misurato su Next 16.3.1 (Turbopack, `next build && next start`): l'instrumentation e le
// route caricano **due istanze distinte** di `app/[slug]/composition.ts` nello stesso
// processo. Finché lo stato del bordo stava in una variabile di modulo, la registrazione
// fatta qui era invisibile alle route e ogni slug restava 404 pur risultando registrato.
// Il bordo tiene ora il riferimento nel registro globale dei simboli, che è per realm:
// vedi il commento in `app/[slug]/composition.ts` e il test di regressione in
// `lib/site-reader/registration.test.ts`.
//
// Limite noto e misurato: `register()` **non** viene eseguito dai worker di generazione
// statica durante `next build`. `app/sitemap.ts` ha `revalidate = 3600`, quindi il file
// prodotto dal build è vuoto e si popola alla prima rigenerazione, che avviene nel processo
// del server. Nessuna riga di questo filone può cambiarlo: la sitemap è del filone D.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ createSupabasePublicReaderClient }, { bridgeSupabaseClient }, { registerSiteReader }] =
    await Promise.all([
      import("./lib/supabase/public-reader"),
      import("./lib/site-reader/postgrest-row-source"),
      import("./lib/site-reader/registration"),
    ]);

  const outcome = registerSiteReader(() =>
    bridgeSupabaseClient(createSupabasePublicReaderClient()),
  );
  if (!outcome.registered) {
    // Non è un `throw`: senza configurazione pubblica il server resta in piedi e ogni slug
    // risponde 404, che è il comportamento del lettore neutro. Il motivo però deve essere
    // leggibile in un log, altrimenti "il sito dà 404" diventa un mistero.
    console.warn("[site-reader] adattatore non registrato", {
      reason: outcome.reason,
      detail: outcome.detail,
    });
  }
}
