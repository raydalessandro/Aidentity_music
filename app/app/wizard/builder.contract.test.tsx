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

describe("la pagina intera è il sito, non un suo riassunto", () => {
  // Prima l'anteprima impilava HOME, un inventario testuale della bozza e l'EPK in una
  // pagina sola, con il dock che scorreva fra ancore. Il sito pubblicato invece ha
  // superfici separate: chi guardava l'anteprima per decidere se pubblicare vedeva una
  // struttura che non sarebbe mai esistita.
  it("la HOME dell'anteprima è la HOME e basta", () => {
    const owner = source("app", "app", "wizard", "preview", "[siteId]", "page.tsx");
    expect(owner).toContain("<SiteTemplateHome");
    expect(owner, "l'inventario testuale non impagina più il sito")
      .not.toContain("<DraftContentPreview");
  });

  it("ogni superficie è una pagina, resa dallo stesso template del sito", () => {
    const surface = source("app", "app", "wizard", "preview", "[siteId]", "[surface]", "page.tsx");
    expect(surface).toContain("<SiteTemplateSurface");
    // Gli stessi componenti del sito pubblicato, non una seconda resa: FEED e MERCH
    // arrivano da `components/surfaces/content`, LISTEN dal catalogo tracce.
    expect(surface).toContain("components/surfaces/content");
    expect(surface).toContain("<TrackCatalogue");
    expect(surface).toContain("<EpkSurface");
  });

  it("una superficie spenta non è raggiungibile nemmeno in anteprima", () => {
    // La stessa regola del sito pubblicato: nascosta dal dock **e** non servita.
    const surface = source("app", "app", "wizard", "preview", "[siteId]", "[surface]", "page.tsx");
    expect(surface).toMatch(/if \(!isSurfaceEnabled\([^)]*\)\) notFound\(\)/u);
  });

  it("i media della bozza passano dalle route owner autenticate", () => {
    const draft = source("app", "app", "wizard", "preview", "[siteId]", "draft.ts");
    expect(draft).toContain("/api/wizard/preview-asset/");
    expect(draft).toContain("/api/wizard/preview-track/");
    expect(draft).toContain("hero_asset_id");
  });

  // Le due route owner sono gemelle di proposito: stesso ordine, stesso confine. Il banco
  // le percorre entrambe, perché la seconda è nata copiando la prima ed è esattamente così
  // che una disciplina si perde — copiando la forma e non la sequenza.
  it.each([
    ["preview-asset", "[assetId]", '.from("site_assets")'] as const,
    ["preview-track", "[trackId]", '.from("site_tracks")'] as const,
  ])("%s: service_role firma solo dopo auth e lettura sotto RLS", (cartella, param, tabella) => {
    const route = source("app", "api", "wizard", cartella, param, "route.ts");
    const auth = route.indexOf("scoped.auth.getUser()");
    const rlsRead = route.indexOf(tabella);
    const privileged = route.indexOf("const privileged = createSupabaseServiceRoleClient()");

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(rlsRead).toBeGreaterThan(auth);
    expect(privileged).toBeGreaterThan(rlsRead);
    expect(route).toContain('Cache-Control", "private, no-store"');
  });

  it("la route audio dell'anteprima serve solo upload, non embed", () => {
    // Una traccia `embed` non ha byte da servire: il suo indirizzo è quello del provider,
    // che passa dalla allow-list. Chiederla qui deve fallire come una che non esiste.
    const route = source("app", "api", "wizard", "preview-track", "[trackId]", "route.ts");
    expect(route).toContain('track.source !== "upload"');
    expect(route).toContain("track.purged_at !== null");
  });
});
