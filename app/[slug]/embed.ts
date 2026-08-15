// Allowlist degli embed. Unica fonte lato applicazione; la fonte normativa è
// `private.valid_embed_url` nella migrazione PR-0 (L0.7 §5).
// `embed.parity.test.ts` fallisce se questa mappa e la funzione SQL divergono.
//
// L'iframe non nasce mai da un dominio HTTPS arbitrario: il renderer accetta soltanto
// gli host qui elencati, e li verifica parsando l'URL, non con una regex approssimata.

import type { EmbedProvider } from "./site-reader";

export const EMBED_HOSTS: Readonly<Record<EmbedProvider, readonly string[]>> = {
  spotify: ["open.spotify.com"],
  apple_music: ["music.apple.com", "embed.music.apple.com"],
  youtube: ["youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"],
  soundcloud: ["soundcloud.com"],
};

/** Host del player SoundCloud: non è un host memorizzabile, solo una destinazione iframe. */
export const SOUNDCLOUD_PLAYER_HOST = "w.soundcloud.com";

function parseHttps(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" ? parsed : null;
}

export function isAllowedEmbed(provider: EmbedProvider, url: string): boolean {
  const parsed = parseHttps(url);
  if (parsed === null) return false;
  return EMBED_HOSTS[provider].includes(parsed.hostname);
}

function youtubeId(parsed: URL): string | null {
  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return id === "" ? null : id;
  }
  if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.slice("/embed/".length) || null;
  return parsed.searchParams.get("v");
}

/**
 * Sorgente dell'iframe della piattaforma. Funzione pura: URL memorizzato -> URL da incorporare.
 * Restituisce `null` quando l'URL non è incorporabile: meglio nessun iframe di uno rotto.
 */
export function embedSrc(provider: EmbedProvider, url: string): string | null {
  if (!isAllowedEmbed(provider, url)) return null;
  const parsed = parseHttps(url);
  if (parsed === null) return null;

  switch (provider) {
    case "spotify": {
      if (parsed.pathname.startsWith("/embed/")) return parsed.toString();
      return `https://open.spotify.com/embed${parsed.pathname}`;
    }
    case "apple_music": {
      return `https://embed.music.apple.com${parsed.pathname}${parsed.search}`;
    }
    case "youtube": {
      const id = youtubeId(parsed);
      return id === null ? null : `https://www.youtube.com/embed/${id}`;
    }
    case "soundcloud": {
      return `https://${SOUNDCLOUD_PLAYER_HOST}/player/?url=${encodeURIComponent(parsed.toString())}`;
    }
  }
}
