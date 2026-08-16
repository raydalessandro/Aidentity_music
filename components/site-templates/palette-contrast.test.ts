// L'acid non è un colore di testo.
//
// Difetto trovato dalla CI su Unica, e vale per ogni template futuro. Il sistema
// di palette garantisce `acidInk` — il testo leggibile **sopra** una superficie
// acid, scelto da `readableInkOn`. Non garantisce il contrario: che l'acid sia
// leggibile **come** testo sopra paper o panel. Su `ember` l'acid è scuro
// (`#A8440B`) e axe ha misurato 3.03:1 su paper e 2.54:1 su panel, contro i 4.5
// richiesti.
//
// La lezione non è «cambia quei due colori»: è che un template non può scegliere
// un token qualsiasi per il testo, perché i token non sono tutti garantiti su
// tutte e quattro le palette. Questo file misura quali lo sono, e vieta l'uso di
// quelli che non lo sono nei fogli dei template.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "../../app/[slug]/read-model";
import { shellPalettes } from "../site-shell/palettes";

const cartella = fileURLToPath(new URL("./", import.meta.url));
const SOGLIA = 4.5;

/** I token che un template può usare come colore del testo, e su quali superfici. */
const SUPERFICI = ["paper", "panel"] as const;

describe("quali token reggono come testo su TUTTE le palette", () => {
  // `dim` NON è nell'elenco, e l'ho scoperto scrivendo questo banco invece che
  // deducendolo: su `nocturne` dà 4.31:1 sul panel. Sembra un token «di servizio»
  // sicuro e non lo è. È esattamente il tipo di cosa che un template sceglie a
  // occhio e che si manifesta su una palette sola.
  it.each(["ink", "muted"] as const)("%s è leggibile ovunque", (token) => {
    for (const palette of shellPalettes) {
      for (const superficie of SUPERFICI) {
        const rapporto = contrastRatio(palette[token], palette[superficie]);
        expect(
          rapporto,
          `${token} su ${superficie} nella palette ${palette.id}`,
        ).toBeGreaterThanOrEqual(SOGLIA);
      }
    }
  });

  // Nota per chi legge il codice e questo banco insieme: il dock di Unica usa
  // `--dim`, ma su `paper` (dove il peggiore è 4.85) e non su `panel`. Non è una
  // contraddizione — è la ragione per cui qui non c'è un divieto su `dim` come
  // c'è su `acid`: dipende dalla superficie, e va misurato caso per caso.
  it("`dim` è al di sotto della soglia su almeno una palette: non è un token da testo", () => {
    const peggiore = Math.min(
      ...shellPalettes.flatMap((palette) =>
        SUPERFICI.map((superficie) => contrastRatio(palette.dim, palette[superficie])),
      ),
    );
    expect(peggiore).toBeLessThan(SOGLIA);
  });

  it("`acid` invece NO, ed è il motivo per cui questo file esiste", () => {
    // Il caso che DEVE fallire: se un giorno tutte le palette avessero un acid
    // leggibile, questo banco diventerebbe rosso e il divieto sotto andrebbe
    // riconsiderato invece di restare per inerzia.
    const peggiore = Math.min(
      ...shellPalettes.flatMap((palette) =>
        SUPERFICI.map((superficie) => contrastRatio(palette.acid, palette[superficie])),
      ),
    );
    expect(peggiore).toBeLessThan(SOGLIA);
  });

  it("`acidInk` regge sopra l'acid: è la garanzia che il sistema dà davvero", () => {
    for (const palette of shellPalettes) {
      expect(contrastRatio(palette.acidInk, palette.acid), palette.id).toBeGreaterThanOrEqual(SOGLIA);
    }
  });
});

describe("nessun foglio di template usa l'acid come colore del testo", () => {
  // Si cercano i fogli, non si elencano: un template nuovo non può sfuggire.
  const fogli = readdirSync(cartella).filter((nome) => nome.endsWith(".module.css"));

  it("ne trova almeno uno: un controllo che non guarda nulla passerebbe sempre", () => {
    expect(fogli.length).toBeGreaterThan(0);
  });

  it.each(fogli)("%s", (foglio) => {
    const sorgente = readFileSync(join(cartella, foglio), "utf8");
    const blocchi = sorgente.split("}");
    const colpevoli: string[] = [];

    for (const blocco of blocchi) {
      if (!/(^|;|\{)\s*color:\s*var\(--acid\)/u.test(blocco)) continue;
      // Un elemento puramente decorativo non porta testo: la regola sul contrasto
      // non lo riguarda, e nel markup è marcato `aria-hidden`.
      const selettore = blocco.split("{")[0]?.trim() ?? "";
      if (/Motif|Grid|Shade|Orbit|Art/u.test(selettore)) continue;
      colpevoli.push(selettore);
    }

    expect(
      colpevoli,
      "usa --muted, --dim o --ink: l'acid non è garantito come testo su ember",
    ).toEqual([]);
  });
});
