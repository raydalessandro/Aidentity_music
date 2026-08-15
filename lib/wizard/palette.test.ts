import { describe, expect, it } from "vitest";

import { resolvePalette } from "../../app/[slug]/read-model";
import type { SiteConfigDraft } from "../contract";
import { paletteForDraft } from "./palette";

const config: SiteConfigDraft = {
  version: 1,
  identity: { name: null, handle: null, claim: null, shortBio: null, longBio: null, location: null, locale: "it-IT" },
  theme: { ink: "#123456", panel: "#234567", paper: "#345678", muted: "#456789", dim: "#56789a", line: "#6789ab", acid: "#89abcd" },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true },
    { id: "merch", enabled: true }, { id: "home", enabled: true },
  ],
  sectionCopy: { version: 1 },
};

describe("paletteForDraft", () => {
  it("resta in parità col resolver del renderer D anche per un tema custom", () => {
    expect(paletteForDraft(config)).toEqual(resolvePalette(config.theme));
  });
});
