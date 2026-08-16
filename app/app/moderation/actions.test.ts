// Le azioni eseguite: cosa arriva al database, cosa non ci arriva, e cosa viene detto dopo.
//
// Il caso che Ray ha chiesto per nome — un `approve` su un sito senza abbonamento attivo —
// è qui sotto due volte: una per misurare che l'esito riportato è un **rifiuto**, e una per
// misurare che non esiste nessun ingresso capace di produrre «approvato» quando la RPC ha
// alzato `check_violation`.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("MODERATION_NOT_FOUND");
  },
  redirect: (url: string): never => {
    throw new Error(`MODERATION_REDIRECT:${url}`);
  },
}));

const revalidazioni: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string): void => {
    revalidazioni.push(path);
  },
}));

import {
  INVALID_TRANSITION,
  NOT_PLATFORM_ADMIN,
  SITE_PENDING,
  StubModerationGateway,
  admin,
} from "../../../lib/moderation/fixtures";
import type { RpcFailure } from "../../../lib/moderation/types";
import { approveSite, suspendSite } from "./actions";
import { configureModerationGateway, resetModerationGateway } from "./composition";

afterEach(() => {
  resetModerationGateway();
  revalidazioni.length = 0;
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

/** Esegue l'azione e restituisce la destinazione del redirect, o l'eccezione che l'ha fermata. */
async function esegui(
  gateway: StubModerationGateway,
  azione: (data: FormData) => Promise<void>,
  fields: Record<string, string>,
): Promise<string> {
  configureModerationGateway(gateway);
  try {
    await azione(form(fields));
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : String(thrown);
  }
  throw new Error("l'azione è terminata senza redirect né 404");
}

describe("approve rifiutato dal database", () => {
  it("riporta il rifiuto, non un successo", async () => {
    const gateway = new StubModerationGateway({ admin, failure: () => INVALID_TRANSITION });
    const esito = await esegui(gateway, approveSite, { target: SITE_PENDING });

    expect(esito).toBe("MODERATION_REDIRECT:/app/moderation?esito=rifiutato-transizione");
    expect(esito).not.toContain("approvato");
    // La chiamata c'è stata: il rifiuto viene dal database, non da un'interfaccia che ha
    // deciso di non provarci.
    expect(gateway.commands).toEqual([
      { target: SITE_PENDING, action: "approve", reason: null },
    ]);
  });

  /**
   * DoD 4, forma esplicita: nessun errore della RPC — noto o ignoto — può uscire come
   * «approvato». Se il mappatore venisse «semplificato» ignorando l'errore, questa tabella
   * diventerebbe rossa per intero.
   */
  it.each([
    { caso: "sito non pubblicabile / senza abbonamento", failure: INVALID_TRANSITION },
    { caso: "vincolo sconosciuto", failure: { code: "23514", message: "boh" } },
    { caso: "errore di rete", failure: { code: null, message: "fetch failed" } },
    { caso: "funzione non esposta", failure: { code: "PGRST202", message: "not found" } },
  ] satisfies { caso: string; failure: RpcFailure }[])(
    "$caso non produce mai il gettone di successo",
    async ({ failure }) => {
      const esito = await esegui(
        new StubModerationGateway({ admin, failure: () => failure }),
        approveSite,
        { target: SITE_PENDING },
      );
      // Il gettone può essere un rifiuto o un errore — sono cose diverse e restano
      // distinte — ma non è mai `approvato`, che è l'unica lettura pericolosa.
      expect(esito).not.toContain("esito=approvato");
      expect(esito).not.toContain("esito=sospeso");
      expect(esito).toMatch(/esito=(rifiutato-[a-z]+|errore|richiesta-non-valida)$/);
    },
  );

  it("un rifiuto non rivalida la pagina come se qualcosa fosse cambiato", async () => {
    await esegui(new StubModerationGateway({ admin, failure: () => INVALID_TRANSITION }), approveSite, {
      target: SITE_PENDING,
    });
    expect(revalidazioni).toEqual([]);
  });
});

describe("approve accettato dal database", () => {
  it("riporta il successo e rivalida la pagina", async () => {
    const esito = await esegui(new StubModerationGateway({ admin }), approveSite, {
      target: SITE_PENDING,
    });
    expect(esito).toBe("MODERATION_REDIRECT:/app/moderation?esito=approvato");
    expect(revalidazioni).toEqual(["/app/moderation"]);
  });
});

describe("suspend", () => {
  it("senza motivazione non raggiunge mai il database", async () => {
    const gateway = new StubModerationGateway({ admin });
    const esito = await esegui(gateway, suspendSite, { target: SITE_PENDING, reason: "   " });

    expect(esito).toBe("MODERATION_REDIRECT:/app/moderation?esito=rifiutato-motivo");
    expect(gateway.commands, "una sospensione senza motivazione ha raggiunto la RPC").toEqual([]);
  });

  it("con motivazione consegna il testo dell'amministratore, ripulito ai bordi", async () => {
    const gateway = new StubModerationGateway({ admin });
    const esito = await esegui(gateway, suspendSite, {
      target: SITE_PENDING,
      reason: "  immagini non di proprietà  ",
    });

    expect(esito).toBe("MODERATION_REDIRECT:/app/moderation?esito=sospeso");
    expect(gateway.commands).toEqual([
      { target: SITE_PENDING, action: "suspend", reason: "immagini non di proprietà" },
    ]);
  });

  it("un identificativo malformato non raggiunge il database", async () => {
    const gateway = new StubModerationGateway({ admin });
    const esito = await esegui(gateway, suspendSite, { target: "8888", reason: "motivo valido" });
    expect(esito).toBe("MODERATION_REDIRECT:/app/moderation?esito=richiesta-non-valida");
    expect(gateway.commands).toEqual([]);
  });
});

describe("le azioni sono endpoint, e si difendono da sole", () => {
  /**
   * Un `<form>` non è l'unico modo di raggiungere una Server Action: un POST costruito a
   * mano la raggiunge lo stesso. Chi non è amministratore riceve 404 anche qui, e la
   * chiamata alla RPC non parte nemmeno.
   */
  it("chi non è amministratore riceve 404, non un messaggio", async () => {
    const gateway = new StubModerationGateway({ admin: null });
    const esito = await esegui(gateway, approveSite, { target: SITE_PENDING });
    expect(esito).toBe("MODERATION_NOT_FOUND");
    expect(gateway.commands).toEqual([]);
  });

  /**
   * Il secondo cancello, quello che conta: anche se il primo venisse rimosso, `moderate_site`
   * rialza `42501` e l'esito `forbidden` diventa 404 — mai un banner che confermi
   * l'esistenza dell'area.
   */
  it("un 42501 della RPC diventa 404 e non un banner", async () => {
    const esito = await esegui(
      new StubModerationGateway({ admin, failure: () => NOT_PLATFORM_ADMIN }),
      suspendSite,
      { target: SITE_PENDING, reason: "motivo valido" },
    );
    expect(esito).toBe("MODERATION_NOT_FOUND");
    expect(esito).not.toContain("esito=");
  });
});
