import type { ReactNode } from "react";

import { paletteVars } from "../../components/site-shell/style";
import { loadSite } from "./composition";
import { PlayerBar, PlayerProvider } from "./player-provider";
import styles from "./site-runtime.module.css";

/**
 * Il provider vive nel layout per non rimontare l'unico <audio> fra le superfici.
 * Il wrapper porta anche la palette del tenant sopra PlayerBar: il player è fratello
 * della pagina, quindi non può ereditare i CSS custom properties dichiarati dentro Unica.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const resolution = await loadSite(slug);
  const palette = resolution.status === "ok" ? paletteVars(resolution.site.palette) : undefined;

  return (
    <div className={styles.runtime} style={palette}>
      <PlayerProvider>
        {children}
        <PlayerBar />
      </PlayerProvider>
    </div>
  );
}
