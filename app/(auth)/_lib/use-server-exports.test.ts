// Un file `"use server"` puo' esportare SOLTANTO funzioni asincrone.
//
// Questo presidio nasce da un difetto arrivato in produzione con la CI verde.
// `app/(auth)/login/actions.ts` esportava `initialMagicLinkState`, un oggetto, e
// Next rifiutava il modulo a runtime:
//
//   POST /login 500
//   Error: A "use server" file can only export async functions, found object.
//
// Quindi ogni richiesta di accesso rispondeva 500: il magic link non ha MAI
// funzionato in produzione. `next build` passava, la suite unitaria passava, e
// l'unico posto dove il difetto esisteva era il runtime.
//
// Perche' un controllo sul sorgente e non un import: un file `"use server"` di
// questo progetto importa `lib/supabase/server.ts`, che apre con
// `import "server-only"` e non risolve fuori da Next. Importarlo qui non e'
// possibile — ed e' proprio la ragione per cui il difetto non era coperto.
//
// Il controllo e' esaustivo per costruzione: cerca i file, non li elenca. Un
// file `"use server"` nuovo non puo' sfuggirgli senza che qualcuno passi di qui.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const radice = fileURLToPath(new URL("../../../", import.meta.url));

/** Nessuna dipendenza da un pacchetto di glob: `node:fs` basta e non puo' sparire. */
function sorgenti(cartella: string, raccolti: string[] = []): string[] {
  for (const voce of readdirSync(join(radice, cartella), { withFileTypes: true })) {
    if (voce.name === "node_modules" || voce.name.startsWith(".")) continue;
    const relativo = `${cartella}/${voce.name}`;
    if (voce.isDirectory()) sorgenti(relativo, raccolti);
    else if (/\.tsx?$/u.test(voce.name) && !/\.test\.tsx?$/u.test(voce.name)) raccolti.push(relativo);
  }
  return raccolti;
}

function fileConUseServer(): readonly string[] {
  return [...sorgenti("app"), ...sorgenti("lib")].filter((relativo) => {
    const testa = readFileSync(join(radice, relativo), "utf8").slice(0, 200);
    return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/u.test(testa);
  });
}

/**
 * Le esportazioni che non sono funzioni asincrone. I tipi non contano: sono
 * cancellati alla compilazione e non arrivano mai al runtime che si lamenta.
 */
function esportazioniNonAmmesse(sorgente: string): readonly string[] {
  const colpevoli: string[] = [];
  for (const riga of sorgente.split("\n")) {
    const testo = riga.trim();
    if (!testo.startsWith("export")) continue;
    if (/^export\s+(?:type|interface)\b/u.test(testo)) continue;
    if (/^export\s+async\s+function\b/u.test(testo)) continue;
    if (/^export\s+\{\s*type\s/u.test(testo)) continue;
    colpevoli.push(testo);
  }
  return colpevoli;
}

describe("i file «use server» esportano soltanto funzioni asincrone", () => {
  const file = fileConUseServer();

  it("ne trova almeno uno: un controllo che non guarda nulla passerebbe sempre", () => {
    expect(file.length).toBeGreaterThan(0);
  });

  it.each(file)("%s", (relativo) => {
    const sorgente = readFileSync(join(radice, relativo), "utf8");
    expect(esportazioniNonAmmesse(sorgente)).toEqual([]);
  });

  it("riconosce come colpevole una costante esportata, che e' il difetto vero", () => {
    // Il caso che DEVE essere rifiutato, scritto per esteso: senza questo, un
    // controllo che non riconosce nulla resterebbe verde su tutti i file.
    const finto = [
      '"use server";',
      "export type Stato = { status: string };",
      "export const STATO_INIZIALE: Stato = { status: 'idle' };",
      "export async function azione() { return null; }",
    ].join("\n");
    expect(esportazioniNonAmmesse(finto)).toEqual([
      "export const STATO_INIZIALE: Stato = { status: 'idle' };",
    ]);
  });

  it("non accusa una funzione sincrona esportata? no: la accusa, ed e' giusto", () => {
    const finto = ['"use server";', "export function nonAsincrona() { return 1; }"].join("\n");
    expect(esportazioniNonAmmesse(finto)).toHaveLength(1);
  });
});
