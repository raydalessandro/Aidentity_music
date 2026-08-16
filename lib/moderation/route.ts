// L'indirizzo dell'area e il modo in cui un esito ci torna sopra.
//
// Sta in `lib/` e non accanto alle azioni perché un file con la direttiva `"use server"`
// può esportare soltanto funzioni asincrone: una costante esportata da `actions.ts`
// romperebbe il build di Next, non i test.

import type { OutcomeToken } from "./outcome";

export const MODERATION_PATH = "/app/moderation";

/** Nome del parametro che riporta l'esito dopo il redirect dell'azione. */
export const OUTCOME_PARAM = "esito";

/**
 * L'URL a cui l'azione rimanda dopo aver agito.
 *
 * Si torna sempre sulla pagina, anche dopo un rifiuto: è la pagina a rileggere la coda dal
 * database, quindi l'amministratore vede il messaggio **e** lo stato reale del sito nella
 * stessa schermata. Se i due dicessero cose diverse, quello vero è quello nella tabella.
 */
export function moderationUrl(token: OutcomeToken | null): string {
  return token === null
    ? MODERATION_PATH
    : `${MODERATION_PATH}?${OUTCOME_PARAM}=${encodeURIComponent(token)}`;
}
