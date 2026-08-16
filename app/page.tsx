import { Landing } from "../components/landing/Landing";
import { SiteShell, type ShellConfig } from "../components/site-shell/SiteShell";
import { shellPalettes } from "../components/site-shell/palettes";

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
  return <div className="preview-stack">
    <Landing />
    {/*
      Lo showroom resta, e resta in modalità anteprima: è una dimostrazione, non quattro siti
      pubblicati. Le ancore del dock e il badge `PREVIEW` qui sono corretti, ed è anche il
      contratto che `e2e/shell.spec.ts` misura — quattro `[data-palette]`, ciascuno con il
      proprio `.dock-center` e `.player-shell button` sopra 4.5:1.
    */}
    <header className="preview-intro" id="template">
      <p>QUATTRO TEMPLATE</p>
      <h2>Un layout. Identità multiple.</h2>
      <p className="preview-nota">Cambiano colori, caratteri e icone. La struttura no.</p>
    </header>
    {shellPalettes.map((palette, index) => <SiteShell key={palette.id} config={demoConfigs[index]!} palette={palette} previewId={palette.id} />)}
  </div>;
}
