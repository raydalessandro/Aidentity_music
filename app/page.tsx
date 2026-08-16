import { Landing } from "../components/landing/Landing";
import { shellPalettes } from "../components/site-shell/palettes";
import type { ShellConfig } from "../components/site-shell/types";
import { SiteTemplateHome } from "../components/site-templates/SiteTemplate";

const demoConfigs: readonly ShellConfig[] = [
  {
    identity: { name: "NVLL CLICK", handle: "nvll-click", claim: "ELETTRONICA PER CORPI IN TRANSITO", shortBio: "Electro-pop italiano.", longBio: "Anteprima della shell AIDENTITY.", location: "Milano", locale: "it-IT" },
    fontPair: "grotesk-mono", iconFamily: "line", grain: true,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true }],
  },
  {
    identity: { name: "MIRIAM SERRA", handle: "miriam-serra", claim: "CANZONI LENTE, LUCI APERTE", shortBio: "Autrice e performer.", longBio: "Seconda configurazione del medesimo layout.", location: "Bologna", locale: "it-IT" },
    fontPair: "serif-sans", iconFamily: "block", grain: false,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: false }, { id: "home", enabled: true }],
  },
  {
    identity: { name: "GIADA NOVA", handle: "giada-nova", claim: "SINTESI DI LUCE E MAREA", shortBio: "Pop elettronico in movimento.", longBio: "Terza configurazione per le verifiche di contrasto.", location: "Napoli", locale: "it-IT" },
    fontPair: "display-grotesk", iconFamily: "stencil", grain: true,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true }],
  },
  {
    identity: { name: "TERRA ROSSA", handle: "terra-rossa", claim: "VOCI PER NOTTI APERTE", shortBio: "Canzoni, chitarre e rumore.", longBio: "Quarta configurazione del tema AIDENTITY.", location: "Roma", locale: "it-IT" },
    fontPair: "grotesk-mono", iconFamily: "line", grain: false,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: false }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true }],
  },
];

export default function GuscioThemable() {
  return <>
    <Landing />
    <div className="preview-stack">
      {/*
        Lo showroom resta un banco reale del renderer e non viene copiato dentro la landing.
        Control Room gli costruisce attorno la porta commerciale; questi quattro gusci restano
        invece la dimostrazione tecnica/visuale che i template usano la stessa composizione.
      */}
      <header className="preview-intro" id="template">
        <p>QUATTRO TEMPLATE / RENDERER REALE</p>
        <h2>Un&apos;ossatura. Quattro toni.</h2>
        <p className="preview-nota">Cambiano colori, caratteri e icone. La struttura e i dati restano coerenti.</p>
      </header>
      {/*
        Nessun `destination`: lo showroom è e resta un'anteprima a schermo unico. È la stessa
        assenza di prima — passare dal confine template non la cambia.
      */}
      {shellPalettes.map((palette, index) => <SiteTemplateHome key={palette.id} config={demoConfigs[index]!} palette={palette} previewId={palette.id} />)}
    </div>
  </>;
}
