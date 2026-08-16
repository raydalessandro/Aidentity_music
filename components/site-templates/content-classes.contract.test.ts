// Una classe che nessun foglio definisce.
//
// Il contenuto delle superfici — FEED, MERCH, LISTEN, EPK — non è reso dal template: lo
// rendono le rotte, con nomi di classe **globali** scritti a mano (`merch-grid`,
// `feed-card`, `track-list`). Il template li stila da fuori, con `:global(...)` sotto
// `.surfaceBody`. È una giuntura reale fra due file che non si importano.
//
// Il modo di sbagliare non è quello solito — un selettore che si rompe perché la classe
// viene hashata. Qui è più silenzioso: la rotta emette un nome che **nessun foglio
// definisce**, e non succede niente. Nessun errore, nessun test rosso, solo un blocco senza
// impaginazione che si scopre guardando la pagina su un telefono.
//
// Misurato: la consegna del template NVLL ha introdotto `epk-identity` su
// `app/[slug]/surface-content.tsx` e non l'ha definita da nessuna parte — né in
// `globals.css` né nel foglio del template. La suite era interamente verde.
//
// Questo banco cerca i sorgenti e i fogli invece di elencarli: una superficie nuova o un
// template nuovo non possono sfuggirgli.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** I sorgenti che rendono il contenuto delle superfici, cercati per posizione. */
function contentSources(): string[] {
  const trovati: string[] = [];

  function scan(dir: string) {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const relative = join(dir, entry.name);
      if (entry.isDirectory()) scan(relative);
      else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
        trovati.push(relative);
      }
    }
  }

  scan(join("app", "[slug]"));
  scan(join("components", "epk"));
  return trovati;
}

/** Solo `className="stringa-letterale"`: le classi dei CSS Module arrivano da `styles.x`. */
function literalClasses(source: string): string[] {
  return [...source.matchAll(/className="([a-z][a-z0-9 -]*)"/gu)]
    .flatMap((match) => match[1]!.split(/\s+/))
    .filter((name) => name.length > 0);
}

function stylesheets(): string[] {
  const fogli = [join("app", "globals.css")];
  const cartella = join("components", "site-templates");
  for (const nome of readdirSync(join(repoRoot, cartella))) {
    if (nome.endsWith(".module.css")) fogli.push(join(cartella, nome));
  }
  return fogli;
}

describe("ogni classe scritta a mano dalle superfici è definita da un foglio", () => {
  const sorgenti = contentSources();
  const fogli = stylesheets().map((foglio) => readFileSync(join(repoRoot, foglio), "utf8"));

  it("trova sorgenti e fogli: un controllo che non guarda nulla passerebbe sempre", () => {
    expect(sorgenti.length).toBeGreaterThan(0);
    // `globals.css` più almeno un foglio di template.
    expect(fogli.length).toBeGreaterThan(1);
  });

  it.each(sorgenti)("%s", (file) => {
    const classi = [...new Set(literalClasses(readFileSync(join(repoRoot, file), "utf8")))];
    const orfane = classi.filter(
      (classe) => !fogli.some((foglio) => new RegExp(`\\.${classe}(?![\\w-])`, "u").test(foglio)),
    );

    expect(
      orfane,
      "emesse nel markup e definite da nessuna parte: il blocco resta senza impaginazione",
    ).toEqual([]);
  });
});
