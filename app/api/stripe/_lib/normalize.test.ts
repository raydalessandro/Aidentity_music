import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { normalizeStripeEvent, type PriceResolver } from "./normalize";

const SITE_ID = "22222222-2222-2222-2222-222222222222";
const PRICE_ID = "price_test_base_annuale";

const resolver: PriceResolver = (id) =>
  id === PRICE_ID ? { code: "base", interval: "year" } : null;

function subscriptionEvent(
  type: string,
  overrides: {
    status?: string;
    metadata?: Record<string, string>;
    priceId?: string | null;
  } = {},
): Stripe.Event {
  const { status = "active", metadata = { site_id: SITE_ID }, priceId = PRICE_ID } = overrides;
  return {
    id: "evt_test_1",
    type,
    data: {
      object: {
        id: "sub_test_1",
        status,
        metadata,
        customer: "cus_test_1",
        items: { data: priceId === null ? [] : [{ price: { id: priceId } }] },
      },
    },
  } as unknown as Stripe.Event;
}

describe("normalizzazione degli eventi Stripe", () => {
  it("traduce customer.subscription.updated in un evento di stato", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { status: "trialing" }),
      resolver,
    );
    expect(result.outcome).toBe("handled");
    if (result.outcome !== "handled") return;
    expect(result.value).toEqual({
      eventId: "evt_test_1",
      siteId: SITE_ID,
      subscriptionId: "sub_test_1",
      priceId: PRICE_ID,
      customerId: "cus_test_1",
      event: {
        kind: "subscription_state",
        billingStatus: "trialing",
        planCode: "base",
        interval: "year",
      },
    });
  });

  it("customer.subscription.deleted e' sempre una disdetta", () => {
    const result = normalizeStripeEvent(
      // Stripe puo' consegnare l'oggetto con lo stato precedente: la fine
      // e' data dal tipo di evento, non dal campo.
      subscriptionEvent("customer.subscription.deleted", { status: "active" }),
      resolver,
    );
    expect(result.outcome).toBe("handled");
    if (result.outcome !== "handled") return;
    expect(result.value.event.kind).toBe("subscription_deleted");
    expect(result.value.event.billingStatus).toBe("canceled");
  });
});

describe("eventi che devono essere rifiutati o ignorati", () => {
  it("un evento di fattura viene ignorato, non applicato due volte", () => {
    const result = normalizeStripeEvent(subscriptionEvent("invoice.payment_failed"), resolver);
    expect(result.outcome).toBe("ignored");
  });

  it("senza metadata.site_id l'evento e' un errore, non un default", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { metadata: {} }),
      resolver,
    );
    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.reason).toMatch(/site_id/u);
  });

  it("un site_id che non e' un uuid viene rifiutato", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { metadata: { site_id: "nvll-click" } }),
      resolver,
    );
    expect(result.outcome).toBe("error");
  });

  it("un price id fuori catalogo non viene indovinato", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { priceId: "price_altrui" }),
      resolver,
    );
    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.reason).toMatch(/price id sconosciuto/u);
  });

  it("una subscription senza price id e' un errore", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { priceId: null }),
      resolver,
    );
    expect(result.outcome).toBe("error");
  });

  it("uno stato subscription non previsto dal contratto e' un errore", () => {
    const result = normalizeStripeEvent(
      subscriptionEvent("customer.subscription.updated", { status: "not_started" }),
      resolver,
    );
    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.reason).toMatch(/stato subscription non riconosciuto/u);
  });
});
