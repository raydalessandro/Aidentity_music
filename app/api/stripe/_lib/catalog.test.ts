import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLANS, orderedCatalog, priceEnvName, requirePriceId, resolvePriceId } from "./catalog";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260815140002_pr_0_database_contract.sql",
);

describe("catalogo piani", () => {
  it("l'annuale BASE e' la prima voce mostrata", () => {
    const first = orderedCatalog()[0];
    expect(first?.code).toBe("base");
    expect(first?.interval).toBe("year");
  });

  it("mostra tutti gli annuali prima di qualunque mensile", () => {
    const intervals = orderedCatalog().map((entry) => entry.interval);
    expect(intervals).toEqual(["year", "year", "year", "month", "month", "month"]);
  });

  it("espone esattamente sei voci acquistabili", () => {
    expect(orderedCatalog()).toHaveLength(6);
  });

  it("l'annuale e' dodici mensilita' senza sconto (L0.7 §3)", () => {
    for (const plan of PLANS) {
      expect(plan.annualPriceCents, plan.code).toBe(plan.monthlyPriceCents * 12);
    }
  });

  it("i valori coincidono con le righe public.plans della migrazione PR-0", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    for (const plan of PLANS) {
      const row = `('${plan.code}',${plan.monthlyPriceCents},${plan.annualPriceCents},${plan.photoLimit},${plan.uploadTrackLimit},${plan.storageBytes})`;
      expect(sql, `riga mancante o diversa: ${row}`).toContain(row);
    }
  });

  it("rispetta l'invariante E1: la quota byte sta sopra l'uso pieno dichiarato", () => {
    // §12 E1: dodici foto ad alta risoluzione (~4 MB) piu' tre tracce (~5 MB)
    // devono stare dentro il BASE. La stessa regola vale per PRO e MAX.
    const PHOTO = 4 * 1_000_000;
    const TRACK = 5 * 1_000_000;
    for (const plan of PLANS) {
      const fullUse = plan.photoLimit * PHOTO + plan.uploadTrackLimit * TRACK;
      expect(plan.storageBytes, `${plan.code}: ${plan.storageBytes} <= ${fullUse}`).toBeGreaterThan(
        fullUse,
      );
    }
  });

  it("i nomi delle variabili price sono deterministici", () => {
    expect(priceEnvName("base", "year")).toBe("STRIPE_PRICE_BASE_YEAR");
    expect(priceEnvName("max", "month")).toBe("STRIPE_PRICE_MAX_MONTH");
  });
});

describe("risoluzione dei price id", () => {
  it("risolve un price id configurato e rifiuta uno sconosciuto", () => {
    const previous = process.env.STRIPE_PRICE_PRO_MONTH;
    process.env.STRIPE_PRICE_PRO_MONTH = "price_finto_pro_mensile";
    try {
      expect(resolvePriceId("price_finto_pro_mensile")).toEqual({ code: "pro", interval: "month" });
      expect(resolvePriceId("price_mai_configurato")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.STRIPE_PRICE_PRO_MONTH;
      else process.env.STRIPE_PRICE_PRO_MONTH = previous;
    }
  });

  it("un price id non configurato fa fallire il checkout invece di indovinare", () => {
    const previous = process.env.STRIPE_PRICE_MAX_YEAR;
    delete process.env.STRIPE_PRICE_MAX_YEAR;
    try {
      expect(() => requirePriceId("max", "year")).toThrowError(/STRIPE_PRICE_MAX_YEAR/u);
    } finally {
      if (previous !== undefined) process.env.STRIPE_PRICE_MAX_YEAR = previous;
    }
  });
});
