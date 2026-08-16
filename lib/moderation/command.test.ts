// Il bordo del comando: cosa entra in `moderate_site` e cosa non ci arriva mai.

import { describe, expect, it } from "vitest";

import { parseModerationCommand } from "./command";
import { SITE_PENDING } from "./fixtures";

/**
 * Ogni caso negativo dichiara l'esito atteso per nome, e il nome è quello che l'azione
 * traduce poi in messaggio. «Non passa» non è un esito atteso.
 */
const rifiutati = [
  {
    caso: "identificativo assente (campo mancante nel form)",
    input: { action: "approve", target: null },
    atteso: "target-invalid",
  },
  {
    caso: "identificativo che non è un UUID",
    input: { action: "approve", target: "88888888" },
    atteso: "target-invalid",
  },
  {
    caso: "identificativo arrivato come array (campo ripetuto nel form)",
    input: { action: "approve", target: [SITE_PENDING] },
    atteso: "target-invalid",
  },
  {
    caso: "azione fuori dall'enum public.moderation_action",
    input: { action: "delete", target: SITE_PENDING },
    atteso: "action-invalid",
  },
  {
    caso: "sospensione senza motivazione",
    input: { action: "suspend", target: SITE_PENDING },
    atteso: "reason-required",
  },
  {
    caso: "sospensione con motivazione vuota",
    input: { action: "suspend", target: SITE_PENDING, reason: "" },
    atteso: "reason-required",
  },
  {
    caso: "sospensione con soli spazi: stesso predicato del database, coalesce(btrim(reason),'')=''",
    input: { action: "suspend", target: SITE_PENDING, reason: "   \n\t " },
    atteso: "reason-required",
  },
  {
    caso: "sospensione con motivazione non testuale",
    input: { action: "suspend", target: SITE_PENDING, reason: 42 },
    atteso: "reason-required",
  },
] as const;

describe("parseModerationCommand rifiuta", () => {
  it.each(rifiutati)("$caso → $atteso", ({ input, atteso }) => {
    const parsed = parseModerationCommand(input);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("il comando è stato accettato");
    expect(parsed.rejection).toBe(atteso);
  });
});

describe("parseModerationCommand accetta", () => {
  it("approve su un identificativo del seed, senza motivazione", () => {
    const parsed = parseModerationCommand({ action: "approve", target: SITE_PENDING });
    expect(parsed).toEqual({
      ok: true,
      command: { target: SITE_PENDING, action: "approve", reason: null },
    });
  });

  /**
   * `moderate_site` scrive `reason` in `moderation_events` anche per un `approve`. Se il
   * testo lasciato nel campo accanto viaggiasse comunque, l'audit direbbe che un sito è
   * stato approvato «per: contenuti non conformi». Il campo non viene inoltrato.
   */
  it("approve scarta la motivazione anche quando il form ne porta una", () => {
    const parsed = parseModerationCommand({
      action: "approve",
      target: SITE_PENDING,
      reason: "contenuti non conformi",
    });
    expect(parsed.ok && parsed.command.reason).toBe(null);
  });

  it("suspend con motivazione, ripulita ai bordi", () => {
    const parsed = parseModerationCommand({
      action: "suspend",
      target: SITE_PENDING,
      reason: "  immagini non di proprietà \n",
    });
    expect(parsed).toEqual({
      ok: true,
      command: {
        target: SITE_PENDING,
        action: "suspend",
        reason: "immagini non di proprietà",
      },
    });
  });

  /**
   * Prova di mutazione dichiarata: se qualcuno «risolvesse» il rifiuto riempiendo la
   * motivazione lato server, questo test lo vedrebbe. Nessuna stringa di comodo può
   * comparire al posto di ciò che l'amministratore ha scritto.
   */
  it("non inventa una motivazione al posto dell'amministratore", () => {
    const parsed = parseModerationCommand({ action: "suspend", target: SITE_PENDING, reason: " " });
    expect(parsed).toEqual({ ok: false, rejection: "reason-required" });
    // Nessun comando esce da qui: non c'è niente da inoltrare alla RPC.
    expect(Object.keys(parsed)).not.toContain("command");
    for (const scusa of ["moderazione", "sospeso", "n/d", "—", "motivo non fornito"]) {
      expect(JSON.stringify(parsed)).not.toContain(scusa);
    }
  });
});
