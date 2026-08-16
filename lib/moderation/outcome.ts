// Traduzione dell'esito della RPC. È il pezzo su cui la superficie sta o cade.
//
// `public.moderate_site` può rifiutare **legittimamente**: un `approve` su un sito che
// `private.site_is_publishable` non considera pubblicabile, o senza abbonamento
// `active`/`trialing`, non aggiorna nessuna riga e finisce su
// `raise exception 'invalid moderation transition' using errcode='check_violation'`.
// Un'interfaccia che in quel caso dicesse «fatto» sarebbe peggio di nessuna interfaccia:
// l'amministratore chiuderebbe la pagina convinto che il sito sia online mentre resta in
// `pending_review`. Quindi qui vale una regola sola, e i test la misurano come tale:
// **l'unico ingresso che produce un successo è l'assenza di errore.** Qualunque altra cosa
// — SQLSTATE noto, SQLSTATE ignoto, oggetto malformato — esce come rifiuto o come errore.

import type { ModerationAction, RpcFailure } from "./types";

/** SQLSTATE che il contratto di PR-0 nomina esplicitamente. */
export const SQLSTATE_INSUFFICIENT_PRIVILEGE = "42501";
export const SQLSTATE_CHECK_VIOLATION = "23514";

export type ModerationRejection =
  /** `raise exception 'reason required'` — o il rifiuto anticipato del bordo. */
  | "reason-required"
  /** `raise exception 'invalid moderation transition'`: nessuna riga aggiornata. */
  | "invalid-transition"
  /** `check_violation` con un messaggio che non conosciamo: resta un rifiuto. */
  | "check-violation"
  /** Il form non conteneva un identificativo di sito utilizzabile. */
  | "malformed-request";

export type ModerationOutcome =
  | { readonly kind: "applied"; readonly action: ModerationAction }
  | { readonly kind: "rejected"; readonly rejection: ModerationRejection }
  /** `not platform admin`: la superficie non lo dice, sparisce. Vedi `page.tsx`. */
  | { readonly kind: "forbidden" }
  | { readonly kind: "failed" };

/**
 * L'esito a partire dall'errore della RPC. `null` — e solo `null` — è un successo.
 */
export function moderationOutcome(
  action: ModerationAction,
  failure: RpcFailure | null,
): ModerationOutcome {
  if (failure === null) return { kind: "applied", action };
  if (failure.code === SQLSTATE_INSUFFICIENT_PRIVILEGE) return { kind: "forbidden" };
  if (failure.code === SQLSTATE_CHECK_VIOLATION) {
    return { kind: "rejected", rejection: checkViolationKind(failure.message) };
  }
  return { kind: "failed" };
}

function checkViolationKind(message: string): ModerationRejection {
  const text = message.toLowerCase();
  if (text.includes("reason required")) return "reason-required";
  if (text.includes("invalid moderation transition")) return "invalid-transition";
  return "check-violation";
}

/**
 * Gettoni d'esito: insieme chiuso, perché finiscono nella query string dopo il redirect
 * dell'azione e tornano indietro come input non fidato.
 *
 * L'esito **non** viene creduto sulla parola: la pagina rilegge comunque la coda dal
 * database, quindi il gettone è un messaggio, mentre la verità su cosa sia successo resta
 * la riga di `public.sites` che compare nella tabella sotto. Un gettone sconosciuto non
 * produce nessun banner (`parseOutcomeToken` torna `null`): nessuno può fabbricare un
 * «fatto» che la tabella smentisce.
 */
export const OUTCOME_TOKENS = [
  "approvato",
  "sospeso",
  "rifiutato-transizione",
  "rifiutato-motivo",
  "rifiutato-vincolo",
  "richiesta-non-valida",
  "errore",
] as const;
export type OutcomeToken = (typeof OUTCOME_TOKENS)[number];

const REJECTION_TOKENS: Record<ModerationRejection, OutcomeToken> = {
  "reason-required": "rifiutato-motivo",
  "invalid-transition": "rifiutato-transizione",
  "check-violation": "rifiutato-vincolo",
  "malformed-request": "richiesta-non-valida",
};

/** `forbidden` non ha gettone: quell'esito non si racconta, diventa 404. */
export function outcomeToken(outcome: ModerationOutcome): OutcomeToken | null {
  switch (outcome.kind) {
    case "applied":
      return outcome.action === "approve" ? "approvato" : "sospeso";
    case "rejected":
      return REJECTION_TOKENS[outcome.rejection];
    case "failed":
      return "errore";
    case "forbidden":
      return null;
  }
}

export function parseOutcomeToken(raw: unknown): OutcomeToken | null {
  return typeof raw === "string" && (OUTCOME_TOKENS as readonly string[]).includes(raw)
    ? (raw as OutcomeToken)
    : null;
}

export type OutcomeNotice = {
  readonly tone: "ok" | "rifiuto";
  readonly text: string;
};

/**
 * Il testo mostrato. Ogni rifiuto dice due cose: **cosa** ha rifiutato e che **nulla è
 * cambiato**. La seconda metà è la più importante — è quella che impedisce di leggere un
 * rifiuto come un successo silenzioso.
 */
const NOTICES: Record<OutcomeToken, OutcomeNotice> = {
  approvato: { tone: "ok", text: "Sito approvato: ora è pubblicato." },
  sospeso: { tone: "ok", text: "Sito sospeso. La motivazione è registrata nell'audit." },
  "rifiutato-transizione": {
    tone: "rifiuto",
    text:
      "Rifiutato dal database: il sito non è approvabile così com'è — servono una configurazione completa e un abbonamento attivo o in prova. Nulla è cambiato.",
  },
  "rifiutato-motivo": {
    tone: "rifiuto",
    text: "Rifiutato: la sospensione richiede una motivazione scritta. Nulla è cambiato.",
  },
  "rifiutato-vincolo": {
    tone: "rifiuto",
    text: "Rifiutato da un vincolo del database. Nulla è cambiato.",
  },
  "richiesta-non-valida": {
    tone: "rifiuto",
    text: "Richiesta non valida: identificativo del sito assente o malformato. Nulla è cambiato.",
  },
  errore: {
    tone: "rifiuto",
    text: "L'operazione non è andata a buon fine: il database ha risposto con un errore. Nulla è cambiato.",
  },
};

export function outcomeNotice(token: OutcomeToken): OutcomeNotice {
  return NOTICES[token];
}
