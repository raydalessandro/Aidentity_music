// Il corpo della route media, senza Next dentro.
//
// `app/api/media/[kind]/[siteId]/[id]/route.ts` è un guscio: legge i segmenti, costruisce le
// dipendenze reali e converte il risultato in una risposta. Tutto ciò che decide sta qui, e
// sta qui perché sia eseguibile in vitest: `lib/supabase/service-role.ts` apre con
// `import "server-only"`, che è un alias risolto soltanto dentro il build di Next, quindi un
// test che importasse la route non riuscirebbe nemmeno a caricarla (stesso motivo per cui
// `lib/site-reader/postgrest-row-source.ts` riceve il client come parametro).
//
// ── La risposta è un redirect 302 verso l'URL firmato ────────────────────────────────────
//
// Decisione di Ray. Il redirect è la sola forma che fa funzionare `<img src>` e l'elemento
// audio, e soprattutto è la sola che lascia i byte allo Storage: da lì arrivano con la CDN
// e con il supporto a `Range`, cioè con il seek. Un proxy di byte dal server toglieva
// entrambe le cose, e su un prodotto musicale un player che per spostarsi dentro un brano
// deve riscaricarlo non è un player.
//
// ── L'eccezione a §6.3, dichiarata ───────────────────────────────────────────────────────
//
// Un URL firmato di Supabase Storage è
//
//     https://<progetto>/storage/v1/object/sign/<bucket>/<storage_path>?token=<jwt>
//
// e contiene quindi `storage_path` alla lettera. Metterlo nell'header `Location` **espone il
// path**, che §6.3 elenca fra i campi interni. È un'eccezione voluta, non una svista: il
// path è un nome di file dentro un bucket privato, raggiungibile solo con una firma che
// scade, e nasconderlo proteggerebbe poco al prezzo del seek. Ciò che l'eccezione **non**
// concede: il path non entra nel corpo di nessuna risposta, non entra nei log, e non compare
// mai su una richiesta negata — un diniego non produce `Location` affatto.
//
// Costo dichiarato: il redirect non è memorizzabile in cache (`no-store`), quindi ogni
// immagine costa un giro sulla route più uno sullo Storage. È il prezzo della revoca: se il
// redirect fosse in cache, una depubblicazione non avrebbe effetto fino alla scadenza.

import { decideMediaAccess, type MediaDenial } from "./access";
import { MEDIA_SIGNATURE_TTL_SECONDS } from "./media";
import type { MediaDeps, MediaLogger } from "./ports";
import { parseMediaTarget } from "./target";

/**
 * Corpo delle risposte non riuscite. Un solo testo per **tutti** i dinieghi: inesistente,
 * altro tenant, sito in bozza, riga purgata, traccia embed. Chi interroga la route non può
 * distinguere «non esiste» da «esiste e non è tuo», che è la richiesta del DoD.
 */
export const MEDIA_UNAVAILABLE_BODY = { error: "media non disponibile" } as const;
export const MEDIA_BAD_REQUEST_BODY = { error: "richiesta non valida" } as const;
export const MEDIA_UNREADABLE_BODY = { error: "media non leggibile" } as const;
export const MEDIA_UNRECOVERABLE_BODY = { error: "media non recuperabile" } as const;
export const MEDIA_UNCONFIGURED_BODY = { error: "media non configurato" } as const;

/** Header identici su ogni risposta non riuscita: nemmeno la cache può fare da oracolo. */
const ERROR_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export type MediaHttpResponse =
  | {
      readonly kind: "redirect";
      readonly status: 302;
      readonly headers: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "json";
      readonly status: 400 | 404 | 500 | 502;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: { readonly error: string };
    };

function json(status: 400 | 404 | 500 | 502, body: { readonly error: string }): MediaHttpResponse {
  return { kind: "json", status, headers: ERROR_HEADERS, body };
}

/**
 * Ogni diniego, senza eccezioni, produce la stessa identica risposta.
 *
 * La tabella è esplicita e indicizzata su `MediaDenial` per un motivo pratico: aggiungere
 * domani un motivo di diniego non compila finché non se ne dichiara la risposta, e
 * `handle.test.ts` verifica che tutte le voci siano indistinguibili. Un `return` unico
 * avrebbe lo stesso effetto oggi e nessun attrito il giorno in cui qualcuno volesse
 * rispondere «403» a un caso solo, che è esattamente il modo in cui nasce un oracolo.
 */
export const DENIAL_RESPONSES: Readonly<Record<MediaDenial, MediaHttpResponse>> = {
  "not-found": json(404, MEDIA_UNAVAILABLE_BODY),
  "tenant-mismatch": json(404, MEDIA_UNAVAILABLE_BODY),
  "site-not-published": json(404, MEDIA_UNAVAILABLE_BODY),
  "row-purged": json(404, MEDIA_UNAVAILABLE_BODY),
  "no-storage-object": json(404, MEDIA_UNAVAILABLE_BODY),
  "mime-not-servable": json(404, MEDIA_UNAVAILABLE_BODY),
};

export function denialResponse(reason: MediaDenial): MediaHttpResponse {
  return DENIAL_RESPONSES[reason];
}

function report(log: MediaLogger | undefined, event: Parameters<MediaLogger>[0]): void {
  log?.(event);
}

/**
 * `deps` arriva come funzione e non come valore: le dipendenze privilegiate si costruiscono
 * **dopo** la validazione dell'input. Un URL malformato non deve poter far leggere
 * `SUPABASE_SERVICE_ROLE_KEY` dall'ambiente, e `handle.test.ts` lo verifica contando le
 * costruzioni.
 */
export async function handleMediaRequest(
  raw: unknown,
  deps: () => MediaDeps,
  log?: MediaLogger,
): Promise<MediaHttpResponse> {
  const parsed = parseMediaTarget(raw);
  if (!parsed.ok) return json(400, MEDIA_BAD_REQUEST_BODY);

  const { kind, siteId, id } = parsed.target;

  let resolved: MediaDeps;
  try {
    resolved = deps();
  } catch (error) {
    report(log, { stage: "deps", kind, id, detail: detailOf(error) });
    return json(500, MEDIA_UNCONFIGURED_BODY);
  }

  const ttl = resolved.ttlSeconds ?? MEDIA_SIGNATURE_TTL_SECONDS[kind];

  let row;
  try {
    row = await resolved.source.findRow(kind, id);
  } catch (error) {
    report(log, { stage: "source", kind, id, detail: detailOf(error) });
    return json(500, MEDIA_UNREADABLE_BODY);
  }

  // Ogni controllo di accesso sta PRIMA della firma: un diniego non arriva mai allo
  // Storage, non produce nessuna firma e non produce nessun `Location`.
  const access = decideMediaAccess(kind, siteId, row);
  if (!access.ok) return denialResponse(access.reason);

  let signedUrl: string | null;
  try {
    signedUrl = await resolved.signer.sign(access.bucket, access.path, ttl);
  } catch (error) {
    report(log, { stage: "sign", kind, id, detail: detailOf(error) });
    return json(502, MEDIA_UNRECOVERABLE_BODY);
  }
  if (signedUrl === null) {
    report(log, { stage: "sign", kind, id, detail: "firma non ottenuta" });
    return json(502, MEDIA_UNRECOVERABLE_BODY);
  }

  return {
    kind: "redirect",
    status: 302,
    headers: {
      location: signedUrl,
      // Il redirect non si mette in cache: è il punto in cui `published`, tenant e purga
      // vengono verificati, e una copia in cache continuerebbe a rispondere dopo una
      // depubblicazione. I byte, invece, li mette in cache lo Storage.
      "cache-control": "no-store",
      // Nessun corpo: il contenuto è allo Storage, e qui non deve esserci niente da leggere.
      "content-length": "0",
    },
  };
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
