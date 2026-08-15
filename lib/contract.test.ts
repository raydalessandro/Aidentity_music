import { describe, expect, it } from "vitest";

import {
  siteConfigDraftSchema,
  siteConfigSchema,
  trackSchema,
  validBillingForPublication,
  type SiteConfig,
} from "./contract";

const completeConfig: SiteConfig = {
  version: 1,
  identity: {
    name: "NVLL CLICK",
    handle: "nvll-click",
    claim: "Electro-pop italiano",
    shortBio: "Bio breve",
    longBio: "Bio lunga",
    location: "Milano",
    locale: "it-IT",
  },
  theme: {
    ink: "#111111",
    panel: "#1a1a1a",
    paper: "#f5f2ea",
    muted: "#a0a0a0",
    dim: "#666666",
    line: "#333333",
    acid: "#ccff00",
  },
  fontPair: "grotesk-mono",
  iconFamily: "line",
  grain: false,
  surfaces: [
    { id: "feed", enabled: true },
    { id: "listen", enabled: true },
    { id: "epk", enabled: true },
    { id: "merch", enabled: true },
    { id: "home", enabled: true },
  ],
  sectionCopy: { version: 1 },
};

describe("contratto PR-0", () => {
  it("ammette un draft incompleto ma non una configurazione pubblicabile incompleta", () => {
    const draft = structuredClone(completeConfig);
    draft.identity.name = null;

    expect(siteConfigDraftSchema.safeParse(draft).success).toBe(true);
    expect(siteConfigSchema.safeParse(draft).success).toBe(false);
  });

  it("mantiene EPK e HOME nel layout canonico", () => {
    const invalid = structuredClone(completeConfig);
    invalid.surfaces[2]!.enabled = false;

    expect(siteConfigDraftSchema.safeParse(invalid).success).toBe(false);
  });

  it("distingue rigidamente upload ed embed", () => {
    expect(
      trackSchema.safeParse({
        source: "upload",
        title: "Brano",
        storagePath: "tracks/brano.mp3",
        mimeType: "audio/mpeg",
        byteSize: 42,
        durationSeconds: null,
      }).success,
    ).toBe(true);
    expect(
      trackSchema.safeParse({
        source: "embed",
        title: "Brano",
        provider: "spotify",
        url: "https://open.spotify.com/track/123",
        storagePath: "vietato",
      }).success,
    ).toBe(false);
  });

  it("considera trialing valido per pubblicazione e revisione", () => {
    expect(validBillingForPublication("trialing")).toBe(true);
    expect(validBillingForPublication("active")).toBe(true);
    expect(validBillingForPublication("not_started")).toBe(false);
    expect(validBillingForPublication("incomplete")).toBe(false);
  });
});
