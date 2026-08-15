import { describe, expect, it } from "vitest";

import { billingStatusSchema, publicationStatusSchema } from "../../../../lib/contract";

import {
  RETENTION_DAYS,
  decideLifecycle,
  retentionPurgeDate,
  type BillingStatus,
  type LifecycleEvent,
  type LifecycleFacts,
  type PublicationStatus,
  type SiteLifecycleState,
} from "./lifecycle";

const site = (over: Partial<SiteLifecycleState> = {}): SiteLifecycleState => ({
  publicationStatus: "draft",
  approvedAt: null,
  moderationSuspendedAt: null,
  subscriptionEndedAt: null,
  planCode: "base",
  interval: "year",
  billingStatus: "not_started",
  ...over,
});

const facts = (over: Partial<LifecycleFacts> = {}): LifecycleFacts => ({
  overQuota: false,
  contentPublishable: true,
  ...over,
});

const event = (over: Partial<LifecycleEvent> = {}): LifecycleEvent => ({
  kind: "subscription_state",
  billingStatus: "active",
  planCode: "base",
  interval: "year",
  ...over,
});

const APPROVED = "2026-08-01T10:00:00.000Z";
const HOLD = "2026-08-10T10:00:00.000Z";

// Le uniche coppie (da, a) di cui il webhook e' autore in L0.7 §4.
// Deve coincidere con la whitelist della funzione public.apply_billing_event.
const WEBHOOK_TRANSITIONS = new Set([
  "draft>pending_review",
  "draft>published",
  "pending_review>draft",
  "published>suspended",
  "published>draft",
  "suspended>published",
  "suspended>draft",
]);

describe("L0.7 §4 — righe di cui il webhook e' autore", () => {
  it("primo pagamento valido: draft -> pending_review", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "active" }),
      site: site({ publicationStatus: "draft", billingStatus: "not_started" }),
      facts: facts(),
    });
    expect(decision).toEqual({
      nextStatus: "pending_review",
      retention: "clear",
      rule: "first_valid_payment",
    });
  });

  it("pagamento valido dopo una precedente approvazione, senza hold: draft -> published", () => {
    const decision = decideLifecycle({
      event: event(),
      site: site({ publicationStatus: "draft", approvedAt: APPROVED, billingStatus: "canceled" }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBe("published");
    expect(decision.rule).toBe("valid_payment_after_approval");
  });

  it("pagamento perso prima della prima approvazione: pending_review -> draft", () => {
    for (const lost of ["past_due", "unpaid", "paused", "incomplete"] as const) {
      const decision = decideLifecycle({
        event: event({ billingStatus: lost }),
        site: site({ publicationStatus: "pending_review" }),
        facts: facts(),
      });
      expect(decision.nextStatus, `stato ${lost}`).toBe("draft");
      expect(decision.rule).toBe("payment_lost_before_first_approval");
      // La retention parte solo con la disdetta, non con un pagamento perso.
      expect(decision.retention).toBe("none");
    }
  });

  it("pagamento recuperato prima della prima approvazione: draft -> pending_review", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "active" }),
      site: site({ publicationStatus: "draft", billingStatus: "past_due", approvedAt: null }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBe("pending_review");
    expect(decision.rule).toBe("payment_recovered_before_first_approval");
  });

  it("disdetta o scadenza: pending_review, published e suspended tornano a draft con retention", () => {
    for (const from of ["pending_review", "published", "suspended"] as const) {
      const decision = decideLifecycle({
        event: event({ kind: "subscription_deleted", billingStatus: "canceled" }),
        site: site({ publicationStatus: from, approvedAt: APPROVED }),
        facts: facts(),
      });
      expect(decision.nextStatus, `da ${from}`).toBe("draft");
      expect(decision.retention).toBe("start");
      expect(decision.rule).toBe("cancellation");
    }
  });

  it("la disdetta di un draft mai stato attivo non avvia nessuna retention", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "canceled" }),
      site: site({ publicationStatus: "draft", approvedAt: null }),
      facts: facts(),
    });
    expect(decision).toEqual({ nextStatus: null, retention: "none", rule: "no_change" });
  });

  it("la disdetta di un draft gia' stato pubblicato avvia comunque la retention", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "canceled" }),
      site: site({ publicationStatus: "draft", approvedAt: APPROVED }),
      facts: facts(),
    });
    expect(decision).toEqual({ nextStatus: null, retention: "start", rule: "cancellation" });
  });

  it("pagamento fallito: published -> suspended", () => {
    for (const failed of ["past_due", "unpaid", "paused"] as const) {
      const decision = decideLifecycle({
        event: event({ billingStatus: failed }),
        site: site({ publicationStatus: "published", approvedAt: APPROVED }),
        facts: facts(),
      });
      expect(decision.nextStatus, `stato ${failed}`).toBe("suspended");
      expect(decision.rule).toBe("payment_failed");
    }
  });

  it("recupero pagamento senza hold di moderazione: suspended -> published", () => {
    const decision = decideLifecycle({
      event: event(),
      site: site({
        publicationStatus: "suspended",
        approvedAt: APPROVED,
        billingStatus: "past_due",
        moderationSuspendedAt: null,
      }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBe("published");
    expect(decision.rule).toBe("payment_recovered");
  });

  it("downgrade effettivo oltre quota: published -> draft", () => {
    const decision = decideLifecycle({
      event: event({ planCode: "base", interval: "month" }),
      site: site({ publicationStatus: "published", approvedAt: APPROVED, planCode: "max" }),
      facts: facts({ overQuota: true }),
    });
    expect(decision.nextStatus).toBe("draft");
    expect(decision.rule).toBe("downgrade_over_quota");
  });

  it("cambio piano che resta nei limiti non cambia lo stato di pubblicazione", () => {
    const decision = decideLifecycle({
      event: event({ planCode: "max", interval: "month" }),
      site: site({ publicationStatus: "published", approvedAt: APPROVED, planCode: "pro" }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBeNull();
    expect(decision.rule).toBe("plan_change");
  });
});

describe("casi che devono essere rifiutati", () => {
  it("il recupero pagamento con hold di moderazione NON ripubblica", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "active" }),
      site: site({
        publicationStatus: "suspended",
        approvedAt: APPROVED,
        moderationSuspendedAt: HOLD,
        billingStatus: "past_due",
      }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBeNull();
    expect(decision.rule).toBe("blocked_by_moderation_hold");
  });

  it("una nuova sottoscrizione non aggira un hold su un sito gia' approvato", () => {
    const decision = decideLifecycle({
      event: event({ billingStatus: "active" }),
      site: site({
        publicationStatus: "draft",
        approvedAt: APPROVED,
        moderationSuspendedAt: HOLD,
        billingStatus: "canceled",
      }),
      facts: facts(),
    });
    expect(decision.nextStatus).toBeNull();
    expect(decision.rule).toBe("blocked_by_moderation_hold");
  });

  it("un pagamento valido non manda in revisione un sito con config incompleta", () => {
    const decision = decideLifecycle({
      event: event(),
      site: site({ publicationStatus: "draft" }),
      facts: facts({ contentPublishable: false }),
    });
    expect(decision.nextStatus).toBeNull();
    expect(decision.rule).toBe("blocked_not_publishable");
  });

  it("il webhook non approva mai: pending_review non diventa published per billing", () => {
    for (const status of billingStatusSchema.options) {
      for (const kind of ["subscription_state", "subscription_deleted"] as const) {
        const decision = decideLifecycle({
          event: event({ billingStatus: status, kind }),
          site: site({ publicationStatus: "pending_review" }),
          facts: facts(),
        });
        expect(decision.nextStatus, `${kind}/${status}`).not.toBe("published");
      }
    }
  });

  it("un sito oltre quota non viene pubblicato nemmeno con billing valido", () => {
    for (const from of ["draft", "suspended"] as const) {
      const decision = decideLifecycle({
        event: event(),
        site: site({ publicationStatus: from, approvedAt: APPROVED }),
        facts: facts({ overQuota: true }),
      });
      expect(decision.nextStatus, `da ${from}`).toBeNull();
      expect(decision.rule).toBe("downgrade_over_quota");
    }
  });
});

describe("`trialing` vale come `active` (L0.7 §12 E2)", () => {
  it("usa validBillingForPublication di lib/contract senza riscriverla", () => {
    const trial = decideLifecycle({
      event: event({ billingStatus: "trialing" }),
      site: site({ publicationStatus: "draft" }),
      facts: facts(),
    });
    const active = decideLifecycle({
      event: event({ billingStatus: "active" }),
      site: site({ publicationStatus: "draft" }),
      facts: facts(),
    });
    expect(trial).toEqual(active);
    expect(trial.nextStatus).toBe("pending_review");
  });

  it("non esiste nessuna durata di trial nel codice", () => {
    const source = String(decideLifecycle);
    expect(source).not.toMatch(/trial_period_days|trialDays|trialEnds/u);
  });
});

describe("retention a 90 giorni", () => {
  it("purge_after = subscription_ended_at + 90 giorni", () => {
    const ended = new Date("2026-08-15T12:00:00.000Z");
    const purge = retentionPurgeDate(ended);
    expect(purge.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    // Test parametrico: se l'implementazione ignorasse la costante, il numero
    // di giorni calcolato qui sotto non tornerebbe.
    expect((purge.getTime() - ended.getTime()) / 86_400_000).toBe(RETENTION_DAYS);
    expect(RETENTION_DAYS).toBe(90);
  });
});

describe("nessuna combinazione produce una transizione illegale", () => {
  it("copre tutte le 1152 combinazioni di ingresso", () => {
    const statuses = publicationStatusSchema.options as readonly PublicationStatus[];
    const billing = billingStatusSchema.options as readonly BillingStatus[];
    let combinations = 0;

    for (const publicationStatus of statuses) {
      for (const billingStatus of billing) {
        for (const kind of ["subscription_state", "subscription_deleted"] as const) {
          for (const approvedAt of [null, APPROVED]) {
            for (const moderationSuspendedAt of [null, HOLD]) {
              for (const overQuota of [false, true]) {
                for (const contentPublishable of [false, true]) {
                  combinations += 1;
                  const current = site({
                    publicationStatus,
                    approvedAt,
                    moderationSuspendedAt,
                    billingStatus: "not_started",
                  });
                  const decision = decideLifecycle({
                    event: event({ billingStatus, kind }),
                    site: current,
                    facts: { overQuota, contentPublishable },
                  });
                  const to = decision.nextStatus;
                  const label = `${publicationStatus}/${billingStatus}/${kind}/approved=${approvedAt !== null}/hold=${moderationSuspendedAt !== null}/quota=${overQuota}/pub=${contentPublishable}`;

                  if (decision.retention === "start") {
                    expect(
                      kind === "subscription_deleted" || billingStatus === "canceled",
                      `retention avviata senza disdetta (${label})`,
                    ).toBe(true);
                  }

                  if (to === null) continue;

                  expect(
                    WEBHOOK_TRANSITIONS.has(`${publicationStatus}>${to}`),
                    `transizione fuori whitelist: ${publicationStatus} -> ${to} (${label})`,
                  ).toBe(true);

                  if (moderationSuspendedAt !== null) {
                    expect(["published", "pending_review"], label).not.toContain(to);
                  }
                  if (!contentPublishable) {
                    expect(["published", "pending_review"], label).not.toContain(to);
                  }
                  if (overQuota) {
                    expect(to, label).not.toBe("published");
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(combinations).toBe(1152);
  });
});
