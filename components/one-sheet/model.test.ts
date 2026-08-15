import { describe, expect, it } from "vitest";

import { chooseDensity, prepareOneSheet, type OneSheetInput } from "./model";

const SITE = "22222222-2222-2222-2222-222222222222";
const OTHER = "55555555-5555-5555-5555-555555555555";

function input(overrides: Partial<OneSheetInput> = {}): OneSheetInput {
  return {
    siteId: SITE,
    slug: "nvll-click",
    identity: { name: "NVLL CLICK", handle: "nvll-click", claim: "Electro-pop italiano", shortBio: "Breve.", longBio: "Bio lunga.", location: "Milano" },
    palette: { ink: "#111111", panel: "#1a1a1a", paper: "#f5f2ea", muted: "#a0a0a0", dim: "#666666", line: "#333333", acid: "#ccff00", acidInk: "#111111" },
    contacts: [], links: [], press: [], dates: [], metrics: [], photoKit: [],
    ...overrides,
  };
}

const photo = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, kind: "photo_hi", alt: null, src: `/api/media/asset/${site_id}/${id}`, sort_order });
const date = (id: string, site_id = SITE, sort_order = 0) => ({ id, site_id, starts_at: "2099-01-01T20:00:00+01:00", city: "Milano", venue: "Venue", ticket_url: null, sort_order });

function richInput(): OneSheetInput {
  return input({
    photoKit: Array.from({ length: 4 }, (_, index) => photo(`p${index}`, SITE, index)),
    dates: Array.from({ length: 10 }, (_, index) => date(`d${index}`, SITE, index)),
    metrics: Array.from({ length: 10 }, (_, index) => ({ id: `m${index}`, site_id: SITE, label: `M${index}`, value: `${index}`, sort_order: index })),
    links: Array.from({ length: 10 }, (_, index) => ({ id: `l${index}`, site_id: SITE, provider: "spotify", url: `https://example.test/${index}`, sort_order: index })),
  });
}

describe("densità one-sheet", () => {
  it("due foto e una data scelgono low: il caso minimo non resta mezzo vuoto", () => {
    expect(chooseDensity(input({ photoKit: [photo("p1"), photo("p2")], dates: [date("d1")] }))).toBe("low");
  });

  it("materiale intermedio sceglie medium", () => {
    expect(chooseDensity(input({
      photoKit: [photo("p1"), photo("p2"), photo("p3")],
      dates: [date("d1"), date("d2"), date("d3")],
      metrics: [{ id: "m1", site_id: SITE, label: "Ascolti", value: "10k", sort_order: 0 }],
    }))).toBe("medium");
  });

  it("materiale ricco sceglie high", () => {
    expect(prepareOneSheet(richInput()).density).toBe("high");
  });

  it("high mostra al massimo cinque date", () => {
    expect(prepareOneSheet(richInput()).dates).toHaveLength(5);
  });

  it("high mostra al massimo cinque metriche", () => {
    expect(prepareOneSheet(richInput()).metrics).toHaveLength(5);
  });

  it("high mostra al massimo cinque link", () => {
    expect(prepareOneSheet(richInput()).links).toHaveLength(5);
  });
});

describe("confini di pubblicazione", () => {
  it("scarta la foto di un altro tenant prima di scegliere la densità", () => {
    const prepared = prepareOneSheet(input({ photoKit: [photo("mine"), photo("other", OTHER)] }));
    expect(prepared.photoKit.map((item) => item.id)).toEqual(["mine"]);
  });

  it("scarta la data di un altro tenant prima di scegliere la densità", () => {
    const prepared = prepareOneSheet(input({ dates: [date("mine-date"), date("other-date", OTHER)] }));
    expect(prepared.dates.map((item) => item.id)).toEqual(["mine-date"]);
  });

  it("un contatto che porta il campo consenso non viene mai reso, nemmeno se valorizzato", () => {
    const hostile = {
      id: "c-bad", site_id: SITE, role: "press" as const, name: "Privato", email: "private@example.test", sort_order: 0,
      consent_confirmed_at: null,
    } as unknown as OneSheetInput["contacts"][number];
    const safe = { id: "c-ok", site_id: SITE, role: "booking" as const, name: "Pubblico", email: "public@example.test", sort_order: 1 };
    const prepared = prepareOneSheet(input({ contacts: [hostile, safe] }));
    expect(prepared.contacts.map((item) => item.email)).toEqual(["public@example.test"]);
  });
});
