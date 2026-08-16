// Bordo di validazione del comando di moderazione. Ciò che arriva da un `<form>` non è fidato.

import { z } from "zod";

import type { ModerationAction, ModerationCommand } from "./types";

/**
 * `z.guid()` e mai `z.uuid()`, per lo stesso motivo misurato in `lib/media/target.ts`:
 * Zod 4 pretende da `z.uuid()` versione e variante RFC 9562, che gli identificativi del
 * seed (`22222222-…`, `88888888-…`) non rispettano. Con `z.uuid()` la coda della fixture
 * sarebbe interamente non moderabile e ogni caso positivo sarebbe scritto contro
 * identificativi che il prodotto non ha.
 */
const guid = z.guid();

export type CommandRejection = "target-invalid" | "action-invalid" | "reason-required";

export type ParsedCommand =
  | { readonly ok: true; readonly command: ModerationCommand }
  | { readonly ok: false; readonly rejection: CommandRejection };

const ACTION_SCHEMA = z.enum(["approve", "suspend"]);

/**
 * Traduce l'input grezzo del form nel comando, oppure lo rifiuta.
 *
 * Tre regole, tutte deliberate:
 *
 * 1. **`suspend` senza motivazione è impossibile qui**, prima ancora della RPC. Il
 *    database alza `check_violation` su `coalesce(btrim(reason),'')=''`; questa funzione
 *    applica lo stesso identico predicato e si ferma. Nessuna motivazione di default
 *    viene inventata per far contento il vincolo: un audit che dice «sospeso per: —» è
 *    peggio di una sospensione non avvenuta.
 * 2. **`approve` non porta motivazione.** `moderate_site` la scrive comunque in
 *    `moderation_events`, quindi inoltrare il testo lasciato in un campo accanto
 *    sporcherebbe l'audit con una motivazione che nessuno ha inteso dare.
 * 3. La motivazione viene consegnata **ripulita ai bordi** (`trim`), che è ciò che il
 *    database misura. Non è inventare: è non registrare come motivazione degli spazi.
 */
export function parseModerationCommand(raw: {
  readonly action: unknown;
  readonly target: unknown;
  readonly reason?: unknown;
}): ParsedCommand {
  const action = ACTION_SCHEMA.safeParse(raw.action);
  if (!action.success) return { ok: false, rejection: "action-invalid" };

  const target = guid.safeParse(raw.target);
  if (!target.success) return { ok: false, rejection: "target-invalid" };

  return action.data === "suspend"
    ? suspendCommand(target.data, raw.reason)
    : { ok: true, command: { target: target.data, action: "approve", reason: null } };
}

function suspendCommand(target: string, rawReason: unknown): ParsedCommand {
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (reason === "") return { ok: false, rejection: "reason-required" };
  return { ok: true, command: { target, action: "suspend", reason } };
}

/** Le due azioni esposte dalla superficie, per i test tabellari e per i form. */
export function isModerationAction(value: unknown): value is ModerationAction {
  return ACTION_SCHEMA.safeParse(value).success;
}
