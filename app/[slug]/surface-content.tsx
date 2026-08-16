import { SiteTemplateSurface } from "../../components/site-templates/SiteTemplate";
import { mediaUrl } from "../../lib/media/url";
import { EmbedFrame } from "./embed-frame";
import { TrackPlayButton } from "./player-provider";
import type { ListenView, SiteView, SurfaceId } from "./read-model";

export function SurfaceShell({
  site,
  surface,
  children,
}: {
  readonly site: SiteView;
  readonly surface: SurfaceId;
  readonly children: React.ReactNode;
}) {
  const label = site.surfaces.find((entry) => entry.id === surface)?.label ?? surface.toUpperCase();
  const heroSrc = site.heroAssetId === null ? null : mediaUrl("asset", site.id, site.heroAssetId);

  return (
    <SiteTemplateSurface
      config={site.config}
      palette={site.palette}
      surface={surface}
      label={label}
      navigation={site.surfaces}
      heroSrc={heroSrc}
      published
    >
      {children}
    </SiteTemplateSurface>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Catalogo misto: upload nel player persistente, embed in iframe isolato. */
export function TrackCatalogue({ view }: { readonly view: ListenView }) {
  if (view.tracks.length === 0) return null;

  return (
    <section className="track-section" aria-label="Catalogo tracce">
      <div className="track-head" aria-hidden="true">
        <span>#</span><span>TITOLO</span><span>STATO</span><span>DURATA</span>
      </div>
      <ul className="track-list">
        {view.tracks.map((track, index) =>
          track.kind === "upload" ? (
            <li key={track.id} data-track="upload" className="track-row">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <TrackPlayButton track={{ id: track.id, title: track.title, src: track.src }} />
              <span><i aria-hidden="true" /> SOURCE</span>
              <span>{formatDuration(track.durationSeconds)}</span>
            </li>
          ) : (
            <li key={track.id} data-track="embed" className="embed-row">
              <div className="embed-meta">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{track.title}</strong>
                <small>{track.provider.toUpperCase()} / EMBED</small>
              </div>
              <EmbedFrame title={track.title} provider={track.provider} url={track.url} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export function EpkIdentity({ site }: { readonly site: SiteView }) {
  const { identity } = site.config;
  return (
    <div className="epk-identity">
      <p className="claim">{identity.claim}</p>
      <h2>Base</h2>
      <p>{identity.location}</p>
    </div>
  );
}
