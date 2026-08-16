// L'invariante centrale del filone: un rifiuto del database non diventa mai un successo.

import { describe, expect, it } from "vitest";

import { INVALID_TRANSITION, NOT_PLATFORM_ADMIN } from "./fixtures";
import {
  moderationOutcome,
  outcomeNotice,
  outcomeToken,
  parseOutcomeToken,
  type ModerationOutcome,
} from "./outcome";
import type { RpcFailure } from "./types";

/**
 * Ogni riga dichiara SQLSTATE e messaggio esattamente come li produce
 * `supabase/migrations/20260815140002_pr_0_database_contract.sql`, e l'esito atteso.
 * Le ultime tre non vengono da nessuna riga della migrazione: sono ciò che arriva quando
 * qualcosa a monte cambia senza avvisare, e servono a fissare che anche l'ignoto non è un
 * successo.
 */
const errori: readonly { caso: string; failure: RpcFailure; atteso: ModerationOutcome }[] = [
  {
    caso: "approve su un sito senza abbonamento active/trialing",
    failure: INVALID_TRANSITION,
    atteso: { kind: "rejected", rejection: "invalid-transition" },
  },
  {
    caso: "suspend su uno stato che il where della RPC non tocca",
    failure: { code: "23514", message: "invalid moderation transition" },
    atteso: { kind: "rejected", rejection: "invalid-transition" },
  },
  {
    caso: "suspend senza motivazione, se mai arrivasse fino alla RPC",
    failure: { code: "23514", message: "reason required" },
    atteso: { kind: "rejected", rejection: "reason-required" },
  },
  {
    caso: "check_violation con un messaggio che non conosciamo",
    failure: { code: "23514", message: "qualcosa di nuovo" },
    atteso: { kind: "rejected", rejection: "check-violation" },
  },
  {
    caso: "chiamante non amministratore",
    failure: NOT_PLATFORM_ADMIN,
    atteso: { kind: "forbidden" },
  },
  {
    caso: "privilegio di esecuzione revocato (la RPC non è nemmeno entrata)",
    failure: { code: "42501", message: "permission denied for function moderate_site" },
    atteso: { kind: "forbidden" },
  },
  {
    caso: "funzione assente dallo schema esposto",
    failure: { code: "PGRST202", message: "Could not find the function" },
    atteso: { kind: "failed" },
  },
  {
    caso: "errore senza SQLSTATE",
    failure: { code: null, message: "fetch failed" },
    atteso: { kind: "failed" },
  },
  {
    caso: "errore muto",
    failure: { code: null, message: "" },
    atteso: { kind: "failed" },
  },
];

describe("moderationOutcome", () => {
  it.each(errori)("$caso → $atteso.kind", ({ failure, atteso }) => {
    expect(moderationOutcome("approve", failure)).toEqual(atteso);
  });

  it("l'assenza di errore è l'unico ingresso che produce un successo", () => {
    expect(moderationOutcome("approve", null)).toEqual({ kind: "applied", action: "approve" });
    expect(moderationOutcome("suspend", null)).toEqual({ kind: "applied", action: "suspend" });
    for (const { failure } of errori) {
      expect(moderationOutcome("suspend", failure).kind).not.toBe("applied");
    }
  });

  /**
   * DoD 4 — questo è il test che deve diventare rosso se qualcuno «semplifica» il mappatore
   * trattando l'errore come un dettaglio. Nessun oggetto d'errore, per quanto strano, può
   * uscire come `applied`.
   */
  it("nessun errore, per quanto malformato, esce come applied", () => {
    const mostri = [
      { code: "", message: "" },
      { code: "23514", message: "REASON REQUIRED" },
      { code: "42501", message: "" },
      { code: "0", message: "0" },
    ] satisfies RpcFailure[];
    for (const failure of mostri) {
      expect(moderationOutcome("approve", failure).kind).not.toBe("applied");
    }
    // Il maiuscolo non cambia la classificazione: il confronto è su testo normalizzato.
    expect(moderationOutcome("suspend", { code: "23514", message: "REASON REQUIRED" })).toEqual({
      kind: "rejected",
      rejection: "reason-required",
    });
  });
});

describe("gettoni d'esito", () => {
  it("approve e suspend riusciti hanno gettoni distinti", () => {
    expect(outcomeToken({ kind: "applied", action: "approve" })).toBe("approvato");
    expect(outcomeToken({ kind: "applied", action: "suspend" })).toBe("sospeso");
  });

  it("il rifiuto per assenza di abbonamento ha un gettone tutto suo", () => {
    expect(outcomeToken(moderationOutcome("approve", INVALID_TRANSITION))).toBe(
      "rifiutato-transizione",
    );
  });

  /** `forbidden` non si racconta: chi non è amministratore riceve 404, non un messaggio. */
  it("forbidden non produce nessun gettone", () => {
    expect(outcomeToken({ kind: "forbidden" })).toBe(null);
  });

  it.each([
    { caso: "gettone inventato", raw: "approvato-per-davvero" },
    { caso: "gettone assente", raw: undefined },
    { caso: "parametro ripetuto: array", raw: ["approvato"] },
    { caso: "oggetto", raw: { esito: "approvato" } },
    { caso: "stringa vuota", raw: "" },
    { caso: "gettone con spazi", raw: " approvato" },
  ])("$caso non produce nessun banner", ({ raw }) => {
    expect(parseOutcomeToken(raw)).toBe(null);
  });

  it("i gettoni buoni tornano indietro identici", () => {
    for (const token of ["approvato", "sospeso", "rifiutato-transizione", "errore"] as const) {
      expect(parseOutcomeToken(token)).toBe(token);
    }
  });
});

describe("i messaggi dicono che nulla è cambiato", () => {
  it.each([
    "rifiutato-transizione",
    "rifiutato-motivo",
    "rifiutato-vincolo",
    "richiesta-non-valida",
    "errore",
  ] as const)("%s è un rifiuto e lo dice", (token) => {
    const notice = outcomeNotice(token);
    expect(notice.tone).toBe("rifiuto");
    expect(notice.text).toContain("Nulla è cambiato");
  });

  it.each(["approvato", "sospeso"] as const)("%s non si spaccia per un rifiuto", (token) => {
    expect(outcomeNotice(token).tone).toBe("ok");
    expect(outcomeNotice(token).text).not.toContain("Nulla è cambiato");
  });
});
