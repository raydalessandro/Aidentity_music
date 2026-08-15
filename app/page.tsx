import type { CSSProperties } from "react";

import type { SiteConfig } from "../lib/contract";

type ThemePreview = Pick<SiteConfig, "identity" | "theme" | "fontPair" | "iconFamily" | "grain" | "surfaces">;

const previews: ThemePreview[] = [
  {
    identity: {
      name: "NVLL CLICK",
      handle: "nvll-click",
      claim: "ELETTRONICA PER CORPI IN TRANSITO",
      shortBio: "Electro-pop italiano.",
      longBio: "Anteprima della shell AIDENTITY.",
      location: "Milano",
      locale: "it-IT",
    },
    theme: { ink: "#f2f5ec", panel: "#171b20", paper: "#0b0d10", muted: "#a6ad9f", dim: "#677066", line: "#364035", acid: "#c4ff30" },
    fontPair: "grotesk-mono",
    iconFamily: "line",
    grain: true,
    surfaces: [
      { id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: true }, { id: "home", enabled: true },
    ],
  },
  {
    identity: {
      name: "MIRIAM SERRA",
      handle: "miriam-serra",
      claim: "CANZONI LENTE, LUCI APERTE",
      shortBio: "Autrice e performer.",
      longBio: "Seconda configurazione del medesimo layout.",
      location: "Bologna",
      locale: "it-IT",
    },
    theme: { ink: "#241a2a", panel: "#fff7f2", paper: "#f2d9ce", muted: "#735d70", dim: "#9f8290", line: "#b992a3", acid: "#ef4d73" },
    fontPair: "serif-sans",
    iconFamily: "block",
    grain: false,
    surfaces: [
      { id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true }, { id: "merch", enabled: false }, { id: "home", enabled: true },
    ],
  },
];

function cssVars(theme: ThemePreview["theme"]): CSSProperties {
  return {
    "--ink": theme.ink,
    "--panel": theme.panel,
    "--paper": theme.paper,
    "--muted": theme.muted,
    "--dim": theme.dim,
    "--line": theme.line,
    "--acid": theme.acid,
  } as CSSProperties;
}

function Shell({ config, index }: { config: ThemePreview; index: number }) {
  const name = config.identity.name ?? "Senza nome";
  const enabled = new Set(config.surfaces.filter((surface) => surface.enabled).map((surface) => surface.id));

  return (
    <section className={`site-shell font-${config.fontPair} icons-${config.iconFamily}`} style={cssVars(config.theme)} data-grain={config.grain} aria-labelledby={`preview-${index}`}>
      <a className="skip-link" href={`#content-${index}`}>Salta al contenuto</a>
      <header className="topbar">
        <p className="wordmark">AIDENTITY / {config.identity.handle}</p>
        <p aria-label="Stato anteprima">PREVIEW · IT</p>
      </header>
      <main id={`content-${index}`} className="shell-content">
        <p className="eyebrow">{config.identity.location}</p>
        <h1 id={`preview-${index}`}>{name}</h1>
        <p className="claim">{config.identity.claim}</p>
        <div className="hero-grid" aria-label="Visual principale segnaposto">
          <div className="hero-mark" aria-hidden="true">{name.slice(0, 1)}</div>
          <p>{config.identity.shortBio}</p>
        </div>
      </main>
      <aside className="player-shell" aria-label="Player persistente non attivo">
        <span aria-hidden="true">◌</span><span>{name} — nessuna traccia in riproduzione</span><button type="button" disabled>Play</button>
      </aside>
      <nav className="dock" aria-label="Superfici del sito">
        {(["feed", "listen", "epk", "merch", "home"] as const).map((surface) => (
          <a key={surface} className={surface === "epk" ? "dock-center" : ""} href={surface === "home" ? `#content-${index}` : `#${surface}-${index}`} aria-disabled={!enabled.has(surface)}>
            {surface.toUpperCase()}
          </a>
        ))}
      </nav>
    </section>
  );
}

export default function GuscioThemable() {
  return (
    <div className="preview-stack">
      <header className="preview-intro"><p>FILONE A / GUSCIO THEMABLE</p><h2>Un layout. Identità multiple.</h2></header>
      {previews.map((config, index) => <Shell key={config.identity.handle} config={config} index={index} />)}
    </div>
  );
}
