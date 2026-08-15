import type { SiteConfigDraft } from "../contract";
import type { WizardAsset, WizardPost, WizardTrack } from "./types";

export type DraftContentPreviewProps = {
  config: SiteConfigDraft;
  previewId: string;
  assets: WizardAsset[];
  tracks: WizardTrack[];
  posts: WizardPost[];
};

const sectionStyle = {
  maxWidth: 980,
  margin: "0 auto",
  padding: "28px 20px",
  borderTop: "1px solid var(--line)",
} as const;

function enabled(config: SiteConfigDraft, id: "feed" | "listen" | "merch"): boolean {
  return config.surfaces.some((surface) => surface.id === id && surface.enabled);
}

/**
 * Anteprima C delle superfici di contenuto. Non duplica il renderer D: mostra
 * l'inventario reale del draft e fornisce gli anchor attesi dal dock di A.
 * Media playback/serving resta al filone media/D, che applica il gate published.
 */
export function DraftContentPreview({ config, previewId, assets, tracks, posts }: DraftContentPreviewProps) {
  const merch = assets.filter((asset) => asset.kind === "merch");

  return (
    <>
      {enabled(config, "feed") && (
        <section id={`feed-${previewId}`} style={sectionStyle} aria-label="FEED preview">
          <h2>{config.sectionCopy.feed?.trim() || "FEED"}</h2>
          {posts.length ? (
            <ul>{posts.map((post) => <li key={post.id}>{post.kind} · {post.caption || "senza caption"}</li>)}</ul>
          ) : <p>Nessun post nel draft.</p>}
        </section>
      )}

      {enabled(config, "listen") && (
        <section id={`listen-${previewId}`} style={sectionStyle} aria-label="LISTEN preview">
          <h2>{config.sectionCopy.listen?.trim() || "LISTEN"}</h2>
          {tracks.length ? (
            <ul>{tracks.map((track) => (
              <li key={track.id}>{track.title} · {track.source}{track.embed_provider ? ` · ${track.embed_provider}` : ""}</li>
            ))}</ul>
          ) : <p>Nessuna traccia nel draft.</p>}
        </section>
      )}

      {enabled(config, "merch") && (
        <section id={`merch-${previewId}`} style={sectionStyle} aria-label="MERCH preview">
          <h2>{config.sectionCopy.merch?.trim() || "MERCH"}</h2>
          {merch.length ? (
            <ul>{merch.map((asset) => <li key={asset.id}>Render merch · {Math.round(asset.byte_size / 1024)} KB</li>)}</ul>
          ) : <p>Nessun render merch nel draft.</p>}
        </section>
      )}
    </>
  );
}
