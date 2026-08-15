import { describe, expect, it } from "vitest";
import { draftSlugForUser, normalizeSlugInput } from "./slug";

describe("draftSlugForUser", () => {
  it("produce uno slug canonico e deterministico usando l'intero UUID", () => {
    expect(draftSlugForUser("550E8400-E29B-41D4-A716-446655440000")).toBe(
      "draft-550e8400e29b41d4a716446655440000",
    );
  });

  it("non introduce caratteri fuori dal vocabolario slug", () => {
    expect(draftSlugForUser("ABC_def.123")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("normalizeSlugInput", () => {
  it("normalizza spazi, accenti e punteggiatura senza duplicare la reserved list", () => {
    expect(normalizeSlugInput("  ÈLLE 42 / Live! ")).toBe("elle-42-live");
  });
});
