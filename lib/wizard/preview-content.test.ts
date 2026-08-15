import { describe, expect, it } from "vitest";

import type { SiteConfigDraft } from "../contract";
import { epkContentForPreview } from "./preview-content";

const config: SiteConfigDraft = {
  version: 1,
  identity: { name: null, handle: null, claim: null, shortBio: "breve", longBio: "lunga", location: null, locale: "it-IT" },
  theme: { ink: "#111111", panel: "#1a1a1a", paper: "#f5f2ea", muted: "#a0a0a0", dim: "#666666", line: "#333333", acid: "#ccff00" },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true }, { id: "listen", enabled: true }, { id: "epk", enabled: true },
    { id: "merch", enabled: true }, { id: "home", enabled: true },
  ],
  sectionCopy: { version: 1 },
};

describe("epkContentForPreview", () => {
  it("non lascia che la preview condivisibile dipenda dal filtro consenso del componente EPK", () => {
    const result = epkContentForPreview(config, {
      contacts: [
        { id: "ok", role: "booking", name: "Consentito", email: "ok@example.test", consent_confirmed_at: "2026-08-15T00:00:00Z", sort_order: 0 },
        { id: "no", role: "press", name: "Privato", email: "no@example.test", consent_confirmed_at: null, sort_order: 1 },
      ],
      links: [], press: [], dates: [], metrics: [],
    });
    expect(result.contacts.map((contact) => contact.id)).toEqual(["ok"]);
  });
});
