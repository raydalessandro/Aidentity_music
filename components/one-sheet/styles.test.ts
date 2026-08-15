import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./one-sheet.module.css", import.meta.url), "utf8");

describe("foglio A4 e densità", () => {
  it("la stampa usa la stessa pagina HTML in A4, senza margini del browser", () => {
    expect(css).toContain("@page { size: A4; margin: 0; }");
    expect(css).toMatch(/@media print[\s\S]*\.sheet \{[^}]*width: 210mm;[^}]*height: 297mm;/);
    expect(css).toContain("print-color-adjust: exact");
  });

  it("low cambia davvero la composizione, non soltanto il data-attribute", () => {
    expect(css).toContain('.sheet[data-density="low"] .photos { height: 82mm; }');
    expect(css).toContain('.sheet[data-density="low"] .body { grid-template-columns: 1fr;');
  });

  it("medium e high hanno geometrie distinte e high comprime anche il testo", () => {
    expect(css).toContain('.sheet[data-density="medium"] .photos { height: 68mm; grid-template-columns: repeat(3, 1fr); }');
    expect(css).toContain('.sheet[data-density="high"] .photos { height: 48mm; }');
    expect(css).toContain('.sheet[data-density="high"] .bio { font-size: 9.2pt; line-height: 1.35; }');
  });
});
