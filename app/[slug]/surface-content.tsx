// Presentazione delle superfici diverse da HOME.
//
// Il chrome visuale non vive più qui: `SurfaceShell` traduce la vista di dominio nei props
// del confine template e delega la geometria a `SiteTemplateSurface`. Restano in questo file
// soltanto i contenuti — catalogo tracce e identità EPK — cioè le cose che dipendono dai dati
// del tenant e non dal layout.
//
// La regola sulle superfici non cambia ed è ora scritta una volta sola, dentro il template:
// una superficie spenta non compare nella navigazione e non è raggiungibile via URL. Gli
// indirizzi restano quelli di `surfaceHref`, gli stessi che alimentano il dock della HOME
// pubblicata: una sorgente di verità, come dopo la #26.

import { SiteTemplateSurface } from "../../components/site-templates/SiteTemplate";
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

  return (
    <SiteTemplateSurface
      config={site.config}
      palette={site.palette}
      surface={surface}
      label={label}
      navigation={site.surfaces}
      // Questo componente rende soltanto superfici di un sito **pubblicato**: le anteprime
      // sono a schermo unico e passano tutte da HOME. Lo dichiara il chiamante, non il
      // template, perché la parola che ne esce la legge il visitatore.
      published
    >
      {children}
    </SiteTemplateSurface>
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
