import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { magicLinkRedirect } from "./magic-link-redirect";

const SITO = "https://aidentity.example";
let precedente: string | undefined;

beforeEach(() => {
  precedente = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = SITO;
});

afterEach(() => {
  if (precedente === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = precedente;
});

describe("destinazione del magic link", () => {
  it("porta il percorso richiesto fin dentro il link inviato per email", () => {
    expect(magicLinkRedirect("/app/wizard")).toBe(`${SITO}/auth/callback?next=%2Fapp%2Fwizard`);
  });

  it("conserva la query della destinazione", () => {
    expect(magicLinkRedirect("/app/wizard?passo=tema")).toBe(
      `${SITO}/auth/callback?next=%2Fapp%2Fwizard%3Fpasso%3Dtema`,
    );
  });

  it("senza destinazione il link resta identico a prima", () => {
    expect(magicLinkRedirect(null)).toBe(`${SITO}/auth/callback`);
  });

  it("una destinazione che vale gia' la radice non aggiunge parametri inutili", () => {
    expect(magicLinkRedirect("/")).toBe(`${SITO}/auth/callback`);
  });

  // I casi che DEVONO essere rifiutati. Non basta che non compaia il dominio
  // ostile: il link deve tornare esattamente quello neutro, perche' un
  // parametro `next` presente ma innocuo sarebbe comunque un parametro che
  // qualcuno di esterno ha scelto di far comparire in un'email nostra.
  it.each([
    ["dominio assoluto", "https://attaccante.example/raccogli"],
    ["protocol-relative", "//attaccante.example/raccogli"],
    ["backslash", "/\\attaccante.example"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["percorso non assoluto", "app/wizard"],
    ["stringa vuota", ""],
    ["ritorno a capo iniettato", "/app/wizard\r\nLocation: https://attaccante.example"],
  ])("rifiuta %s e ricade sul link neutro", (_nome, ostile) => {
    expect(magicLinkRedirect(ostile)).toBe(`${SITO}/auth/callback`);
  });

  it("non spedisce mai un link verso un'origine diversa dal sito", () => {
    for (const ostile of [
      "https://attaccante.example",
      "//attaccante.example",
      "/\\attaccante.example",
      "https://aidentity.example.attaccante.example/finta",
    ]) {
      expect(new URL(magicLinkRedirect(ostile)).origin).toBe(SITO);
      expect(magicLinkRedirect(ostile)).not.toContain("attaccante.example");
    }
  });

  it("un valore non testuale non entra nel link", () => {
    const file = new File(["contenuto"], "next.txt");
    expect(magicLinkRedirect(file)).toBe(`${SITO}/auth/callback`);
  });
});
