import { describe, expect, it } from "vitest";

import { BASE_URL_ENV_KEYS, BaseUrlError, absoluteUrl, resolveBaseUrl } from "./base-url";

describe("risoluzione dell'URL base", () => {
  it("preferisce il dominio canonico a qualunque variabile Vercel", () => {
    expect(
      resolveBaseUrl({
        NEXT_PUBLIC_SITE_URL: "https://aidentity.example",
        VERCEL_PROJECT_PRODUCTION_URL: "prod.vercel.app",
        VERCEL_URL: "deploy-abc.vercel.app",
      }),
    ).toBe("https://aidentity.example");
  });

  it("usa il dominio di produzione Vercel quando manca quello canonico", () => {
    expect(
      resolveBaseUrl({
        VERCEL_PROJECT_PRODUCTION_URL: "prod.vercel.app",
        VERCEL_URL: "deploy-abc.vercel.app",
      }),
    ).toBe("https://prod.vercel.app");
  });

  it("ripiega sul deploy corrente e vi aggiunge lo schema mancante", () => {
    expect(resolveBaseUrl({ VERCEL_URL: "deploy-abc.vercel.app" })).toBe("https://deploy-abc.vercel.app");
  });

  it("ripiega su localhost rispettando PORT", () => {
    expect(resolveBaseUrl({})).toBe("http://localhost:3000");
    expect(resolveBaseUrl({ PORT: "4010" })).toBe("http://localhost:4010");
  });

  it("ignora i valori vuoti e passa alla fonte successiva", () => {
    expect(
      resolveBaseUrl({ NEXT_PUBLIC_SITE_URL: "   ", VERCEL_URL: "deploy-abc.vercel.app" }),
    ).toBe("https://deploy-abc.vercel.app");
  });

  it("normalizza la barra finale a un'origine senza path", () => {
    expect(resolveBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://aidentity.example/" })).toBe(
      "https://aidentity.example",
    );
  });

  // Casi che DEVONO essere rifiutati: l'esito atteso è BaseUrlError con la chiave colpevole.
  it("rifiuta un'origine con percorso, perché il multi-tenant vive sotto /[slug]", () => {
    let thrown: unknown;
    try {
      resolveBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://aidentity.example/siti" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BaseUrlError);
    expect((thrown as BaseUrlError).key).toBe("NEXT_PUBLIC_SITE_URL");
    expect((thrown as BaseUrlError).message).toBe(
      'NEXT_PUBLIC_SITE_URL non è un\'origine assoluta valida: "https://aidentity.example/siti"',
    );
  });

  it("rifiuta un valore che non è un URL", () => {
    expect(() => resolveBaseUrl({ NEXT_PUBLIC_SITE_URL: "non un url" })).toThrowError(BaseUrlError);
  });

  it("rifiuta uno schema non http(s)", () => {
    expect(() => resolveBaseUrl({ NEXT_PUBLIC_SITE_URL: "ftp://aidentity.example" })).toThrowError(
      BaseUrlError,
    );
  });

  it("rifiuta una query nell'origine", () => {
    expect(() => resolveBaseUrl({ VERCEL_URL: "deploy.vercel.app?x=1" })).toThrowError(BaseUrlError);
  });

  it("mantiene l'ordine di precedenza dichiarato", () => {
    expect([...BASE_URL_ENV_KEYS]).toEqual([
      "NEXT_PUBLIC_SITE_URL",
      "VERCEL_PROJECT_PRODUCTION_URL",
      "VERCEL_URL",
    ]);
  });
});

describe("composizione di URL assoluti", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "https://aidentity.example" } as const;

  it("compone un percorso di superficie", () => {
    expect(absoluteUrl("/nvll-click/epk", env)).toBe("https://aidentity.example/nvll-click/epk");
  });

  it("tollera un percorso senza barra iniziale", () => {
    expect(absoluteUrl("nvll-click", env)).toBe("https://aidentity.example/nvll-click");
  });

  it("non produce una doppia barra per la radice", () => {
    expect(absoluteUrl("/", env)).toBe("https://aidentity.example");
    expect(absoluteUrl("", env)).toBe("https://aidentity.example");
  });
});
