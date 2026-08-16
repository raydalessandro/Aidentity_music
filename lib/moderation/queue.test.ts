// La coda: cosa entra, in che ordine, e soprattutto cosa non entra.

import { describe, expect, it } from "vitest";

import {
  SITE_DRAFT,
  SITE_PENDING,
  SITE_PUBLISHED,
  queueFixture,
  sitesFixture,
} from "./fixtures";
import { buildModerationQueue, formatQueueDate } from "./queue";

const queue = buildModerationQueue(queueFixture());

/** Esiti attesi dichiarati uno per uno: quale riga sparisce e perché. */
const scartate: readonly { id: string; perche: string }[] = [
  { id: SITE_DRAFT, perche: "draft: in moderazione ci entra l'owner con request_site_review" },
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    perche: "stato fuori dall'enum publication_status",
  },
  { id: "non-un-uuid", perche: "identificativo che moderate_site non accetterebbe" },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", perche: "slug vuoto" },
];

describe("buildModerationQueue scarta", () => {
  it.each(scartate)("$id — $perche", ({ id }) => {
    expect(queue.map((entry) => entry.id)).not.toContain(id);
  });

  it("tiene solo le tre righe moderabili della fixture", () => {
    expect(queue).toHaveLength(3);
    expect(queue.map((entry) => entry.slug)).toEqual([
      "owner-c-review",
      "sospeso-vecchio",
      "nvll-click",
    ]);
  });
});

describe("buildModerationQueue ordina per lavoro da fare", () => {
  it("prima chi aspetta una risposta, poi chi è fermo, infine chi è online", () => {
    expect(queue.map((entry) => entry.status)).toEqual([
      "pending_review",
      "suspended",
      "published",
    ]);
  });

  it("a parità di stato, prima la riga più vecchia", () => {
    const attese = buildModerationQueue({
      sites: [
        {
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          slug: "recente",
          publication_status: "pending_review",
          created_at: "2026-03-01T09:00:00+00:00",
        },
        {
          id: SITE_PENDING,
          slug: "vecchio",
          publication_status: "pending_review",
          created_at: "2026-01-01T09:00:00+00:00",
        },
        {
          id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          slug: "senza-data",
          publication_status: "pending_review",
          created_at: null,
        },
      ],
      subscriptions: [],
    });
    expect(attese.map((entry) => entry.slug)).toEqual(["vecchio", "recente", "senza-data"]);
  });

  /**
   * Due righe senza data: `Infinity - Infinity` è `NaN` e un comparatore che restituisce
   * `NaN` rende l'ordine dipendente dall'implementazione di `sort`. Qui si misura che
   * l'ordine esiste ed è quello alfabetico dichiarato.
   */
  it("due righe senza data restano ordinate, non a caso", () => {
    const senzaData = buildModerationQueue({
      sites: [
        { id: SITE_PENDING, slug: "zeta", publication_status: "pending_review", created_at: null },
        { id: SITE_PUBLISHED, slug: "alfa", publication_status: "pending_review" },
      ],
      subscriptions: [],
    });
    expect(senzaData.map((entry) => entry.slug)).toEqual(["alfa", "zeta"]);
  });
});

describe("l'abbonamento è un indizio, non un cancello", () => {
  it("riporta il billing_status che il database ha davvero", () => {
    const perSlug = new Map(queue.map((entry) => [entry.slug, entry]));
    expect(perSlug.get("nvll-click")?.billing).toBe("trialing");
    expect(perSlug.get("nvll-click")?.subscriptionActive).toBe(true);
    expect(perSlug.get("owner-c-review")?.billing).toBe("not_started");
    expect(perSlug.get("owner-c-review")?.subscriptionActive).toBe(false);
    expect(perSlug.get("sospeso-vecchio")?.subscriptionActive).toBe(false);
  });

  /**
   * La riga di abbonamento con `site_id` non-UUID della fixture porta `active`. Se venisse
   * indicizzata per chiave grezza, basterebbe una riga così a mostrare «attivo» accanto a
   * un sito che non ha nessun abbonamento — e a rendere incomprensibile il rifiuto della
   * RPC che seguirebbe.
   */
  it("una riga di abbonamento con site_id malformato non contagia nessun sito", () => {
    for (const entry of queue) {
      expect(entry.billing).not.toBe("active");
    }
  });

  it("un sito senza riga di abbonamento non è attivo per omissione", () => {
    const orfano = buildModerationQueue({
      sites: [{ id: SITE_PENDING, slug: "orfano", publication_status: "pending_review" }],
      subscriptions: [],
    });
    expect(orfano[0]?.billing).toBe(null);
    expect(orfano[0]?.subscriptionActive).toBe(false);
  });

  it.each(["not_started", "past_due", "canceled", "unpaid", "paused", "incomplete"])(
    "%s non è un abbonamento che il database considera pubblicabile",
    (billing) => {
      const riga = buildModerationQueue({
        sites: [{ id: SITE_PENDING, slug: "sito", publication_status: "pending_review" }],
        subscriptions: [{ site_id: SITE_PENDING, billing_status: billing }],
      });
      expect(riga[0]?.subscriptionActive).toBe(false);
    },
  );
});

describe("formatQueueDate", () => {
  it("rende il giorno in UTC, non il fuso del processo", () => {
    expect(formatQueueDate("2026-02-01T23:30:00+00:00")).toBe("2026-02-01");
  });

  it.each([
    { caso: "assente", raw: null },
    { caso: "non è una data", raw: "domani" },
    { caso: "stringa vuota", raw: "" },
  ])("$caso diventa un trattino, non «Invalid Date»", ({ raw }) => {
    expect(formatQueueDate(raw)).toBe("—");
  });
});

/** La fixture deve continuare a contenere casi da rifiutare, altrimenti smette di provare. */
describe("la fixture", () => {
  it("porta più righe da rifiutare che righe buone", () => {
    expect(sitesFixture.length - queue.length).toBeGreaterThanOrEqual(queue.length);
  });
});
