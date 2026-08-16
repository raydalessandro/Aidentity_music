// Il builder serve a inserire informazioni. Il sito si guarda altrove.
//
// Questa è una decisione di prodotto presa dopo tre tentativi falliti sul
// telefono di Ray, e questi banchi la presidiano perché è il tipo di scelta che
// si erode da sola: mostrare il sito accanto ai campi sembra sempre una buona
// idea finché non si prova a scrivere.
//
//   1. foglio scorrevole SOPRA il sito → la hero di Unica tagliata a metà del nome;
//   2. foglio con altezza propria e scorrimento interno → la barra dei passi a
//      galleggiare dentro una finestrella;
//   3. due modi che si escludono con un interruttore → funzionava, ma duplicava
//      un comando già esistente;
//   4. il sito come fondale a schermo intero sopra i campi → «così non scorre
//      nulla e le informazioni non si possono inserire».
//
// Ogni tentativo ha rotto l'inserimento in un modo diverso, e nessuno dei quattro
// aggiungeva qualcosa a «Apri pagina completa», che mostra il sito a schermo
// pieno in una pagina sua — come lo vedrà chi riceve il link — e si chiude per
// tornare a lavorare.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function source(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), "utf8");
}

describe("la pagina del builder serve a inserire, non a guardare", () => {
  const wizard = source("app", "app", "wizard", "WizardClient.tsx");

  it("non incorpora il template del sito fra i campi", () => {
    // Il caso che DEVE essere rifiutato. Non è una preferenza di layout: ogni
    // volta che il sito è finito su questa pagina ha mangiato lo spazio dei
    // campi o lo scorrimento, e ogni volta è stato scoperto usando il telefono,
    // non leggendo il codice.
    expect(wizard, "il sito non si rende qui dentro").not.toContain("<SiteTemplateHome");
    expect(wizard, "nessun import del confine template").not.toContain("site-templates/SiteTemplate");
  });

  it("il sito si apre a schermo pieno, in una pagina sua", () => {
    // È la contropartita del divieto sopra: se questa strada sparisse, il
    // builder resterebbe senza alcun modo di vedere il sito, e il divieto
    // diventerebbe una mutilazione invece di una scelta.
    expect(wizard).toContain("/app/wizard/preview/");
    expect(wizard).toContain("window.open(");
  });

  it("la configurazione viene salvata PRIMA di aprirla", () => {
    // La pagina intera legge dal database, non dallo stato del client: aprirla
    // senza aver salvato mostrerebbe il sito di qualche secondo fa, e sarebbe
    // indistinguibile da una modifica che non ha funzionato.
    const salva = wizard.indexOf("const saved = await queueConfigSave(config)");
    const apri = wizard.indexOf("window.open(");
    expect(salva).toBeGreaterThanOrEqual(0);
    expect(apri).toBeGreaterThan(salva);
  });
});

describe("la pagina intera è quella che mostra il sito davvero", () => {
  it("tiene HOME, contenuti ed EPK dentro lo stesso template", () => {
    const owner = source("app", "app", "wizard", "preview", "[siteId]", "page.tsx");
    const open = owner.indexOf("<SiteTemplateHome");
    const content = owner.indexOf("<DraftContentPreview");
    const epk = owner.indexOf("<EpkSurface");
    const close = owner.indexOf("</SiteTemplateHome>");

    expect(open).toBeGreaterThanOrEqual(0);
    expect(content).toBeGreaterThan(open);
    expect(epk).toBeGreaterThan(content);
    expect(close).toBeGreaterThan(epk);
  });

  it("mostra la hero della bozza, che prima di questa PR non compariva", () => {
    // Misurato: su `main` questa pagina non nominava affatto `hero_asset_id`.
    // Il visual principale c'era nel database e non si vedeva da nessuna parte
    // prima della pubblicazione.
    const owner = source("app", "app", "wizard", "preview", "[siteId]", "page.tsx");
    expect(owner).toContain("hero_asset_id");
    expect(owner).toContain("heroSrc={heroSrc}");
    expect(owner).toContain("/api/wizard/preview-asset/");
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
