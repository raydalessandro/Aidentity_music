// L'adattatore è un guscio, e questo test è ciò che lo tiene tale.
//
// `supabase-gateway.ts` non è eseguibile in vitest: importa `lib/supabase/server.ts`, che
// apre con `import "server-only"` — un pacchetto che esiste solo dentro il build di Next
// (misurato: da vitest, `import("server-only")` fallisce con «Cannot find package»). È un
// limite dichiarato: quelle righe non sono coperte da un test che le esegua. Ciò che si può
// presidiare, e che qui si presidia, è che non contengano **nessuna decisione**: se una
// regola di sicurezza o una traduzione di esito ricomparisse lì dentro, vivrebbe in un
// punto non eseguibile dai test, cioè in un punto dove può divergere in silenzio da ciò che
// `outcome.ts`, `command.ts` e `queue.ts` dimostrano.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./supabase-gateway.ts", import.meta.url)),
  "utf8",
);

const code = source
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("l'adattatore traduce e basta", () => {
  it.each([
    { termine: "42501", perche: "la classificazione degli SQLSTATE sta in outcome.ts" },
    { termine: "23514", perche: "idem" },
    { termine: "invalid moderation transition", perche: "idem" },
    { termine: "reason required", perche: "il rifiuto della motivazione sta in command.ts" },
    { termine: "notFound", perche: "il 404 è una decisione della pagina e delle azioni" },
    { termine: "redirect", perche: "idem" },
    { termine: "publication_status ==", perche: "l'ordine e i filtri della coda stanno in queue.ts" },
    { termine: "trialing", perche: "cosa sia un abbonamento valido lo decide il database" },
    { termine: "btrim", perche: "la motivazione è già validata quando arriva qui" },
    { termine: ".trim()", perche: "idem" },
  ])("non nomina $termine — $perche", ({ termine }) => {
    expect(code).not.toContain(termine);
  });

  it("chiama la RPC con i tre argomenti del contratto, e nessun altro", () => {
    expect(code).toContain('supabase.rpc("moderate_site"');
    for (const argomento of ["target:", "action:", "reason:"]) {
      expect(code).toContain(argomento);
    }
  });

  /**
   * Il fallimento della lettura non è un permesso. Senza i rami di fallback, un errore di
   * rete lascerebbe risalire un'eccezione e — a seconda di chi la cattura — potrebbe
   * diventare una pagina che si apre invece di una che non esiste.
   */
  it("torna null quando l'identità non è dimostrata, invece di lasciar passare", () => {
    expect(code).toContain("return null");
    expect(code).toContain("catch");
  });

  it("non costruisce il client al caricamento del modulo", () => {
    // Un client creato al livello di modulo leggerebbe i cookie fuori dalla richiesta.
    expect(/^(?:const|let|var)\s+\w+\s*=\s*await?\s*createSupabaseServerClient\(/m.test(code)).toBe(
      false,
    );
  });
});
