// Il confine template.
//
// Questi banchi presidiano un refactor, cioè la classe di difetto più silenziosa che ci sia:
// un livello nuovo che si infila fra le route e il guscio e, passando, **perde qualcosa**.
// La cosa che può perdere è `destination`, e perderla non è un errore di tipo — la prop è
// opzionale e il suo default è l'anteprima. Il risultato sarebbe un sito pubblicato che torna
// a dire `PREVIEW · IT`, con il dock verso ancore inesistenti e il player spento accanto a
// quello vero: esattamente i tre difetti chiusi dalla #26.
//
// Per questo il presidio è su due file: qui si misura che il confine sia trasparente, e in
// `app/[slug]/dock-routing.test.tsx` si rende la HOME pubblicata **attraverso** il confine,
// così che una propagazione persa accenda i banchi di comportamento e non solo questi.
//
// Prove di mutazione misurate (rompi, conta, ripristina):
// - dispatch che smette di propagare `destination` (elenco esplicito di prop al posto dello
//   spread in `SiteTemplate.tsx`): 13 rossi — 4 qui + 9 in `app/[slug]/dock-routing.test.tsx`;
// - `BaselineHome` che avvolge `SiteShell` in un `<div>`: 2 rossi, entrambi qui;
// - `published` cablato a `true` dentro `BaselineSurface`: 1 rosso qui;
// - filtro delle superfici spente rimosso da `BaselineSurface`: 2 rossi — 1 qui + 1 in
//   `app/[slug]/render.test.tsx`;
// - route `/[slug]` che smette di passare `destination`: 3 rossi — 1 qui + 2 in
//   `dock-routing.test.tsx`;
// - showroom che si dichiara pubblicato: 3 rossi — 1 qui + 2 in `app/page.test.tsx`.
//
// Non mutabile in silenzio, e va detto: `published` sulle superfici e `navigation` sono prop
// **obbligatorie**, quindi toglierle è un errore di `tsc`, non un rosso di questa suite.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { seedPublishedConfig } from "../../app/[slug]/fixtures";
import { siteConfigSchema } from "../../lib/contract";
import { shellPalettes } from "../site-shell/palettes";
import { SiteShell } from "../site-shell/SiteShell";
import type { ShellConfig, ShellDestination } from "../site-shell/types";
import { getSiteTemplate, siteTemplates } from "./registry";
import { SiteTemplateHome, SiteTemplateSurface } from "./SiteTemplate";
import { DEFAULT_SITE_TEMPLATE_ID, SITE_TEMPLATE_IDS, type SiteTemplateNavItem } from "./types";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const palette = shellPalettes[0]!;

const config: ShellConfig = {
  identity: {
    name: "NVLL CLICK",
    handle: "nvll-click",
    claim: "Electro-pop italiano",
    shortBio: "Fixture locale.",
    longBio: "Fixture locale.",
    location: "Milano",
    locale: "it-IT",
  },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true },
    { id: "listen", enabled: true },
    { id: "epk", enabled: true },
    // Il caso che DEVE essere rifiutato dal rendering: una superficie spenta non compare
    // nella navigazione e non riceve un href, perché quell'href porterebbe a un 404.
    { id: "merch", enabled: false },
    { id: "home", enabled: true },
  ],
};

/** La stessa forma che `publishedDestination` produce dal read model. */
const pubblicato: ShellDestination = {
  kind: "pubblicato",
  hrefs: {
    feed: "/nvll-click/feed",
    listen: "/nvll-click/listen",
    epk: "/nvll-click/epk",
    merch: "/nvll-click/merch",
    home: "/nvll-click",
  },
};

const navigation: readonly SiteTemplateNavItem[] = [
  { id: "feed", enabled: true, label: "FEED", href: "/nvll-click/feed" },
  { id: "listen", enabled: true, label: "ASCOLTI", href: "/nvll-click/listen" },
  { id: "epk", enabled: true, label: "EPK", href: "/nvll-click/epk" },
  { id: "merch", enabled: false, label: "MERCH", href: "/nvll-click/merch" },
  { id: "home", enabled: true, label: "HOME", href: "/nvll-click" },
];

describe("confine template", () => {
  it("parte con un solo template interno e un default esplicito", () => {
    expect(SITE_TEMPLATE_IDS).toEqual(["baseline"]);
    expect(DEFAULT_SITE_TEMPLATE_ID).toBe("baseline");
    expect(siteTemplates.map((template) => template.id)).toEqual(["baseline"]);
    expect(getSiteTemplate().id).toBe("baseline");
  });

  it("HOME baseline è byte-per-byte lo stesso markup di SiteShell, in anteprima", () => {
    const props = {
      config,
      palette,
      previewId: "nvll-click",
      heroSrc: "/api/media/asset/site/hero",
    };
    expect(renderToStaticMarkup(<SiteTemplateHome {...props} />)).toBe(
      renderToStaticMarkup(<SiteShell {...props} />),
    );
  });

  it("HOME baseline è byte-per-byte lo stesso markup di SiteShell, da pubblicata", () => {
    // Il banco precedente da solo non basta: senza `destination` nei props confrontati, un
    // dispatch che la perde produce due markup identici e resta verde.
    const props = {
      config,
      palette,
      previewId: "nvll-click",
      heroSrc: "/api/media/asset/site/hero",
      destination: pubblicato,
    };
    expect(renderToStaticMarkup(<SiteTemplateHome {...props} />)).toBe(
      renderToStaticMarkup(<SiteShell {...props} />),
    );
  });
});

describe("il dispatch propaga la destinazione", () => {
  // L'invariante che questo refactor mette più a rischio. Se cade, non cade da sola: cadono
  // anche i banchi della #26, che ora rendono attraverso questo stesso confine.
  const home = (destination?: ShellDestination) =>
    renderToStaticMarkup(
      <SiteTemplateHome
        config={config}
        palette={palette}
        previewId="nvll-click"
        destination={destination}
      />,
    );

  it("con destinazione pubblicata il dock porta alle rotte e la topbar tace", () => {
    const markup = home(pubblicato);
    expect(markup).toContain('href="/nvll-click/feed"');
    expect(markup).toContain('href="/nvll-click"');
    expect(markup).not.toContain("#feed-nvll-click");
    expect(markup).not.toContain("PREVIEW");
    expect(markup).not.toContain("player-shell");
  });

  it("senza destinazione resta un'anteprima: ancore, PREVIEW e player segnaposto", () => {
    const markup = home();
    expect(markup).toContain("#feed-nvll-click");
    expect(markup).not.toContain('href="/nvll-click/feed"');
    expect(markup).toContain("PREVIEW");
    expect(markup).toContain("player-shell");
  });

  it("le due destinazioni non producono lo stesso markup", () => {
    // Il banco che non si può soddisfare per caso: se il confine ignorasse `destination`,
    // pubblicata e anteprima diventerebbero indistinguibili.
    expect(home(pubblicato)).not.toBe(home());
  });

  it("MERCH spenta non riceve un href sul sito pubblicato", () => {
    // Caso rifiutato: l'href esiste in `hrefs`, ma la superficie è spenta e non deve comparire.
    const markup = home(pubblicato);
    expect(markup).not.toContain('href="/nvll-click/merch"');
    expect(markup).not.toContain("MERCH");
  });
});

describe("la superficie baseline", () => {
  const surface = (published: boolean) =>
    renderToStaticMarkup(
      <SiteTemplateSurface
        config={config}
        palette={palette}
        surface="listen"
        label="ASCOLTI"
        navigation={navigation}
        published={published}
      >
        <p>contenuto</p>
      </SiteTemplateSurface>,
    );

  it("conserva navigazione, label e stato corrente", () => {
    const markup = surface(true);
    expect(markup).toContain("ASCOLTI");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/nvll-click/feed"');
    expect(markup).toContain('href="/nvll-click/epk"');
    expect(markup).toContain('data-surface="listen"');
    expect(markup).toContain("--acid:");
  });

  it("una superficie spenta non compare nella navigazione", () => {
    // Caso rifiutato, con l'esito dichiarato: MERCH è spenta, quindi né label né href.
    const markup = surface(true);
    expect(markup).not.toContain('href="/nvll-click/merch"');
    expect(markup).not.toContain("MERCH");
  });

  it("su una superficie pubblicata la topbar non dice PREVIEW", () => {
    expect(surface(true)).not.toContain("PREVIEW");
  });

  it("il template non decide la parola al posto del chiamante", () => {
    // Esito atteso dichiarato: con `published={false}` la topbar TORNA a dire PREVIEW.
    // Se `BaselineSurface` cablasse `published` a `true`, questo banco diventerebbe rosso —
    // ed è l'unico modo di accorgersi che la decisione è scivolata nel livello di
    // presentazione, dove non appartiene.
    expect(surface(false)).toContain("PREVIEW");
  });
});

describe("le route non possiedono più la scelta del guscio", () => {
  const homeFiles = [
    join("app", "page.tsx"),
    join("app", "[slug]", "page.tsx"),
    join("app", "app", "wizard", "preview", "[siteId]", "page.tsx"),
    join("app", "preview", "[token]", "page.tsx"),
  ];

  it.each(homeFiles)("%s passa da SiteTemplateHome", (file) => {
    const source = readFileSync(join(repoRoot, file), "utf8");
    expect(source).toContain("SiteTemplateHome");
    expect(source).not.toMatch(/import\s+\{[^}]*\bSiteShell\b/);
  });

  it("solo la HOME pubblicata dichiara una destinazione", () => {
    // Il caso rifiutato di questo blocco: una preview che passasse `destination` smetterebbe
    // di essere una preview. Le tre anteprime non devono nominarla affatto.
    const pubblicata = readFileSync(join(repoRoot, "app", "[slug]", "page.tsx"), "utf8");
    expect(pubblicata).toContain("destination={publishedDestination(site)}");

    for (const file of [
      join("app", "page.tsx"),
      join("app", "app", "wizard", "preview", "[siteId]", "page.tsx"),
      join("app", "preview", "[token]", "page.tsx"),
    ]) {
      expect(readFileSync(join(repoRoot, file), "utf8")).not.toContain("destination=");
    }
  });

  it("surface-content delega il chrome e conserva soltanto il contenuto di dominio", () => {
    const source = readFileSync(join(repoRoot, "app", "[slug]", "surface-content.tsx"), "utf8");
    expect(source).toContain("SiteTemplateSurface");
    expect(source).not.toContain("ShellTopbar");
    expect(source).not.toContain('from "next/link"');
    expect(source).not.toContain("className={`site-shell");
  });

  it("la traduzione dei token tema non è più duplicata nel renderer di route", () => {
    // Era copiata letteralmente in `app/[slug]/theme.ts`, con la richiesta scritta di
    // esportarla dal guscio. Caso rifiutato: la ricomparsa del literal `\"--acid-ink\"` qui.
    const source = readFileSync(join(repoRoot, "app", "[slug]", "theme.ts"), "utf8");
    expect(source).toContain("paletteVars");
    expect(source.match(/"--acid-ink":/g)).toBeNull();
  });
});

describe("il template non entra nel contratto persistito", () => {
  it("SiteConfig non conosce nessun templateId", () => {
    // Caso che DEVE essere rifiutato: una config che porta `templateId` non è una config v1.
    // `siteConfigSchema` è `.strict()`, quindi il rifiuto è del contratto, non di una regola
    // scritta qui. Finché questo banco è verde, il confine template resta runtime-only e
    // nessuna migrazione è dovuta.
    const valida = seedPublishedConfig() as Record<string, unknown>;
    expect(siteConfigSchema.safeParse(valida).success).toBe(true);

    const conTemplate = { ...valida, templateId: "baseline" };
    const esito = siteConfigSchema.safeParse(conTemplate);
    expect(esito.success).toBe(false);
    if (esito.success) return;
    // Il rifiuto deve essere «chiave non riconosciuta», non un errore qualsiasi: è la prova
    // che è la chiusura di `.strict()` a respingerla, e che non esiste un posto dove
    // `templateId` sarebbe stato accettato.
    expect(
      esito.error.issues.some(
        (issue) =>
          issue.code === "unrecognized_keys" && issue.keys.includes("templateId"),
      ),
    ).toBe(true);
  });

  it("il vocabolario dei template non compare in lib/contract.ts", () => {
    const source = readFileSync(join(repoRoot, "lib", "contract.ts"), "utf8");
    expect(source).not.toContain("templateId");
    expect(source).not.toContain("SITE_TEMPLATE");
  });
});
