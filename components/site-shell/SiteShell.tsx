import type { CSSProperties } from "react";

import type { SiteConfig } from "../../lib/contract";
import { Icon, type IconName } from "./Icon";
import type { ShellPalette } from "./palettes";

export type ShellConfig = Pick<
  SiteConfig,
  "identity" | "fontPair" | "iconFamily" | "grain" | "surfaces"
>;

type ShellProps = {
  config: ShellConfig;
  palette: ShellPalette;
  previewId: string;
  /**
   * URL della route media per l'hero (`hero_asset_id` di §7), oppure `null`.
   *
   * Aggiunta additiva: senza questa prop la shell rende esattamente il segnaposto di prima,
   * quindi nessun chiamante esistente cambia comportamento. La shell non sa da dove venga
   * l'URL e non deve saperlo: è una stringa, mai un path dello Storage.
   */
  heroSrc?: string | null;
};

function paletteVars(palette: ShellPalette): CSSProperties {
  return {
    "--ink": palette.ink,
    "--panel": palette.panel,
    "--paper": palette.paper,
    "--muted": palette.muted,
    "--dim": palette.dim,
    "--line": palette.line,
    "--acid": palette.acid,
    "--acid-ink": palette.acidInk,
  } as CSSProperties;
}

export function ShellTopbar({ handle }: { handle: string | null }) {
  return <header className="topbar"><p className="wordmark">AIDENTITY / {handle ?? "bozza"}</p><p>PREVIEW · IT</p></header>;
}

export function PlayerShell({ artist }: { artist: string }) {
  return <aside className="player-shell" aria-label="Player persistente non attivo"><Icon name="pause" /><span>{artist} — nessuna traccia in riproduzione</span><button type="button" disabled><Icon name="play" label="Riproduci" /></button></aside>;
}

const surfaceIcon: Record<"feed" | "listen" | "epk" | "merch" | "home", IconName> = { feed: "feed", listen: "listen", epk: "epk", merch: "merch", home: "home" };

export function SurfaceDock({ config, previewId }: Pick<ShellProps, "config" | "previewId">) {
  const enabled = new Set(config.surfaces.filter((surface) => surface.enabled).map((surface) => surface.id));
  return <nav className="dock" aria-label={`Superfici di ${config.identity.name ?? "anteprima"}`}>{(["feed", "listen", "epk", "merch", "home"] as const).map((surface) => <a key={surface} className={surface === "epk" ? "dock-center" : ""} href={surface === "home" ? `#content-${previewId}` : `#${surface}-${previewId}`} aria-disabled={!enabled.has(surface)}><Icon name={surfaceIcon[surface]} /><span>{surface.toUpperCase()}</span></a>)}</nav>;
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

export function SiteShell({ config, palette, previewId, heroSrc = null }: ShellProps) {
  const name = config.identity.name ?? "Senza nome";
  return <section className={`site-shell font-${config.fontPair} icons-${config.iconFamily}`} style={paletteVars(palette)} data-grain={config.grain} data-palette={palette.id} aria-labelledby={`preview-${previewId}`}>
    <a className="skip-link" href={`#content-${previewId}`}>Salta al contenuto</a>
    <ShellTopbar handle={config.identity.handle} />
    <div id={`content-${previewId}`} className="shell-content">
      <p className="eyebrow">{config.identity.location}</p>
      <h1 id={`preview-${previewId}`}>{name}</h1>
      <p className="claim">{config.identity.claim}</p>
      {heroSrc === null
        ? <div className="hero-grid" aria-label="Visual principale segnaposto"><div className="hero-mark" aria-hidden="true">{name.slice(0, 1)}</div><p>{config.identity.shortBio}</p></div>
        : <div className="hero-grid" aria-label="Visual principale"><HeroImage src={heroSrc} alt={`Visual principale di ${name}`} /><p>{config.identity.shortBio}</p></div>}
    </div>
    <PlayerShell artist={name} />
    <SurfaceDock config={config} previewId={previewId} />
  </section>;
}
