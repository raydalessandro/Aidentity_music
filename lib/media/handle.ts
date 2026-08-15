// Il corpo della route media, senza Next dentro.
//
// `app/api/media/[kind]/[siteId]/[id]/route.ts` è un guscio: legge i segmenti, costruisce le
// dipendenze reali e converte il risultato in `NextResponse`. Tutto ciò che decide sta qui,
// e sta qui perché sia eseguibile in vitest: `lib/supabase/service-role.ts` apre con
// `import "server-only"`, che è un alias risolto soltanto dentro il build di Next, quindi un
// test che importasse la route non riuscirebbe nemmeno a caricarla (stesso motivo per cui
// `lib/site-reader/postgrest-row-source.ts` riceve il client come parametro).
//
// ── Perché la risposta sono i byte e non l'URL firmato ───────────────────────────────────
//
// La consegna chiedeva «restituire un URL firmato a scadenza breve» e, nella stessa pagina,
// «il path non deve mai comparire nella risposta, in nessuna forma» più un test che lo
// verifichi «in nessun campo e in nessun header». Le due cose non possono valere insieme:
// un URL firmato di Supabase Storage è
//
//     https://<progetto>/storage/v1/object/sign/<bucket>/<storage_path>?token=<jwt>
//
// cioè **contiene `storage_path` alla lettera**. Restituirlo — in un campo JSON o in un
// header `Location` — pubblicherebbe esattamente il campo che §6.3 tiene fra quelli interni
// («path privati non entrano nelle proiezioni»).
//
// Quindi: il meccanismo richiesto resta identico — path risolto con privilegi elevati lato
// server, `createSignedUrl` con TTL di 60 secondi — ma la firma non lascia il processo. La
// route la consuma e restituisce i byte. Il chiamante riceve un'immagine o un audio, mai un
// percorso. È l'unica forma in cui la voce 3 del DoD è letteralmente vera e verificabile.
//
// Costo dichiarato: i byte passano dal server invece che dal CDN dello Storage, e le
// richieste `Range` non sono supportate in v1 (il player scarica la traccia intera; la
// riproduzione funziona, il seek è degradato). Nessuno dei due è un problema di sicurezza.

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
      readonly kind: "bytes";
      readonly status: 200;
      readonly headers: Readonly<Record<string, string>>;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: "json";
      readonly status: 400 | 404 | 500 | 502;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: { readonly error: string };
    };

function json(
  status: 400 | 404 | 500 | 502,
  body: { readonly error: string },
): MediaHttpResponse {
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

  const ttl = resolved.ttlSeconds ?? MEDIA_SIGNATURE_TTL_SECONDS;

  let row;
  try {
    row = await resolved.source.findRow(kind, id);
  } catch (error) {
    report(log, { stage: "source", kind, id, detail: detailOf(error) });
    return json(500, MEDIA_UNREADABLE_BODY);
  }

  const access = decideMediaAccess(kind, siteId, row);
  if (!access.ok) return denialResponse(access.reason);

  // Da qui in poi il path esiste come variabile locale e non compare più: non entra nei
  // log, non entra negli header, non entra nel corpo.
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

  let object;
  try {
    object = await resolved.fetcher.fetchObject(signedUrl);
  } catch (error) {
    report(log, { stage: "fetch", kind, id, detail: detailOf(error) });
    return json(502, MEDIA_UNRECOVERABLE_BODY);
  }
  if (object === null) {
    report(log, { stage: "fetch", kind, id, detail: "oggetto non leggibile" });
    return json(502, MEDIA_UNRECOVERABLE_BODY);
  }

  return {
    kind: "bytes",
    status: 200,
    headers: {
      // Il tipo viene dall'allowlist di `decideMediaAccess`, non dallo Storage e non dalla
      // riga grezza: un `mime_type` arbitrario finito in tabella non diventa un header.
      "content-type": access.contentType,
      "content-length": String(object.bytes.byteLength),
      // Il tipo è già dichiarato dall'allowlist: il browser non deve indovinarne un altro.
      "x-content-type-options": "nosniff",
      // Cache privata e breve. Non `public`: una cache condivisa continuerebbe a servire
      // l'asset dopo una depubblicazione o una purga, e la revoca deve avere effetto.
      "cache-control": "private, max-age=60",
    },
    bytes: object.bytes,
  };
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
