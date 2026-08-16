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
