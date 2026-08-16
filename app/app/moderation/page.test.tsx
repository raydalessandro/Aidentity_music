// La pagina eseguita davvero, non ispezionata.
//
// Il primo invariante di questo filone — «chi non è amministratore riceve 404» — è una
// proprietà del comportamento, e un test che si limitasse a cercare la stringa
// `notFound()` nel sorgente resterebbe verde anche se quella riga finisse dentro un ramo
// mai raggiunto. Qui la pagina viene invocata, con una porta iniettata al posto di
// Supabase, e si misura cosa succede.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("MODERATION_NOT_FOUND");
  },
  redirect: (url: string): never => {
    throw new Error(`MODERATION_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (): void => {} }));

import {
  ADMIN_ID,
  OWNER_A_ID,
  SITE_PENDING,
  StubModerationGateway,
  admin,
  queueFixture,
} from "../../../lib/moderation/fixtures";
import type { ModerationGateway } from "../../../lib/moderation/types";
import { configureModerationGateway, resetModerationGateway } from "./composition";
import ModerationPage from "./page";

afterEach(() => resetModerationGateway());

type Params = Record<string, string | string[] | undefined>;

async function render(gateway: StubModerationGateway, params: Params = {}): Promise<string> {
  configureModerationGateway(gateway);
  return renderToStaticMarkup(await ModerationPage({ searchParams: Promise.resolve(params) }));
}

/**
 * Chi non è amministratore. Casi diversi, **una sola risposta attesa**: 404.
 *
 * Nessuno di questi deve ricevere 403, una pagina vuota o un rimando a `/login`: ognuna di
 * quelle risposte confermerebbe che l'area esiste. `currentAdmin()` che torna `null` è
 * esattamente ciò che l'adattatore produce per l'anonimo, per l'owner qualunque, per la
 * sessione scaduta e per l'errore di rete.
 */
const nonAmministratori = [
  { caso: "nessuna sessione (anonimo)", gateway: () => new StubModerationGateway({ admin: null }) },
  {
    caso: "owner autenticato ma non amministratore",
    gateway: () => new StubModerationGateway({ admin: null, queue: queueFixture() }),
  },
  {
    caso: "sessione scaduta o lettura di platform_admins fallita",
    gateway: () =>
      new StubModerationGateway({
        admin: null,
        queue: { sites: [], subscriptions: [] },
      }),
  },
] as const;

describe("l'area non esiste, per chi non è amministratore", () => {
  it.each(nonAmministratori)("$caso → 404", async ({ gateway }) => {
    await expect(render(gateway())).rejects.toThrow("MODERATION_NOT_FOUND");
  });

  it("il 404 arriva prima di qualunque lettura della coda", async () => {
    let letture = 0;
    const spia: ModerationGateway = {
      currentAdmin: () => Promise.resolve(null),
      listQueue: () => {
        letture += 1;
        return Promise.resolve(queueFixture());
      },
      moderate: () => Promise.resolve(null),
    };
    configureModerationGateway(spia);
    await expect(ModerationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "MODERATION_NOT_FOUND",
    );
    expect(letture, "la coda è stata letta da un non amministratore").toBe(0);
  });

  /**
   * Il 404 non è un caso particolare dell'assenza di dati: con la coda vuota
   * l'amministratore vede comunque la pagina. Senza questo controllo, un `notFound()`
   * piazzato per il motivo sbagliato passerebbe per corretto.
   */
  it("una coda vuota non è un 404: è una pagina che dice che non c'è nulla da fare", async () => {
    const markup = await render(
      new StubModerationGateway({ admin, queue: { sites: [], subscriptions: [] } }),
    );
    expect(markup).toContain("Nessun sito da moderare");
  });
});

describe("l'area, per l'amministratore", () => {
  it("rende la coda ordinata e non le righe scartate", async () => {
    const markup = await render(new StubModerationGateway({ admin }));

    const posizioni = ["owner-c-review", "sospeso-vecchio", "nvll-click"].map((slug) =>
      markup.indexOf(`data-slug="${slug}"`),
    );
    expect(posizioni, `posizioni: ${JSON.stringify(posizioni)}`).not.toContain(-1);
    expect(posizioni).toEqual([...posizioni].sort((left, right) => left - right));

    for (const assente of ["owner-b-draft", "stato-inventato", "identificativo-rotto"]) {
      expect(markup, `riga scartata resa comunque: ${assente}`).not.toContain(assente);
    }
  });

  it("ogni riga porta il proprio identificativo nel form, non lo slug", async () => {
    const markup = await render(new StubModerationGateway({ admin }));
    expect(markup).toContain(`name="target" value="${SITE_PENDING}"`);
  });

  /**
   * Il punto di equilibrio dell'intera superficie: l'autorità è la RPC.
   *
   * `owner-c-review` non ha abbonamento attivo, quindi un `approve` verrà rifiutato dal
   * database. Il pulsante c'è lo stesso. Se lo spegnessimo, il rifiuto non arriverebbe mai
   * sotto gli occhi di nessuno e l'interfaccia starebbe indovinando al posto del database —
   * con il rischio che indovini bene oggi e male domani, quando la regola cambia in una
   * migrazione che nessuno ricopia qui.
   */
  it("il pulsante Approva compare anche dove l'abbonamento non è attivo", async () => {
    const markup = await render(new StubModerationGateway({ admin }));
    const riga = markup.slice(markup.indexOf('data-slug="owner-c-review"'));
    const fineRiga = riga.indexOf("</tr>");
    const soloRiga = riga.slice(0, fineRiga);
    expect(soloRiga).toContain('data-subscription-active="false"');
    expect(soloRiga).toContain('data-action="approve"');
    expect(soloRiga).not.toContain("disabled");
  });

  it("la sospensione ha un campo motivazione obbligatorio, etichettato", async () => {
    const markup = await render(new StubModerationGateway({ admin }));
    expect(markup).toContain(`for="motivo-${SITE_PENDING}"`);
    expect(markup).toContain(`id="motivo-${SITE_PENDING}"`);
    expect(markup).toContain('name="reason"');
    expect(markup).toContain("required");
  });

  it("non stampa l'identificativo dell'amministratore né quello dell'owner", async () => {
    const markup = await render(new StubModerationGateway({ admin }));
    expect(markup).not.toContain(ADMIN_ID);
    expect(markup).not.toContain(OWNER_A_ID);
  });
});

describe("il banner d'esito", () => {
  it("dice che l'approvazione è stata rifiutata, e che nulla è cambiato", async () => {
    const markup = await render(new StubModerationGateway({ admin }), {
      esito: "rifiutato-transizione",
    });
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-tone="rifiuto"');
    expect(markup).toContain("Nulla è cambiato");
    expect(markup).not.toContain("Sito approvato");
  });

  it("dice l'approvazione riuscita quando è riuscita", async () => {
    const markup = await render(new StubModerationGateway({ admin }), { esito: "approvato" });
    expect(markup).toContain("Sito approvato");
    expect(markup).toContain('data-tone="ok"');
  });

  it.each([
    { caso: "gettone inventato", params: { esito: "approvato-per-davvero" } },
    { caso: "parametro ripetuto", params: { esito: ["approvato", "sospeso"] } },
    { caso: "nessun parametro", params: {} },
  ])("$caso non produce nessun banner", async ({ params }) => {
    const markup = await render(new StubModerationGateway({ admin }), params as Params);
    expect(markup).not.toContain('role="status"');
  });

  /**
   * Il banner arriva dalla query string, che chiunque può scrivere a mano. Non è un
   * problema — l'area la vede solo un amministratore — ma resta vero che la verità è la
   * tabella: uno stato falsificato nell'URL non cambia la riga renderizzata.
   */
  it("un esito falsificato nell'URL non cambia lo stato mostrato in tabella", async () => {
    const markup = await render(new StubModerationGateway({ admin }), { esito: "approvato" });
    const riga = markup.slice(markup.indexOf('data-slug="owner-c-review"'));
    expect(riga.slice(0, riga.indexOf("</tr>"))).toContain('data-status="pending_review"');
  });
});
