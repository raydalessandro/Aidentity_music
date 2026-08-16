// Il testo di default deve essere leggibile sul fondo di default.
//
// Difetto reale, osservato in produzione: `html` dichiarava `background: #0b0d10`
// e `body` non dichiarava alcun `color`, quindi il testo ereditava il nero di
// default del browser. Ogni pagina senza uno stile proprio era illeggibile — su
// `/login` restavano visibili soltanto il campo di input e il pulsante, e con
// loro spariva anche il messaggio che spiegava l'errore.
//
// Qui non si confronta una stringa: si legge la coppia di colori dal CSS e si
// misura il rapporto, con la stessa funzione che il renderer usa per le palette.
// Un banco che cercasse `color:` resterebbe verde davanti a un grigio scurissimo.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./[slug]/read-model";

// I commenti si tolgono prima di analizzare: un commento fra due blocchi
// spezzerebbe il riconoscimento del selettore, e un colore citato dentro un
// commento non e' una dichiarazione.
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

/** Il valore dichiarato per una proprieta' dentro un selettore di primo livello. */
function dichiarazione(selettore: string, proprieta: string): string | null {
  const blocco = new RegExp(`(?:^|\\})\\s*${selettore}\\s*\\{([^}]*)\\}`, "u").exec(css);
  if (blocco === null) return null;
  const trovata = new RegExp(`(?:^|;)\\s*${proprieta}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*(?:;|$)`, "u")
    .exec(blocco[1] ?? "");
  return trovata?.[1] ?? null;
}

describe("il testo di default e' leggibile sul fondo di default", () => {
  const fondo = dichiarazione("html", "background");
  const testo = dichiarazione("body", "color");

  it("`html` dichiara un fondo", () => {
    expect(fondo).not.toBeNull();
  });

  it("`body` dichiara un colore del testo: senza, eredita il nero del browser", () => {
    expect(testo).not.toBeNull();
  });

  it("i due colori stanno sopra 4.5:1", () => {
    // Il difetto reale dava 1.00 — nero su nero.
    expect(contrastRatio(testo ?? "#000000", fondo ?? "#000000")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("la superficie di accesso resta leggibile", () => {
  const fondo = dichiarazione("html", "background") ?? "#0b0d10";

  // Ogni riga dichiara cosa sarebbe illeggibile se il colore cambiasse.
  it.each([
    [".auth-form label", "le etichette dei campi"],
    [".auth-esito", "l'esito dell'accesso"],
    [".auth-nota", "il requisito sulla password"],
    [".auth-esito-errore", "il messaggio di errore"],
    [".auth-alternativa", "il rimando fra accesso e registrazione"],
  ])("%s — %s", (selettore) => {
    const colore = dichiarazione(selettore.replace(/[.]/gu, "\\."), "color");
    expect(colore, `${selettore} non dichiara un colore`).not.toBeNull();
    expect(contrastRatio(colore ?? "#000000", fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it("il bordo del campo si distingue dal fondo: e' un componente, non testo", () => {
    // WCAG 1.4.11 chiede 3:1 per i confini dei controlli. Il primo valore scelto
    // dava 1.96 e il perimetro dell'input era quasi invisibile.
    const bordo = /\.auth-form input \{[^}]*border:\s*1px solid (#[0-9a-fA-F]{6})/u.exec(css)?.[1];
    expect(bordo).toBeDefined();
    expect(contrastRatio(bordo ?? "#000000", fondo)).toBeGreaterThanOrEqual(3);
  });

  it("il testo dentro il campo si legge sul fondo del campo, non su quello della pagina", () => {
    const blocco = /\.auth-form input \{([^}]*)\}/u.exec(css)?.[1] ?? "";
    const colore = /(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{6})/u.exec(blocco)?.[1];
    const sfondo = /(?:^|;)\s*background\s*:\s*(#[0-9a-fA-F]{6})/u.exec(blocco)?.[1];
    expect(colore).toBeDefined();
    expect(sfondo).toBeDefined();
    expect(contrastRatio(colore ?? "#000000", sfondo ?? "#000000")).toBeGreaterThanOrEqual(4.5);
  });
});
