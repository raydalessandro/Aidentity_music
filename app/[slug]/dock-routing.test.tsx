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

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteShell } from "../../components/site-shell/SiteShell";
import { StubSiteReader } from "./fixtures";
import { publishedDestination, resolveSite, surfaceHref, type SiteView } from "./read-model";
import { SurfaceShell } from "./surface-content";

async function siteView(slug: string): Promise<SiteView> {
  const resolution = await resolveSite(slug, new StubSiteReader());
  if (resolution.status !== "ok") throw new Error(`atteso sito risolvibile: ${resolution.status}`);
  return resolution.site;
}

function homePubblicata(site: SiteView): string {
  return renderToStaticMarkup(
    <SiteShell
      config={site.config}
      palette={site.palette}
      previewId={site.slug}
      destination={publishedDestination(site)}
    />,
  );
}

function homeAnteprima(site: SiteView): string {
  return renderToStaticMarkup(
    <SiteShell config={site.config} palette={site.palette} previewId={site.slug} />,
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
