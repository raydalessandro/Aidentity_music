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

describe("il sito resta visibile mentre si modifica", () => {
  // Difetto segnalato da Ray al primo giro su telefono: il foglio dei controlli
  // non scendeva abbastanza e il sito sotto non si vedeva — «cambia il nome ma
  // si vede per metà». La causa non era la misura del foglio: era che il
  // palcoscenico restava alto `100dvh` e veniva coperto dal basso, quindi la
  // hero di Unica (alta quanto lo schermo) finiva tagliata a metà.
  //
  // L'invariante da presidiare non è «58dvh»: è che l'altezza del foglio aperto
  // e lo spazio lasciato al sito vengano dalla STESSA sorgente. Due numeri
  // scritti in due punti tornerebbero a divergere, ed è esattamente così che il
  // difetto è nato.
  const css = source("app", "app", "wizard", "live-builder.module.css");

  it("le due altezze del foglio sono dichiarate una volta sola", () => {
    expect(css).toMatch(/--sheet-open:\s*\d+dvh;/u);
    expect(css).toMatch(/--sheet-closed:\s*\d+px;/u);
  });

  it("il palcoscenico si restringe leggendo la stessa variabile del foglio", () => {
    expect(css).toMatch(
      /\.stage\[data-editing="true"\]\s*\{[^}]*height:\s*calc\(100dvh - var\(--sheet-open\)\)/u,
    );
  });

  it("aperto il foglio non si sovrappone al sito", () => {
    // Con il palcoscenico già ristretto, un margine negativo lo ricoprirebbe:
    // sarebbe il difetto di prima, tornato per un'altra strada.
    const apertura = /\.sheet\s*\{[^}]*\}/u.exec(css)?.[0] ?? "";
    expect(apertura).toContain("min-height: var(--sheet-open)");
    expect(apertura).toMatch(/margin-top:\s*0;/u);
  });

  it("chiuso invece sì: il sito torna a schermo intero sotto la maniglia", () => {
    const chiusura = /\.sheet\[data-expanded="false"\]\s*\{[^}]*\}/u.exec(css)?.[0] ?? "";
    expect(chiusura).toContain("calc(-1 * var(--sheet-closed))");
  });

  it("i controlli scorrono dentro il foglio, non oltre lo schermo", () => {
    expect(css).toMatch(/max-height:\s*calc\(var\(--sheet-open\) - \d+px\)/u);
  });
});
