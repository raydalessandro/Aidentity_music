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
    identity: { name: "MIRIAM SERRA", handle: "miriam-serra", claim: "CANZONI LENTE, LUCI APERTE", shortBio: "Autrice e performer.", longBio: "Seconda identità dentro lo stesso template.", location: "Bologna", locale: "it-IT" },
    fontPair: "serif-sans", iconFamily: "block", grain: false,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: false }, { id: "home", enabled: true }],
  },
  {
    identity: { name: "GIADA NOVA", handle: "giada-nova", claim: "SINTESI DI LUCE E MAREA", shortBio: "Pop elettronico in movimento.", longBio: "Terza identità per mostrare quanto la palette cambi il tono senza cambiare la struttura.", location: "Napoli", locale: "it-IT" },
    fontPair: "display-grotesk", iconFamily: "stencil", grain: true,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true }],
  },
  {
    identity: { name: "TERRA ROSSA", handle: "terra-rossa", claim: "VOCI PER NOTTI APERTE", shortBio: "Canzoni, chitarre e rumore.", longBio: "Quarta identità dello stesso template mobile-first.", location: "Roma", locale: "it-IT" },
    fontPair: "grotesk-mono", iconFamily: "line", grain: false,
    surfaces: [{ id: "feed", enabled: true }, { id: "listen", enabled: false }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true }],
  },
];

export default function GuscioThemable() {
  return <>
    <Landing />
    <div className="preview-stack">
      <header className="preview-intro" id="template">
        <p>UNICA / PRIMO TEMPLATE</p>
        <h2>Una struttura. Identità che non sembrano copie.</h2>
        <p className="preview-nota">Quattro palette e quattro artisti sullo stesso renderer mobile-first. I prossimi template cambieranno la regia visuale, non i dati.</p>
      </header>
      {shellPalettes.map((palette, index) => <SiteTemplateHome key={palette.id} config={demoConfigs[index]!} palette={palette} previewId={palette.id} embedded />)}
    </div>
  </>;
}
