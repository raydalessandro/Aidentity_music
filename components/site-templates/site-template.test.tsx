import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { seedPublishedConfig } from "../../app/[slug]/fixtures";
import { siteConfigSchema } from "../../lib/contract";
import { shellPalettes } from "../site-shell/palettes";
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
  sectionCopy: { version: 1 },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true },
    { id: "listen", enabled: true },
    { id: "epk", enabled: true },
    { id: "merch", enabled: false },
    { id: "home", enabled: true },
  ],
};

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

function home(destination?: ShellDestination) {
  return renderToStaticMarkup(
    <SiteTemplateHome
      config={config}
      palette={palette}
      previewId="nvll-click"
      heroSrc="/api/media/asset/site/hero"
      destination={destination}
    />,
  );
}

describe("registry template", () => {
  it("parte da Unica come unico template runtime", () => {
    expect(SITE_TEMPLATE_IDS).toEqual(["unica"]);
    expect(DEFAULT_SITE_TEMPLATE_ID).toBe("unica");
    expect(siteTemplates.map((template) => template.id)).toEqual(["unica"]);
    expect(getSiteTemplate().label).toBe("Unica");
  });

  it("Unica consuma identità, palette e hero senza introdurre un secondo contratto dati", () => {
    const markup = home();
    expect(markup).toContain('data-template="unica"');
    expect(markup).toContain("NVLL CLICK");
    expect(markup).toContain("Electro-pop italiano");
    expect(markup).toContain('src="/api/media/asset/site/hero"');
    expect(markup).toContain("--acid:");
  });
});

describe("Unica conserva la semantica pubblicato / anteprima", () => {
  it("sul pubblicato usa le rotte vere, tace PREVIEW e non monta il player spento", () => {
    const markup = home(pubblicato);
    expect(markup).toContain('href="/nvll-click/feed"');
    expect(markup).toContain('href="/nvll-click/listen"');
    expect(markup).toContain('href="/nvll-click"');
    expect(markup).not.toContain("#feed-nvll-click");
    expect(markup).not.toContain("PREVIEW");
    expect(markup).not.toContain("player-shell");
  });

  it("in anteprima usa le ancore, dichiara PREVIEW e conserva il player segnaposto", () => {
    const markup = home();
    expect(markup).toContain("#feed-nvll-click");
    expect(markup).toContain("#listen-nvll-click");
    expect(markup).toContain("PREVIEW");
    expect(markup).toContain("player-shell");
  });

  it("LISTEN è il fulcro visuale del dock senza cambiare la destinazione", () => {
    const markup = home(pubblicato);
    expect(markup).toContain("dock-center");
    expect(markup).toContain('href="/nvll-click/listen"');
  });

  it("una superficie spenta non esiste sul pubblicato ma resta leggibile in anteprima", () => {
    const publicMarkup = home(pubblicato);
    expect(publicMarkup).not.toContain('href="/nvll-click/merch"');
    expect(publicMarkup).not.toContain("MERCH");

    const previewMarkup = home();
    expect(previewMarkup).toContain("MERCH");
    expect(previewMarkup).toContain("aria-disabled");
  });
});

describe("superfici Unica", () => {
  const surface = (published: boolean) => renderToStaticMarkup(
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

  it("mantiene label, children, navigazione e stato corrente", () => {
    const markup = surface(true);
    expect(markup).toContain('data-template="unica"');
    expect(markup).toContain('data-surface="listen"');
    expect(markup).toContain("ASCOLTI");
    expect(markup).toContain("contenuto");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/nvll-click/feed"');
    expect(markup).not.toContain('href="/nvll-click/merch"');
  });

  it("la parola PREVIEW resta una decisione del chiamante", () => {
    expect(surface(true)).not.toContain("PREVIEW");
    expect(surface(false)).toContain("PREVIEW");
  });
});

describe("le route restano dietro il confine template", () => {
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

  it("surface-content continua a delegare il chrome", () => {
    const source = readFileSync(join(repoRoot, "app", "[slug]", "surface-content.tsx"), "utf8");
    expect(source).toContain("SiteTemplateSurface");
    expect(source).not.toContain("ShellTopbar");
    expect(source).not.toContain('from "next/link"');
  });
});

describe("il template resta fuori dal contratto persistito", () => {
  it("SiteConfig v1 rifiuta templateId", () => {
    const valida = seedPublishedConfig() as Record<string, unknown>;
    expect(siteConfigSchema.safeParse(valida).success).toBe(true);
    expect(siteConfigSchema.safeParse({ ...valida, templateId: "unica" }).success).toBe(false);
  });

  it("lib/contract.ts non conosce il vocabolario template", () => {
    const source = readFileSync(join(repoRoot, "lib", "contract.ts"), "utf8");
    expect(source).not.toContain("templateId");
    expect(source).not.toContain("SITE_TEMPLATE");
  });
});

describe("navigare fra superfici non deve fermare la musica", () => {
  // Difetto trovato in revisione, non teorico: le CTA della hero e i moduli usavano
  // `<a href={homeHref(...)}>` mentre il dock usava `Link`. Su un sito pubblicato un
  // `<a>` ricarica il documento, e il ricaricamento smonta il `PlayerBar` che vive nel
  // layout apposta per sopravvivere al cambio di superficie: premere ASCOLTA avrebbe
  // fermato la traccia in riproduzione. In un template il cui primo verbo è «ascolta»
  // è il difetto peggiore possibile.
  //
  // Il controllo è sul sorgente perché in SSR `Link` rende comunque un `<a>`: nel
  // markup i due casi sono indistinguibili, quindi un banco sul markup non potrebbe
  // vedere la differenza.
  const sorgenti = ["unica.tsx"] as const;

  it.each(sorgenti)("%s non collega una superficie con un <a> grezzo", (file) => {
    const sorgente = readFileSync(join(repoRoot, "components/site-templates", file), "utf8");
    const grezzi = sorgente.match(/<a\b[^>]*href=\{\s*homeHref/gu) ?? [];
    expect(grezzi, "usa SurfaceLink: da pubblicato deve essere un Link").toEqual([]);
  });

  it("il collegamento condiviso rende un Link da pubblicato e un <a> in anteprima", () => {
    const sorgente = readFileSync(join(repoRoot, "components/site-templates/unica.tsx"), "utf8");
    expect(sorgente).toContain("function SurfaceLink(");
    // Il ramo pubblicato deve usare `Link`; quello in anteprima resta `<a>` perché
    // l'indirizzo è un'ancora nella stessa pagina ed è l'unico modo di marcare una
    // superficie spenta con `aria-disabled`. Si verificano le due forme esatte invece
    // di ritagliare il corpo della funzione: un ritaglio con una regex è fragile e
    // fallirebbe per ragioni che non c'entrano con l'invariante.
    // Non si inchiodano le stringhe esatte: il builder live ha aggiunto a questo
    // componente `interactive` e il gancio del dock, e un'asserzione letterale si
    // era rotta per un attributo in mezzo — cioe' per una ragione che non c'entra
    // con l'invariante. Si verifica il ramo, non la sua punteggiatura.
    const ramoPubblicato = /if \(published\)\s*\{\s*return <Link/u.test(sorgente);
    expect(ramoPubblicato, "da pubblicato deve rendere un Link").toBe(true);
    expect(sorgente).toContain("aria-disabled");
  });
});

describe("quattro gusci nella stessa pagina non sono quattro pagine", () => {
  // Difetto trovato dalla CI, non da questa suite: Unica rende `<main>` dove il
  // guscio precedente rendeva un `<div>`. Su un sito vero è corretto, ma lo showroom
  // monta quattro Home nello stesso documento — e axe segnala «Document has more than
  // one main landmark». Chi naviga per landmark si troverebbe quattro «contenuti
  // principali». La prop `embedded` esisteva già ma scriveva solo un attributo.
  it("incorporato non dichiara un landmark principale", () => {
    const markup = renderToStaticMarkup(
      <SiteTemplateHome config={config} palette={palette} previewId="prova" embedded />,
    );
    expect(markup).not.toContain("<main");
  });

  it("da solo invece sì: è la pagina", () => {
    const markup = renderToStaticMarkup(
      <SiteTemplateHome config={config} palette={palette} previewId="prova" />,
    );
    expect(markup).toContain("<main");
  });

  it("la radice non contiene più di un landmark principale", async () => {
    // Il conto vero sulla pagina che axe misura davvero.
    const { default: Root } = await import("../../app/page");
    const markup = renderToStaticMarkup(<Root />);
    expect((markup.match(/<main\b/gu) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe("il visual principale porta un gancio dichiarato", () => {
  // L'e2e cercava `img.hero-image`, una classe di stile: con i CSS module la classe in
  // pagina porta un hash e il selettore non trovava nulla. Il contratto è l'attributo.
  it("l'immagine hero è raggiungibile da `[data-hero-image]`", () => {
    const markup = renderToStaticMarkup(
      <SiteTemplateHome
        config={config}
        palette={palette}
        previewId="prova"
        heroSrc="/api/media/asset/x/y"
      />,
    );
    expect(markup).toContain("data-hero-image");
    expect(markup).toContain('src="/api/media/asset/x/y"');
  });
});

describe("la preview incorporata nel builder non finge di navigare", () => {
  // Il builder live rende il template vero come fondale. Un collegamento che
  // sembra portare a un'altra superficie, dentro un'anteprima che non naviga,
  // e' una promessa che l'interfaccia non mantiene — e su mobile e' peggio,
  // perche' il dito ci finisce sopra per sbaglio.
  it("con `interactive={false}` nessun collegamento di superficie porta un href", () => {
    const markup = renderToStaticMarkup(
      <SiteTemplateHome config={config} palette={palette} previewId="builder" embedded interactive={false} />,
    );
    // L'unico indirizzo ammesso resta lo skip link, che punta dentro la stessa
    // pagina ed e' un requisito di accessibilita', non una navigazione. Tutto il
    // resto — dock, CTA, moduli — non deve avere un href da toccare.
    const indirizzi = [...markup.matchAll(/href="([^"]*)"/gu)].map((trovato) => trovato[1]);
    expect(indirizzi).toEqual(["#content-builder"]);
  });

  it("senza quella prop invece i collegamenti esistono: e' il caso normale", () => {
    const markup = renderToStaticMarkup(
      <SiteTemplateHome config={config} palette={palette} previewId="builder" embedded />,
    );
    expect(markup).toContain("href=");
  });
});
