import Link from "next/link";

import { Icon, type IconName } from "./Icon";
import type { ShellPalette } from "./palettes";
import { paletteVars } from "./style";
import type { ShellConfig, ShellDestination, ShellSurfaceId } from "./types";

/**
 * I tipi del guscio vivono in `./types` perché il confine template possa nominarli senza
 * importare questo componente. Restano esportati da qui: gli import esistenti non cambiano.
 */
export type { ShellConfig, ShellDestination, ShellSurfaceId } from "./types";

type ShellProps = {
  config: ShellConfig;
  palette: ShellPalette;
  previewId: string;
  /**
   * Assente significa anteprima: ogni chiamante che non decide resta esattamente com'era,
   * e il default non può far finire `PREVIEW` su un sito pubblicato per dimenticanza —
   * quella strada richiede di passare gli href, cioè di averci pensato.
   */
  destination?: ShellDestination;
  /**
   * URL della route media per l'hero (`hero_asset_id` di §7), oppure `null`.
   *
   * Aggiunta additiva: senza questa prop la shell rende esattamente il segnaposto di prima,
   * quindi nessun chiamante esistente cambia comportamento. La shell non sa da dove venga
   * l'URL e non deve saperlo: è una stringa, mai un path dello Storage.
   */
  heroSrc?: string | null;
};

/**
 * `published` non ha default: ogni chiamante deve dichiarare cosa sta rendendo. Un default
 * qui significherebbe che dimenticarsene stampa la parola sbagliata, e la parola sbagliata
 * la legge il visitatore di un sito vero.
 */
export function ShellTopbar({ handle, published }: { handle: string | null; published: boolean }) {
  return <header className="topbar"><p className="wordmark">AIDENTITY / {handle ?? "bozza"}</p>{published ? null : <p>PREVIEW · IT</p>}</header>;
}

export function PlayerShell({ artist }: { artist: string }) {
  return <aside className="player-shell" aria-label="Player persistente non attivo"><Icon name="pause" /><span>{artist} — nessuna traccia in riproduzione</span><button type="button" disabled><Icon name="play" label="Riproduci" /></button></aside>;
}

const surfaceIcon: Record<"feed" | "listen" | "epk" | "merch" | "home", IconName> = { feed: "feed", listen: "listen", epk: "epk", merch: "merch", home: "home" };

const DOCK_ORDER: readonly ShellSurfaceId[] = ["feed", "listen", "epk", "merch", "home"];

/**
 * Su un sito pubblicato una superficie spenta **non compare**, invece di comparire con
 * `aria-disabled`: quell'attributo è un'informazione per la tecnologia assistiva, non un
 * freno: un `<a href>` marcato `aria-disabled` naviga comunque, e navigherebbe verso un 404.
 * È la stessa regola che `SurfaceNav` applica sulle altre superfici — «una superficie spenta
 * non compare qui e non è raggiungibile via URL».
 *
 * In anteprima resta tutto com'era: lo showroom mostra apposta le differenze fra i quattro
 * template, spenta compresa, e le ancore servono la pagina a schermo unico.
 */
export function SurfaceDock({ config, previewId, destination = { kind: "anteprima" } }: Pick<ShellProps, "config" | "previewId" | "destination">) {
  const enabled = new Set(config.surfaces.filter((surface) => surface.enabled).map((surface) => surface.id));
  const label = `Superfici di ${config.identity.name ?? "anteprima"}`;

  if (destination.kind === "pubblicato") {
    const { hrefs } = destination;
    return <nav className="dock" aria-label={label}>{DOCK_ORDER.filter((surface) => enabled.has(surface)).map((surface) => <Link key={surface} className={surface === "epk" ? "dock-center" : ""} href={hrefs[surface]}><Icon name={surfaceIcon[surface]} /><span>{surface.toUpperCase()}</span></Link>)}</nav>;
  }

  return <nav className="dock" aria-label={label}>{DOCK_ORDER.map((surface) => <a key={surface} className={surface === "epk" ? "dock-center" : ""} href={surface === "home" ? `#content-${previewId}` : `#${surface}-${previewId}`} aria-disabled={!enabled.has(surface)}><Icon name={surfaceIcon[surface]} /><span>{surface.toUpperCase()}</span></a>)}</nav>;
}

/**
 * `<img>` e non `next/image`: la sorgente è la route media, che serve byte già mediati da
 * un controllo di pubblicazione e con il proprio `content-type`. L'ottimizzatore
 * aggiungerebbe un secondo passaggio server sullo stesso contenuto, e la sua cache vivrebbe
 * fuori dal controllo che rende revocabile l'accesso.
 */
function HeroImage({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- vedi la nota qui sopra
  return <img className="hero-image" src={src} alt={alt} />;
}

export function SiteShell({ config, palette, previewId, heroSrc = null, destination = { kind: "anteprima" } }: ShellProps) {
  const name = config.identity.name ?? "Senza nome";
  const published = destination.kind === "pubblicato";
  return <section className={`site-shell font-${config.fontPair} icons-${config.iconFamily}`} style={paletteVars(palette)} data-grain={config.grain} data-palette={palette.id} aria-labelledby={`preview-${previewId}`}>
    <a className="skip-link" href={`#content-${previewId}`}>Salta al contenuto</a>
    <ShellTopbar handle={config.identity.handle} published={published} />
    <div id={`content-${previewId}`} className="shell-content">
      <p className="eyebrow">{config.identity.location}</p>
      <h1 id={`preview-${previewId}`}>{name}</h1>
      <p className="claim">{config.identity.claim}</p>
      {heroSrc === null
        ? <div className="hero-grid" aria-label="Visual principale segnaposto"><div className="hero-mark" aria-hidden="true">{name.slice(0, 1)}</div><p>{config.identity.shortBio}</p></div>
        : <div className="hero-grid" aria-label="Visual principale"><HeroImage src={heroSrc} alt={`Visual principale di ${name}`} /><p>{config.identity.shortBio}</p></div>}
    </div>
    {/*
      Su `/[slug]` il player vero è `PlayerBar`, montato nel layout perché sopravviva al
      cambio di superficie. Il segnaposto spento qui sotto è nato quando quel player non
      esisteva ancora: su un sito pubblicato oggi è solo un tasto che non fa nulla accanto a
      uno che funziona. Nelle anteprime resta, perché lì il player vero non c'è.
    */}
    {published ? null : <PlayerShell artist={name} />}
    <SurfaceDock config={config} previewId={previewId} destination={destination} />
  </section>;
}
