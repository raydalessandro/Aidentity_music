// Presentazione delle superfici diverse da HOME.
// HOME resta resa da `SiteShell` del filone A, consumata così com'è.
//
// Perché qui non c'è il dock: `SurfaceDock` di A costruisce href ad ancora
// (`#feed-<previewId>`) e serve la pagina di anteprima a schermo unico; non sa produrre
// `/[slug]/feed`. Non lo duplico e non lo modifico: uso una navigazione testuale minima e
// chiedo nel report che A accetti gli href. La regola resta la stessa: una superficie spenta
// non compare qui e non è raggiungibile via URL.

import Link from "next/link";

import { ShellTopbar } from "../../components/site-shell/SiteShell";
import { EmbedFrame } from "./embed-frame";
import { TrackPlayButton } from "./player-provider";
import type { ListenView, SiteView, SurfaceId } from "./read-model";
import { paletteStyle } from "./theme";

export function SurfaceNav({
  site,
  current,
}: {
  readonly site: SiteView;
  readonly current: SurfaceId;
}) {
  return (
    <nav aria-label={`Superfici di ${site.config.identity.name}`}>
      <ul>
        {site.surfaces
          .filter((surface) => surface.enabled)
          .map((surface) => (
            <li key={surface.id}>
              {surface.id === current ? (
                <span aria-current="page">{surface.label}</span>
              ) : (
                <Link href={surface.href}>{surface.label}</Link>
              )}
            </li>
          ))}
      </ul>
    </nav>
  );
}

export function SurfaceShell({
  site,
  surface,
  children,
}: {
  readonly site: SiteView;
  readonly surface: SurfaceId;
  readonly children: React.ReactNode;
}) {
  const { config, palette } = site;
  const label = site.surfaces.find((entry) => entry.id === surface)?.label ?? surface.toUpperCase();

  return (
    <section
      className={`site-shell font-${config.fontPair} icons-${config.iconFamily}`}
      style={paletteStyle(palette)}
      data-grain={config.grain}
      data-palette={palette.id}
      data-surface={surface}
    >
      <a className="skip-link" href={`#contenuto-${surface}`}>
        Salta al contenuto
      </a>
      <ShellTopbar handle={config.identity.handle} />
      <main id={`contenuto-${surface}`} className="shell-content">
        <p className="eyebrow">{config.identity.name}</p>
        <h1>{label}</h1>
        {children}
      </main>
      <SurfaceNav site={site} current={surface} />
    </section>
  );
}

/**
 * Catalogo misto: gli upload passano dal player unico, gli embed da un iframe isolato.
 * Le righe scartate dal read model non producono nessun elemento.
 */
export function TrackCatalogue({ view }: { readonly view: ListenView }) {
  if (view.tracks.length === 0) return null;

  return (
    <ul className="track-list">
      {view.tracks.map((track) =>
        track.kind === "upload" ? (
          <li key={track.id} data-track="upload">
            <TrackPlayButton track={{ id: track.id, title: track.title, src: track.src }} />
          </li>
        ) : (
          <li key={track.id} data-track="embed">
            <EmbedFrame title={track.title} provider={track.provider} url={track.url} />
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Claim e luogo, dalla config.
 *
 * Non rende più le due bio, e la sottrazione è il motivo per cui il componente esiste ancora.
 * Da quando la route EPK monta `EpkBio` di `components/epk`, le bio hanno un solo padrone —
 * quello che le rende copiabili, come chiede L0.7 §2. Tenerle anche qui avrebbe significato
 * stampare due volte lo stesso testo e due intestazioni «Bio breve» nella stessa pagina: un
 * duplicato che a chi naviga per intestazioni si presenta come due sezioni diverse con lo
 * stesso nome.
 *
 * Restano claim e `Base`, che nessun componente del filone E copre e che senza questo blocco
 * sparirebbero dall'EPK.
 */
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
