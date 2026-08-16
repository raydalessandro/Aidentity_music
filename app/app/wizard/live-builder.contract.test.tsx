import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function source(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), "utf8");
}

describe("builder mobile live", () => {
  it("rende il template vero dalla config in memoria, non una seconda mock UI", () => {
    const wizard = source("app", "app", "wizard", "WizardClient.tsx");
    expect(wizard).toContain("<SiteTemplateHome");
    expect(wizard).toContain("paletteForDraft(config)");
    expect(wizard).toContain("embedded");
    expect(wizard).toContain("interactive={false}");
  });

  it("dichiara subito i propri ganci data-*", () => {
    const wizard = source("app", "app", "wizard", "WizardClient.tsx");
    for (const hook of [
      "data-live-builder",
      "data-builder-stage",
      "data-builder-preview",
      "data-builder-sheet",
    ]) {
      expect(wizard, `gancio builder mancante: ${hook}`).toContain(hook);
    }
  });

  it("la preview incorporata non offre href di superficie", () => {
    const template = source("components", "site-templates", "unica.tsx");
    expect(template).toContain("if (!interactive)");
    expect(template).toContain("return <span");
  });

  it("il CSS del builder usa soltanto ink o muted come colori del testo", () => {
    const css = source("app", "app", "wizard", "live-builder.module.css");
    const colors = [...css.matchAll(/(?:^|\n)\s*color:\s*([^;]+);/gu)].map((match) => match[1]?.trim());
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(["var(--ink)", "var(--muted)"], `colore testo non sicuro: ${color}`).toContain(color);
    }
    expect(css).not.toMatch(/color:\s*var\(--(?:acid|dim)\)/u);
  });

  it("la hero draft passa da una route owner autenticata", () => {
    const wizard = source("app", "app", "wizard", "WizardClient.tsx");
    expect(wizard).toContain("/api/wizard/preview-asset/");
  });

  it("la preview owner tiene HOME, contenuti ed EPK dentro lo stesso template", () => {
    const owner = source("app", "app", "wizard", "preview", "[siteId]", "page.tsx");
    const open = owner.indexOf("<SiteTemplateHome");
    const content = owner.indexOf("<DraftContentPreview");
    const epk = owner.indexOf("<EpkSurface");
    const close = owner.indexOf("</SiteTemplateHome>");

    expect(open).toBeGreaterThanOrEqual(0);
    expect(content).toBeGreaterThan(open);
    expect(epk).toBeGreaterThan(content);
    expect(close).toBeGreaterThan(epk);
    expect(owner).toContain("hero_asset_id");
    expect(owner).toContain("heroSrc={heroSrc}");
  });

  it("service_role firma soltanto dopo auth e lettura RLS dell'asset", () => {
    const route = source(
      "app", "api", "wizard", "preview-asset", "[assetId]", "route.ts",
    );
    const auth = route.indexOf("scoped.auth.getUser()");
    const rlsRead = route.indexOf('.from("site_assets")');
    const privileged = route.indexOf("const privileged = createSupabaseServiceRoleClient()");

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(rlsRead).toBeGreaterThan(auth);
    expect(privileged).toBeGreaterThan(rlsRead);
    expect(route).toContain('Cache-Control", "private, no-store"');
  });
});

describe("il sito si guarda in una pagina sua, i controlli stanno qui", () => {
  // Tre modelli provati su telefono, tutti falliti per lo stesso motivo: cercare
  // di far stare sullo stesso schermo il sito e i controlli.
  //   1. foglio scorrevole sopra il sito → la hero di Unica tagliata a meta' del nome;
  //   2. foglio con altezza propria e scorrimento interno → la barra dei passi
  //      a galleggiare dentro una finestrella;
  //   3. due modi che si escludono con un interruttore → funzionava, ma duplicava
  //      un comando che esisteva gia'.
  //
  // La decisione di Ray: il sito si guarda con «Apri pagina completa», che lo
  // apre a schermo pieno in una pagina sua. Qui sotto resta uno sfondo che
  // cambia mentre si scrive. Questi banchi presidiano quella scelta, non la sua
  // impaginazione: quello che non deve tornare e' la sovrapposizione.
  const css = source("app", "app", "wizard", "live-builder.module.css");
  const wizard = source("app", "app", "wizard", "WizardClient.tsx");

  // Senza commenti: la prima versione di questi banchi leggeva le note che
  // spiegano il divieto e le scambiava per la violazione. Un controllo che
  // misura la prosa invece del foglio e' un controllo che non misura nulla.
  const dichiarazioni = css.replace(/\/\*[\s\S]*?\*\//gu, "");

  /** I corpi di tutte le regole il cui selettore nomina una certa classe. */
  function regole(classe: string): string[] {
    return [...dichiarazioni.matchAll(/([^{}]+)\{([^}]*)\}/gu)]
      .filter((match) => new RegExp(`\\.${classe}\\b`, "u").test(match[1]!))
      .map((match) => match[2]!);
  }

  it("il sito vero si apre a schermo pieno, in un'altra pagina", () => {
    // E' il motivo per cui il builder puo' permettersi di NON essere un
    // visualizzatore: se questa strada sparisse, lo sfondo qui sotto resterebbe
    // l'unico modo di vedere il sito, e non basta.
    expect(wizard).toContain("/app/wizard/preview/");
    expect(wizard).toContain("window.open(");
  });

  it("il palco precede il foglio: nel flusso, non sotto di esso", () => {
    const stage = wizard.indexOf("data-builder-stage");
    const sheet = wizard.indexOf("data-builder-sheet");
    expect(stage).toBeGreaterThanOrEqual(0);
    expect(sheet).toBeGreaterThan(stage);
  });

  it("il foglio non esce dal flusso per finire sopra il sito", () => {
    // Il difetto misurato sul telefono di Ray nasceva esattamente qui: bastano
    // `position: fixed` o un margine negativo perche' i controlli tornino a
    // coprire la hero.
    const corpi = regole("sheet");
    expect(corpi.length).toBeGreaterThan(0);
    for (const corpo of corpi) {
      expect(corpo, "il foglio deve restare nel flusso").not.toMatch(/position:\s*(?:fixed|absolute)/u);
      expect(corpo, "niente margine negativo sul foglio").not.toMatch(/margin[^:]*:\s*[^;]*-\d/u);
      expect(corpo, "niente translate sul foglio").not.toMatch(/transform:\s*translate/u);
    }
  });

  it("il palco ha l'altezza intera che il template si aspetta", () => {
    // La root di Unica e' `min-height: 100svh` con topbar e dock ancorati ai suoi
    // estremi: un palco piu' basso non rimpicciolisce il sito, lo taglia.
    expect(regole("stage").some((corpo) => /height:\s*100svh/u.test(corpo))).toBe(true);
  });

  it("ne' il palco ne' il foglio vengono nascosti: non ci sono piu' due modi", () => {
    // Il caso che DEVE essere rifiutato: qualunque regola che spenga uno dei due
    // riporta il builder al modello a interruttore.
    for (const classe of ["stage", "sheet"] as const) {
      for (const corpo of regole(classe)) {
        expect(corpo, `${classe} non deve essere spenta da nessuna regola`).not.toMatch(/display:\s*none/u);
      }
    }
  });

  it("i controlli scorrono con la pagina, non dentro una finestrella", () => {
    // Era la causa della barra dei passi che galleggiava a meta' schermo.
    expect(css).not.toMatch(/\.body \{[^}]*max-height/u);
    expect(css).not.toMatch(/\.body \{[^}]*overflow-y:\s*auto/u);
  });

  it("lo stato del salvataggio sta fuori dal foglio", () => {
    // Su telefono l'intestazione del pannello e' nascosta: se questa riga
    // finisse dentro il foglio, il salvataggio automatico non lo direbbe piu'
    // nessuno mentre si scrive.
    const stato = wizard.indexOf("data-save-state");
    expect(stato).toBeGreaterThanOrEqual(0);
    expect(stato).toBeLessThan(wizard.indexOf("data-builder-sheet"));
  });
});
