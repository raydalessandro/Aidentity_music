import { publishableLinks } from "./select";
import { styles } from "./styles";
import type { EpkLink, LinkProvider } from "./types";

const providerLabel: Record<LinkProvider, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type EpkLinksProps = {
  links: readonly EpkLink[];
  id?: string;
};

/**
 * Link DSP e social dall'insieme chiuso di L0.7 §5.
 *
 * Provider fuori insieme e URL non `https` sono scartati da `publishableLinks`:
 * non compaiono nel markup, nemmeno come testo. Non si aprono in una nuova
 * scheda — l'EPK non decide al posto di chi legge.
 */
export function EpkLinks({ links, id = "epk" }: EpkLinksProps) {
  const published = publishableLinks(links);
  if (published.length === 0) return null;
  const headingId = `${id}-link`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Ascolta e segui
      </h2>
      <ul style={styles.inlineList}>
        {published.map((link) => (
          <li key={link.id}>
            <a style={styles.quietAction} href={link.url} rel="noreferrer">
              {providerLabel[link.provider]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
