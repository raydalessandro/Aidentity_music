// Quali visual entrano nella ribbon della HOME.
//
// La regola viveva scritta due volte: una in `app/[slug]/page.tsx` (sito pubblicato) e una in
// `app/app/wizard/preview/[siteId]/page.tsx` (anteprima dell'owner). Le due copie **non
// dicevano la stessa cosa**: il pubblicato mostrava soltanto i visual referenziati da un post,
// l'anteprima i primi cinque asset visual qualunque fossero. Conseguenza: un'immagine caricata
// senza farne un post si vedeva nell'anteprima e spariva una volta pubblicata — cioè
// l'anteprima mentiva proprio su ciò per cui esiste.
//
// La regola giusta è quella del pubblicato, e non è arbitraria: il wizard la dichiara
// all'artista mentre lavora («Gli asset caricati da soli non compaiono nel FEED: qui diventano
// post»). Qui vive una volta sola, e i due chiamanti le passano soltanto come costruire URL e
// testo alternativo — che è l'unica cosa che davvero li distingue: l'anteprima passa dalla
// route owner autenticata, il pubblicato dalla route media.

/** Quante immagini entrano nella ribbon. Cambiarlo qui le cambia in entrambi i posti. */
export const RIBBON_MAX_VISUALS = 5;

type PostReference = {
  readonly kind: string;
  readonly visual_asset_id: string | null;
  readonly cover_asset_id?: string | null;
  readonly caption: string | null;
};

type AssetReference = {
  readonly id: string;
  readonly kind: string;
};

export type RibbonVisual = {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
};

/**
 * `srcOf` e `altOf` restano del chiamante: la selezione è condivisa, l'indirizzo no.
 */
export function ribbonVisuals<A extends AssetReference>(
  assets: readonly A[],
  posts: readonly PostReference[],
  srcOf: (asset: A) => string,
  altOf: (asset: A) => string,
): readonly RibbonVisual[] {
  const referenced = new Set<string>();
  const captionByAsset = new Map<string, string | null>();

  for (const post of posts) {
    if (post.visual_asset_id !== null) {
      referenced.add(post.visual_asset_id);
      if (post.kind === "visual") captionByAsset.set(post.visual_asset_id, post.caption);
    }
    // Una cover appartiene a un post `track`: l'immagine è comunque pubblicata, quindi
    // entra nella ribbon — ma la sua didascalia è quella della traccia, non di un visual.
    if (post.cover_asset_id != null) referenced.add(post.cover_asset_id);
  }

  return assets
    .filter((asset) => asset.kind === "visual" && referenced.has(asset.id))
    .slice(0, RIBBON_MAX_VISUALS)
    .map((asset) => ({
      id: asset.id,
      src: srcOf(asset),
      alt: altOf(asset),
      caption: captionByAsset.get(asset.id) ?? "VISUAL",
    }));
}
