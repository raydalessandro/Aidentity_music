import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("conserva un percorso relativo con query e frammento", () => {
    expect(safeRedirectPath("/wizard/identita?passo=2#tema")).toBe("/wizard/identita?passo=2#tema");
  });

  it("normalizza i percorsi risolvibili", () => {
    expect(safeRedirectPath("/a/../b")).toBe("/b");
  });

  it("ripiega sulla radice quando manca il parametro", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });
});

describe("destinazioni che devono essere rifiutate", () => {
  const hostili = [
    "https://sito-ostile.example/raccolta",
    "//sito-ostile.example",
    "/\\sito-ostile.example",
    "http://sito-ostile.example",
    "javascript:alert(1)",
    "wizard",
    "  /wizard",
  ];

  for (const value of hostili) {
    it(`rifiuta ${JSON.stringify(value)} e ripiega sulla radice`, () => {
      expect(safeRedirectPath(value)).toBe("/");
    });
  }

  it("rifiuta un percorso con caratteri di controllo", () => {
    expect(safeRedirectPath("/wizard\r\nSet-Cookie:%20x=1")).toBe("/");
  });
});
