// PRESIDIO ARCHITETTURALE — la moderazione passa dalla sessione, mai da `service_role`.
//
// Non è una preferenza di stile: `public.moderate_site` è `security definer` e la sua prima
// riga è `if not private.is_platform_admin() then raise ... 42501`. Quella guardia legge
// `(select auth.uid())`. Con il client privilegiato `auth.uid()` è nullo — la chiamata
// verrebbe rifiutata, e l'unico modo per «farla funzionare» sarebbe togliere la guardia,
// cioè consegnare a chiunque raggiunga l'endpoint il potere di pubblicare e sospendere
// qualunque sito. Il giorno in cui qualcuno, per far passare un test, importerà qui il
// client privilegiato, è questo file a doverlo fermare.
//
// Il testo viene privato dei commenti prima del controllo: qui si parla di codice, non di
// ciò che i commenti nominano — questo stesso file non passerebbe altrimenti. Le righe `//`
// vanno tolte **prima** dei blocchi `/* … *\/`, per il motivo misurato in
// `lib/media/route-shell.test.ts`.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Il perimetro del filone: l'area e la libreria che la serve. */
const perimetro = [join(repoRoot, "app", "app", "moderation"), join(repoRoot, "lib", "moderation")];

/**
 * Si scandiscono i sorgenti del prodotto, non i banchi: un file `*.test.ts` non finisce nel
 * build e questo stesso file nomina i termini vietati per poterli cercare. La cartella viene
 * letta a ogni esecuzione, quindi un file nuovo entra nel presidio senza che nessuno debba
 * ricordarsene.
 */
function sorgenti(): readonly { path: string; code: string }[] {
  return perimetro.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => ({
        path: join(dir, name),
        code: senzaCommenti(readFileSync(join(dir, name), "utf8")),
      })),
  );
}

function senzaCommenti(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const files = sorgenti();

describe("il perimetro della moderazione", () => {
  it("contiene i file che ci si aspetta (se il perimetro si svuota, il presidio non prova nulla)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(["service-role", "service_role", "SERVICE_ROLE", "createSupabaseServiceRoleClient"])(
    "non nomina %s in nessun file",
    (termine) => {
      for (const file of files) {
        expect(file.code, `${file.path} nomina ${termine}`).not.toContain(termine);
      }
    },
  );

  /**
   * L'unico file autorizzato a conoscere Supabase è l'adattatore. La pagina e le azioni
   * parlano soltanto con la porta: se importassero un client, la superficie smetterebbe di
   * essere sostituibile e i test smetterebbero di poterla eseguire.
   */
  it("solo l'adattatore importa lib/supabase", () => {
    const importatori = files
      .filter((file) => /from\s+"[^"]*lib\/supabase/.test(file.code))
      .map((file) => file.path.split("/").slice(-1)[0]);
    expect(importatori).toEqual(["supabase-gateway.ts"]);
  });

  /** La chiave anon con i cookie della richiesta: è quella che porta `auth.uid()`. */
  it("l'adattatore usa il client di sessione", () => {
    const adattatore = files.find((file) => file.path.endsWith("supabase-gateway.ts"));
    expect(adattatore?.code).toContain("createSupabaseServerClient");
  });
});
