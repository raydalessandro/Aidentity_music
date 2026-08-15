/**
 * SONDA DI TIPO — il confine fra riga di tabella e riga di render, misurato dal compilatore.
 *
 * Non è un file di prova qualunque: è **prodotto del presidio**, non decorazione. Il confine
 * che difende non è verificabile a runtime, perché il suo scopo è impedire che certo codice
 * esista. Un test che monta un componente non può dimostrare che un altro modo di montarlo
 * *non compila*: l'unico strumento che lo sa dire è `tsc`.
 *
 * Ogni riga marcata `@ts-expect-error` deve fallire il typecheck. Se una di quelle assegnazioni
 * tornasse valida — perché qualcuno ha tolto `consent_confirmed_at?: never` da `EpkContact`,
 * o ha allargato la firma di `publishableContacts` — TypeScript segnala la direttiva come
 * inutilizzata (TS2578) e `npm run typecheck` diventa rosso. Il presidio quindi si rompe
 * rumorosamente, che è l'unico modo utile di rompersi.
 *
 * Le righe senza marcatura devono invece compilare: sono la metà positiva della misura, quella
 * che impedisce di «passare» irrigidendo tutto fino a rendere il confine inservibile.
 *
 * `contact-boundary.test.ts` esegue `tsc` su una copia di questo file senza le direttive e
 * verifica che gli errori attesi ci siano davvero, uno per uno.
 */

import { EpkContacts } from "./EpkContacts";
import { publishableContacts, renderableContacts } from "./select";
import type { EpkContact, EpkContactRecord } from "./types";

/** Le colonne di `public_contacts`, ricopiate qui: la sonda non deve dipendere dal filone D. */
type PublicContactRowShape = {
  readonly id: string;
  readonly site_id: string;
  readonly role: "booking" | "management" | "press";
  readonly name: string;
  readonly email: string;
  readonly sort_order: number;
};

declare const rowsFromTable: readonly EpkContactRecord[];
declare const rowsFromProjection: readonly PublicContactRowShape[];

// ── Deve compilare ────────────────────────────────────────────────────────────────────────

/** Il punto della saldatura: le righe di `loadEpk` entrano nel componente senza adattatori. */
export const projectionRendersDirectly = EpkContacts({ contacts: rowsFromProjection });

/** E anche in `renderableContacts`, che è ciò che il componente usa. */
export const projectionIsRenderable: EpkContact[] = renderableContacts(rowsFromProjection);

/** Il ponte: dalla riga di tabella alla riga di render, passando dal consenso. */
export const bridgedRendersDirectly = EpkContacts({ contacts: publishableContacts(rowsFromTable) });

// ── Non deve compilare ────────────────────────────────────────────────────────────────────

/**
 * Il buco che questo confine chiude: il wizard del filone C leggerà i contatti dell'owner da
 * `site_contacts`, dove `consent_confirmed_at` esiste e può essere nullo. Se queste righe
 * entrassero in `EpkContacts`, un contatto senza consenso comparirebbe come pubblicato.
 */
// @ts-expect-error una riga di tabella non è una riga di render: manca il passaggio dal consenso
export const tableRowsIntoComponent = EpkContacts({ contacts: rowsFromTable });

// @ts-expect-error stessa ragione, sulla funzione che il componente usa internamente
export const tableRowsIntoRenderable = renderableContacts(rowsFromTable);

/** L'altra direzione: il ponte pretende il campo, e una riga di render non ce l'ha. */
// @ts-expect-error una riga di render non può essere ri-giudicata sul consenso: il campo non c'è
export const projectionIntoBridge = publishableContacts(rowsFromProjection);

/** E il campo non si può nemmeno riattaccare a mano su una riga di render. */
// @ts-expect-error `consent_confirmed_at` non è scrivibile su una EpkContact: il tipo è `never`
export const forgedConsent: EpkContact = { ...rowsFromProjection[0]!, consent_confirmed_at: null };
