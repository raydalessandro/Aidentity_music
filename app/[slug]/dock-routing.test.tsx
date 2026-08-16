// La giuntura fra il guscio di A e le rotte di D.
//
// Il difetto che questi banchi presidiano non era teorico: su un sito pubblicato il dock
// emetteva `#feed-<slug>` verso sezioni che su quella pagina non esistono, quindi **nessuna
// superficie era raggiungibile cliccando** — mentre `/[slug]/feed` esisteva e funzionava,
// raggiungibile solo digitando l'URL. Due navigazioni per lo stesso sito, che puntavano a
// posti diversi, e nessun test che le confrontasse.
//
// Misurato prima di scrivere questi banchi: con il dock riportato alle ancore, la suite
// restava interamente verde. È il motivo per cui questo file esiste.
//
// Dal confine template in poi questi banchi rendono la HOME **attraverso**
// `SiteTemplateHome`, non più direttamente con `SiteShell`. Non è un dettaglio di stile: la
// prop che porta tutto questo comportamento è `destination`, e un livello di dispatch che
// smettesse di propagarla non sarebbe un errore di tipo — la prop è opzionale e il default è
// l'anteprima. Rendendo dal confine, la mancata propagazione riaccende esattamente i difetti
// che questo file presidia. Misurato: sostituendo lo spread di `SiteTemplate.tsx` con un
// elenco esplicito di prop che dimentica `destination`, 9 banchi di questo file diventano
// rossi (13 in tutta la suite). Togliendo invece `destination` dalla sola route `/[slug]`,
// ne diventano rossi 2 — quelli in fondo, che montano il componente di route vero.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { SiteTemplateHome } from "../../components/site-templates/SiteTemplate";
import { configureSiteReader, resetSiteReader } from "./composition";
import { StubSiteReader } from "./fixtures";
import HomeSurface from "./page";
import { publishedDestination, resolveSite, surfaceHref, type SiteView } from "./read-model";
import { SurfaceShell } from "./surface-content";

async function siteView(slug: string): Promise<SiteView> {
  const resolution = await resolveSite(slug, new StubSiteReader());
  if (resolution.status !== "ok") throw new Error(`atteso sito risolvibile: ${resolution.status}`);
  return resolution.site;
}

/** La route vera, con il lettore di prova iniettato dal bordo di composizione. */
async function routePubblicata(slug: string): Promise<string> {
  configureSiteReader(new StubSiteReader());
  return renderToStaticMarkup(await HomeSurface({ params: Promise.resolve({ slug }) }));
}

afterEach(() => {
  resetSiteReader();
});

function homePubblicata(site: SiteView): string {
  return renderToStaticMarkup(
    <SiteTemplateHome
      config={site.config}
      palette={site.palette}
      previewId={site.slug}
      destination={publishedDestination(site)}
    />,
  );
}

function homeAnteprima(site: SiteView): string {
  return renderToStaticMarkup(
    <SiteTemplateHome config={site.config} palette={site.palette} previewId={site.slug} />,
  );
}

describe("il dock della home pubblicata naviga", () => {
  it("porta alle rotte delle superfici, non alle ancore", async () => {
    const site = await siteView("nvll-click");
    const markup = homePubblicata(site);

    for (const surface of ["feed", "listen", "epk"] as const) {
      expect(markup).toContain(`href="${surfaceHref(site.slug, surface)}"`);
    }
    // L'ancora non deve sopravvivere accanto alla rotta: se ricomparisse, il difetto
    // sarebbe tornato per metà e il test sopra continuerebbe a passare.
    expect(markup).not.toContain("#feed-nvll-click");
    expect(markup).not.toContain("#listen-nvll-click");
  });

  it("la voce HOME punta alla radice del sito, non all'ancora del contenuto", async () => {
    const site = await siteView("nvll-click");
    expect(homePubblicata(site)).toContain('href="/nvll-click"');
  });

  it("dock e navigazione delle altre superfici concordano su ogni indirizzo", async () => {
    // L'invariante vero: due sorgenti di verità per lo stesso indirizzo erano il difetto.
    const site = await siteView("nvll-click");
    const dock = homePubblicata(site);
    const nav = renderToStaticMarkup(
      <SurfaceShell site={site} surface="listen">
        <p>contenuto</p>
      </SurfaceShell>,
    );

    for (const surface of site.surfaces.filter((entry) => entry.enabled && entry.id !== "listen")) {
      expect(dock).toContain(`href="${surface.href}"`);
      expect(nav).toContain(`href="${surface.href}"`);
    }
  });
});

describe("una superficie spenta non è raggiungibile", () => {
  // Il caso che DEVE essere rifiutato. `miriam-serra` ha `merch` spenta nella fixture.
  it("MERCH spenta non compare affatto nel dock del sito pubblicato", async () => {
    const site = await siteView("miriam-serra");
    const markup = homePubblicata(site);

    expect(markup).not.toContain(`href="${surfaceHref(site.slug, "merch")}"`);
    expect(markup).not.toContain("MERCH");
    // Le altre restano: il test fallirebbe anche se il dock sparisse del tutto.
    expect(markup).toContain(`href="${surfaceHref(site.slug, "feed")}"`);
  });

  it("`aria-disabled` non è usato al posto dell'assenza sul sito pubblicato", async () => {
    // Un `<a href>` marcato `aria-disabled` naviga comunque: è un'informazione per la
    // tecnologia assistiva, non un freno. Su un sito vero porterebbe a un 404.
    expect(homePubblicata(await siteView("miriam-serra"))).not.toContain("aria-disabled");
  });
});

describe("l'anteprima resta quello che era", () => {
  it("lo showroom continua a usare le ancore a schermo unico", async () => {
    const markup = homeAnteprima(await siteView("nvll-click"));
    expect(markup).toContain("#feed-nvll-click");
    expect(markup).not.toContain('href="/nvll-click/feed"');
  });

  it("in anteprima la superficie spenta compare, marcata", async () => {
    const markup = homeAnteprima(await siteView("miriam-serra"));
    expect(markup).toContain("MERCH");
    expect(markup).toContain("aria-disabled");
  });
});

describe("un sito pubblicato non si presenta come un'anteprima", () => {
  it("la topbar non dice PREVIEW", async () => {
    expect(homePubblicata(await siteView("nvll-click"))).not.toContain("PREVIEW");
  });

  it("l'anteprima invece lo dice", async () => {
    expect(homeAnteprima(await siteView("nvll-click"))).toContain("PREVIEW");
  });

  it("nemmeno le superfici diverse da HOME dicono PREVIEW", async () => {
    const site = await siteView("nvll-click");
    const markup = renderToStaticMarkup(
      <SurfaceShell site={site} surface="feed">
        <p>contenuto</p>
      </SurfaceShell>,
    );
    expect(markup).not.toContain("PREVIEW");
  });

  it("il player spento non occupa lo spazio del player vero", async () => {
    // Su `/[slug]` il player reale è `PlayerBar`, montato nel layout. Il segnaposto
    // disabilitato accanto a un player funzionante è un tasto che non fa nulla.
    expect(homePubblicata(await siteView("nvll-click"))).not.toContain("player-shell");
  });

  it("in anteprima il segnaposto resta, perché lì il player vero non c'è", async () => {
    expect(homeAnteprima(await siteView("nvll-click"))).toContain("player-shell");
  });
});

describe("la route `/[slug]` monta davvero una HOME pubblicata", () => {
  // I banchi sopra rendono il guscio con props costruiti a mano: dimostrano che il guscio si
  // comporta bene se riceve la destinazione giusta, non che la route gliela passi. Dopo il
  // confine template la catena da presidiare è più lunga — route → SiteTemplateHome →
  // registry → baseline → SiteShell — e un anello che perde `destination` non è un errore di
  // tipo. Questi due banchi la percorrono per intero, montando il componente di route vero.

  it("il markup della route ha il dock verso le rotte e non si dichiara anteprima", async () => {
    const markup = await routePubblicata("nvll-click");

    expect(markup).toContain('href="/nvll-click/feed"');
    expect(markup).toContain('href="/nvll-click/listen"');
    expect(markup).not.toContain("#feed-nvll-click");
    expect(markup).not.toContain("PREVIEW");
    expect(markup).not.toContain("player-shell");
  });

  it("una superficie spenta non compare nel dock servito dalla route", async () => {
    // Il caso che DEVE essere rifiutato: `miriam-serra` ha MERCH spenta nella fixture, e
    // l'href esisterebbe. L'esito atteso è l'assenza, non un elemento marcato.
    const markup = await routePubblicata("miriam-serra");

    expect(markup).not.toContain('href="/miriam-serra/merch"');
    expect(markup).not.toContain("aria-disabled");
    // Se il dock sparisse del tutto questo banco resterebbe verde: ci pensa la riga sotto.
    expect(markup).toContain('href="/miriam-serra/feed"');
  });
});
