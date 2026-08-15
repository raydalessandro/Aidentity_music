// Iframe isolato per le tracce `embed` (piano §D). L'elemento `audio` non c'entra:
// la barra del player non tenta di controllare gli iframe esterni (L0.7 §3).

import { embedSrc } from "./embed";
import type { EmbedProvider } from "./site-reader";

const PROVIDER_LABEL: Readonly<Record<EmbedProvider, string>> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
};

export function EmbedFrame({
  title,
  provider,
  url,
}: {
  readonly title: string;
  readonly provider: EmbedProvider;
  readonly url: string;
}) {
  const src = embedSrc(provider, url);
  // Nessun iframe da un URL fuori allowlist: meglio niente che una cornice arbitraria.
  if (src === null) return null;

  return (
    <iframe
      className="embed-frame"
      title={`${title} — ${PROVIDER_LABEL[provider]}`}
      src={src}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      allow="encrypted-media; picture-in-picture"
    />
  );
}
