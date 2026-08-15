import type { ReactNode } from "react";

import { PlayerBar, PlayerProvider } from "./player-provider";

/**
 * Il provider vive qui e non nelle pagine: il layout non viene rimontato quando si passa
 * da una superficie all'altra, quindi l'unico elemento `audio` dell'app resta lo stesso
 * e la riproduzione non si interrompe (piano §D).
 */
export default function SiteLayout({ children }: { readonly children: ReactNode }) {
  return (
    <PlayerProvider>
      {children}
      <PlayerBar />
    </PlayerProvider>
  );
}
