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
      "data-builder-toggle",
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

describe("o si guarda il sito, o si lavora", () => {
  // Il primo modello sovrapponeva un foglio scorrevole al sito, ed e' stato
  // provato su telefono: il sito veniva disegnato a schermo intero e coperto dal
  // basso, quindi la hero di Unica si vedeva a meta'. Il secondo tentativo — dare
  // al foglio un'altezza propria con scorrimento interno — ha spostato il
  // problema: la barra dei passi finiva a galleggiare dentro una finestrella.
  //
  // Il modello attuale, deciso da Ray, toglie il problema invece di spostarlo:
  // due modi che si escludono e un solo comando che li commuta.
  const css = source("app", "app", "wizard", "live-builder.module.css");
  const wizard = source("app", "app", "wizard", "WizardClient.tsx");

  it("mentre si lavora il sito non e' coperto a meta': e' proprio assente", () => {
    expect(css).toMatch(/\.builder\[data-editing="true"\] \.stage \{[^}]*display:\s*none/u);
  });

  it("mentre si guarda il sito i controlli non sono coperti a meta': sono assenti", () => {
    expect(css).toMatch(/\.builder\[data-editing="false"\] \.sheet \{[^}]*display:\s*none/u);
  });

  it("il tasto che apre il pannello NON vive dentro il pannello", () => {
    // L'invariante di prodotto: se il comando stesse dentro il foglio, chiuderlo
    // nasconderebbe anche il modo di riaprirlo.
    const toggle = wizard.indexOf("data-builder-toggle");
    const sheet = wizard.indexOf("data-builder-sheet");
    expect(toggle).toBeGreaterThanOrEqual(0);
    expect(sheet).toBeGreaterThanOrEqual(0);
    expect(toggle, "il toggle deve precedere il foglio nel markup").toBeLessThan(sheet);
  });

  it("i controlli scorrono con la pagina, non dentro una finestrella", () => {
    // Era la causa della barra dei passi che galleggiava a meta' schermo.
    expect(css).not.toMatch(/\.body \{[^}]*max-height/u);
    expect(css).not.toMatch(/\.body \{[^}]*overflow-y:\s*auto/u);
  });

  it("il bersaglio del comando e' comodo per un pollice", () => {
    expect(css).toMatch(/\.barToggle \{[^}]*min-height:\s*44px/u);
  });
});
