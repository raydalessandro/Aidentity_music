// Il contenuto delle superfici, reso una volta sola.
//
// FEED e MERCH erano scritti dentro le rotte del sito pubblicato. Servendo le stesse
// superfici anche all'anteprima — che è lo stesso sito con un'autorizzazione diversa — la
// scelta era fra copiare il markup e condividerlo. Copiarlo significa due griglie che
// divergono, ed è esattamente il difetto che questo repository ha già pagato due volte.
//
// Qui vive il markup; chi chiama porta i dati già risolti in URL, perché è l'unica cosa che
// cambia davvero fra i tre modi di guardare un sito: la route media pubblica per il
// visitatore, la route owner autenticata per chi sta ancora lavorando.

import type { ReactNode } from "react";

export type SurfaceVisual = {
  readonly id: string;
  /** Già risolto in indirizzo: il template non conosce lo Storage. */
  readonly src: string;
  readonly alt: string;
};

export type FeedEntry = {
  readonly id: string;
  readonly kind: "visual" | "track";
  /** `null` quando il media non è risolvibile: vedi la regola qui sotto. */
  readonly src: string | null;
  readonly alt: string;
  readonly caption: string | null;
};

/**
 * Un post `visual` senza immagine **non si racconta**: non è una traccia, e presentarlo
 * come tale sarebbe una bugia sul contenuto. `public_posts` lo esclude già alla radice
 * (`p.kind <> 'visual' or va.id is not null`), ma post e media arrivano da due letture
 * distinte: una purga in mezzo basta a far cadere qui un post visuale.
 */
export function FeedGrid({ entries }: { readonly entries: readonly FeedEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="feed-grid" aria-label="Feed visuale">
      {entries.map((entry, index) => {
        if (entry.src !== null) {
          return (
            <article className="feed-card" key={entry.id} data-post={entry.kind}>
              {/* eslint-disable-next-line @next/next/no-img-element -- route media revocabile. */}
              <img src={entry.src} alt={entry.alt} />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </article>
          );
        }
        if (entry.kind === "visual") return null;
        return (
          <article className="feed-card feed-type" key={entry.id} data-post={entry.kind}>
            <small>{String(index + 1).padStart(2, "0")} / TRACK</small>
            <strong>{entry.caption ?? "TRACCIA"}</strong>
          </article>
        );
      })}
    </div>
  );
}

export function MerchGrid({ items }: { readonly items: readonly SurfaceVisual[] }) {
  if (items.length === 0) return null;

  return (
    <div className="merch-grid" aria-label="Render merch">
      {items.map((item, index) => (
        <article className="merch-card" key={item.id}>
          <div className="merch-shot">
            {/* eslint-disable-next-line @next/next/no-img-element -- route media revocabile. */}
            <img src={item.src} alt={item.alt} />
            <span className="merch-badge">RENDER</span>
          </div>
          <p>Studio visuale {String(index + 1).padStart(2, "0")}</p>
        </article>
      ))}
    </div>
  );
}

/** La riga che accompagna MERCH: i capi sono render, non un negozio. */
export function MerchDisclaimer(): ReactNode {
  return <p>I capi mostrati sono render. Non sono in vendita da questa pagina.</p>;
}
