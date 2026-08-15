// La route è un guscio, e questo test è ciò che la tiene tale.
//
// `app/api/media/[kind]/[siteId]/[id]/route.ts` non è eseguibile in vitest: importa
// `lib/supabase/service-role.ts`, che apre con `import "server-only"` — un alias risolto
// soltanto dentro il build di Next. È un limite dichiarato: quelle venti righe non sono
// coperte da un test che le esegua. Ciò che si può presidiare, e che qui si presidia, è che
// non contengano nessuna decisione: se una regola di sicurezza ricomparisse lì dentro,
// vivrebbe in un punto non eseguibile dai test, cioè in un punto dove può divergere.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const routePath = join(repoRoot, "app", "api", "media", "[kind]", "[siteId]", "[id]", "route.ts");
const source = readFileSync(routePath, "utf8");

/**
 * Il testo senza commenti: qui si parla di codice, non di ciò che i commenti nominano.
 *
 * Le righe `//` vanno tolte **prima** dei blocchi `/* … *\/`, non dopo: un commento di riga
 * che contenga un glob come `app/api/**` apre una sequenza `/*` che il secondo passaggio
 * chiuderebbe alla prima fine-blocco successiva, mangiandosi gli import e le direttive di
 * runtime. Misurato: con l'ordine invertito questo file dichiarava assente
 * `export const runtime`, che invece c'è.
 */
const code = source
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("il guscio della route non decide nulla", () => {
  it("delega a handleMediaRequest", () => {
    expect(code).toContain("handleMediaRequest");
  });

  it.each([
    "publication_status",
    "published",
    "purged_at",
    "purgedAt",
    "storage_path",
    "storagePath",
    "createSignedUrl",
  ])("non nomina %s: quel giudizio sta in lib/media", (termine) => {
    expect(code).not.toContain(termine);
  });

  it("non compone risposte proprie oltre alla conversione del risultato", () => {
    // Un solo `status:` — quello che rilancia lo status deciso da `handleMediaRequest`.
    const statusLiterals = [...code.matchAll(/status:\s*(\d+)/g)];
    expect(statusLiterals).toEqual([]);
  });

  it("costruisce il client privilegiato dentro una funzione, non al caricamento", () => {
    // `createSupabaseServiceRoleClient()` al livello di modulo leggerebbe l'ambiente al
    // primo import, anche per una richiesta che verrà rifiutata come malformata.
    // Niente `\s*` iniziale: con il flag `m` divorerebbe le andate a capo e finirebbe per
    // combaciare con la riga indentata **dentro** `deps()`, cioè con il caso corretto.
    const topLevelCall = /^(?:const|let|var)\s+\w+\s*=\s*createSupabaseServiceRoleClient\(/m;
    expect(topLevelCall.test(code)).toBe(false);
    expect(code).toContain("function deps()");
  });

  it("è una route di sola lettura: nessun verbo che scriva", () => {
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(code).not.toContain(`export async function ${verbo}`);
    }
    expect(code).toContain("export async function GET");
  });

  it("gira nel runtime nodejs: server-only e service_role non esistono nell'edge", () => {
    expect(code).toContain('export const runtime = "nodejs"');
  });
});
