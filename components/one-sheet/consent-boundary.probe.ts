/**
 * SONDA DI TIPO — il consenso non entra nella one-sheet, e a dirlo è il compilatore.
 *
 * `OneSheetContact` dichiara `consent_confirmed_at?: never` e `consent_confirmed_by?: never`.
 * Quella riga è il confine fra la **riga di tabella** (`site_contacts`, dove il consenso esiste e
 * può essere nullo) e la **riga di render** (`public_contacts`, dove per L0.7 §6.3 il consenso è
 * un filtro di riga e le colonne non ci sono). Toglierla non rompe nessun test a runtime: la
 * guardia `publicContactShape` continua a fare il suo lavoro sulle righe che arrivano davvero, e
 * i 490 test del repository restano verdi — misurato. Ciò che sparisce è il divieto di *scrivere*
 * il codice sbagliato, e nessun test a runtime può osservare codice che non esiste.
 *
 * Perciò lo si misura con `tsc`. Ogni riga marcata `@ts-expect-error` deve fallire il typecheck:
 * se una di loro tornasse valida, TypeScript segnalerebbe la direttiva come inutilizzata (TS2578)
 * e `npm run typecheck` diventerebbe rosso. Le righe senza marcatura devono invece compilare —
 * è la metà positiva della misura, quella che impedisce di «passare» irrigidendo i tipi al punto
 * che nemmeno le righe di `public_contacts` entrano più, il che costringerebbe la route a
 * scriversi un adattatore e a inventare il campo del consenso.
 *
 * `consent-boundary.test.ts` esegue `tsc` su una copia di questo file senza le direttive e
 * verifica che gli errori cadano esattamente sulle righe attese, con il codice atteso.
 */

import { prepareOneSheet, type OneSheetContact, type OneSheetInput } from "./model";

/** Le colonne di `public_contacts`, ricopiate qui: la sonda non deve dipendere dal filone D. */
type PublicContactRowShape = {
  readonly id: string;
  readonly site_id: string;
  readonly role: "booking" | "management" | "press";
  readonly name: string;
  readonly email: string;
  readonly sort_order: number;
};

/** La riga di `site_contacts`: le stesse colonne più il consenso, che è dato interno. */
type ContactTableRowShape = PublicContactRowShape & {
  readonly consent_confirmed_at: string | null;
  readonly consent_confirmed_by: string | null;
};

declare const rowsFromProjection: readonly PublicContactRowShape[];
declare const rowsFromTable: readonly ContactTableRowShape[];
declare const base: OneSheetInput;

// ── Deve compilare ────────────────────────────────────────────────────────────────────────

/** Il punto della saldatura: le righe di `loadEpk` entrano nel foglio senza adattatori. */
export const projectionIsContact: readonly OneSheetContact[] = rowsFromProjection;

/** E arrivano fino alla composizione, che è ciò che la route chiama davvero. */
export const projectionEntersPrepare = prepareOneSheet({ ...base, contacts: rowsFromProjection });

// ── Non deve compilare ────────────────────────────────────────────────────────────────────

/**
 * Il buco che questo confine chiude: il wizard del filone C leggerà i contatti dell'owner da
 * `site_contacts`. Se quelle righe entrassero qui, l'email di chi non ha acconsentito finirebbe
 * su un PDF che gira per le redazioni, ed è un danno che non si ritira.
 */
// @ts-expect-error una riga di site_contacts non è una riga di render: si porta dietro il consenso
export const tableRowIsContact: readonly OneSheetContact[] = rowsFromTable;

// @ts-expect-error stessa ragione, all'ingresso della funzione che compone il foglio
export const tableRowEntersPrepare = prepareOneSheet({ ...base, contacts: rowsFromTable });

/** E il campo non si può nemmeno riattaccare a mano su una riga di render. */
// @ts-expect-error `consent_confirmed_at` non è scrivibile su una OneSheetContact: il tipo è `never`
export const forgedConsent: OneSheetContact = { ...rowsFromProjection[0]!, consent_confirmed_at: "2026-07-02T09:00:00+02:00" };

// @ts-expect-error né `consent_confirmed_by`, per la stessa ragione
export const forgedConsentBy: OneSheetContact = { ...rowsFromProjection[0]!, consent_confirmed_by: "00000000-0000-0000-0000-000000000000" };
