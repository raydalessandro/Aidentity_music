// Il contrasto delle superfici che si vedono davvero.
//
// Perche' questo file esiste: `app/globals.test.ts` misura le regole di
// `globals.css`, e quelle erano le regole rese finche' landing e accesso non
// avevano uno stile proprio. Con i CSS module di Control Room non lo sono piu' —
// `auth-shell.module.css` sovrascrive perfino `.auth-form input` tramite
// `:global(...)`. Un banco che continuasse a leggere solo `globals.css`
// resterebbe verde misurando regole che il browser non applica: verde, e privo
// di significato.
//
// Le coppie sono dichiarate a mano perche' un colore da solo non si giudica: un
// blocco che dichiara `color` senza `background` eredita il fondo da un antenato,
// e risolverlo staticamente vorrebbe dire reimplementare la cascata. Ogni riga
// dice quale testo sta sopra quale fondo, ed e' quella l'affermazione da
// verificare.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./[slug]/read-model";

const auth = readFileSync(new URL("./(auth)/auth-shell.module.css", import.meta.url), "utf8");
const landing = readFileSync(
  new URL("../components/landing/landing.module.css", import.meta.url),
  "utf8",
);

/**
 * `hexToRgb` del read model accetta solo la forma a sei cifre: su `#111`
 * restituirebbe `NaN` e il rapporto sarebbe privo di senso invece che basso.
 * I fogli usano entrambe le forme, quindi qui si espande prima di misurare.
 */
function esteso(colore: string): string {
  const cifre = colore.replace("#", "");
  return cifre.length === 3 ? `#${[...cifre].map((c) => c + c).join("")}` : colore;
}

/** Il valore deve esistere nel foglio: se il colore cambia, la riga va aggiornata. */
function dichiarato(sorgente: string, colore: string, dove: string): string {
  expect(sorgente.includes(colore), `${colore} non compare piu' in ${dove}`).toBe(true);
  return esteso(colore);
}

const SOGLIA_TESTO = 4.5;
/** WCAG 1.4.11: il confine di un controllo non e' testo, ma deve distinguersi. */
const SOGLIA_COMPONENTE = 3;

describe("accesso e registrazione: quello che si legge davvero", () => {
  const pagina = "#090b0c";
  const card = "#111416";

  it.each([
    ["testo principale", "#f2f3ed", pagina, SOGLIA_TESTO],
    ["testo secondario", "#a9afa7", pagina, SOGLIA_TESTO],
    ["testo tenue", "#7f8980", pagina, SOGLIA_TESTO],
    ["collegamenti", "#caff33", pagina, SOGLIA_TESTO],
    ["messaggio d'errore", "#ff9d8a", pagina, SOGLIA_TESTO],
    ["testo dentro la card", "#dfe6dc", card, SOGLIA_TESTO],
    ["testo tenue nella card", "#8f9990", card, SOGLIA_TESTO],
  ])("%s", (_nome, colore, fondo, soglia) => {
    expect(contrastRatio(dichiarato(auth, colore, "auth-shell.module.css"), fondo)).toBeGreaterThanOrEqual(soglia);
  });

  it("il testo sul pulsante acid si legge", () => {
    expect(contrastRatio("#0b0d0e", "#caff33")).toBeGreaterThanOrEqual(SOGLIA_TESTO);
  });

  it("il bordo del campo si distingue: e' il confine del controllo", () => {
    // Questo e' il difetto che il banco su `globals.css` non poteva piu' vedere.
    // La consegna dichiarava `#394143`, che sul fondo della card dava 1.77.
    const bordo = /:global\(\.auth-form input\)\{[^}]*border:1px solid (#[0-9a-fA-F]{6})/u.exec(auth)?.[1]
      ?? /border:1px solid (#[0-9a-fA-F]{6})/u.exec(auth)?.[1];
    expect(bordo, "nessun bordo dichiarato per il campo").toBeDefined();
    expect(contrastRatio(esteso(bordo ?? "#000000"), card)).toBeGreaterThanOrEqual(SOGLIA_COMPONENTE);
  });
});

describe("landing: quello che si legge davvero", () => {
  const chiaro = "#ecebe4";
  const scuro = "#171b1d";

  it.each([
    ["testo su fondo chiaro", "#111", chiaro, SOGLIA_TESTO],
    ["secondario su chiaro", "#394139", chiaro, SOGLIA_TESTO],
    ["tenue su chiaro", "#5d665e", chiaro, SOGLIA_TESTO],
    ["testo su fondo scuro", "#dfe5dc", scuro, SOGLIA_TESTO],
  ])("%s", (_nome, colore, fondo, soglia) => {
    expect(contrastRatio(dichiarato(landing, colore, "landing.module.css"), fondo)).toBeGreaterThanOrEqual(soglia);
  });

  it("il testo sul pulsante acid si legge", () => {
    expect(contrastRatio("#0c0e0f", "#d6ff39")).toBeGreaterThanOrEqual(SOGLIA_TESTO);
  });

  it("il bordo sul fondo chiaro si distingue", () => {
    expect(contrastRatio("#4f5a50", chiaro)).toBeGreaterThanOrEqual(SOGLIA_COMPONENTE);
  });
});

describe("il gancio che l'e2e usa non e' una classe con hash", () => {
  it("la landing dichiara `data-landing`", () => {
    // La spec Playwright cerca `[data-landing]`. Con i CSS module la classe in
    // pagina porta un hash generato, che non e' un contratto: se qualcuno
    // togliesse l'attributo, l'e2e diventerebbe rosso senza sapere perche'.
    const sorgente = readFileSync(
      new URL("../components/landing/Landing.tsx", import.meta.url),
      "utf8",
    );
    expect(sorgente).toContain("data-landing");
  });
});
