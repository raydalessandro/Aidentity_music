import type Stripe from "stripe";
import { z } from "zod";

import type { BillingInterval, BillingStatus, LifecycleEvent, PlanCode } from "./lifecycle";

/**
 * Traduzione pura da evento Stripe a evento normalizzato. Nessuna I/O: il
 * risolutore price id -> piano viene iniettato, cosi' i test girano senza
 * variabili d'ambiente e senza rete.
 *
 * Solo gli eventi `customer.subscription.*` guidano la macchina degli stati:
 * portano lo stato autorevole della subscription. Gli eventi di fattura sono
 * ignorati di proposito, perche' Stripe emette comunque un
 * `customer.subscription.updated` a ogni cambio di stato: reagire a entrambi
 * significherebbe applicare due volte la stessa verita'.
 */

export type PriceResolver = (priceId: string) => { code: PlanCode; interval: BillingInterval } | null;

export type NormalizedEvent = {
  eventId: string;
  siteId: string;
  subscriptionId: string | null;
  priceId: string | null;
  customerId: string | null;
  event: LifecycleEvent;
};

export type NormalizationResult =
  | { outcome: "handled"; value: NormalizedEvent }
  | { outcome: "ignored"; reason: string }
  | { outcome: "error"; reason: string };

const HANDLED_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/** `not_started` e' un sentinel locale: Stripe non lo emette mai. */
const stripeBillingStatusSchema = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

// z.uuid() pretende versione e variante RFC 9562: gli identificativi
// deterministici delle fixture non le rispettano. Qui serve la forma, non la
// versione.
const siteIdSchema = z.guid();

function customerIdOf(customer: Stripe.Subscription["customer"]): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

export function normalizeStripeEvent(
  raw: Stripe.Event,
  resolvePrice: PriceResolver,
): NormalizationResult {
  if (!HANDLED_TYPES.has(raw.type)) {
    return { outcome: "ignored", reason: `tipo evento non gestito: ${raw.type}` };
  }

  const subscription = raw.data.object as Stripe.Subscription;

  const siteId = siteIdSchema.safeParse(subscription.metadata?.site_id);
  if (!siteId.success) {
    return { outcome: "error", reason: "metadata.site_id mancante o non valido sulla subscription" };
  }

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  if (!priceId) {
    return { outcome: "error", reason: "subscription senza price id" };
  }

  const price = resolvePrice(priceId);
  if (!price) {
    return { outcome: "error", reason: `price id sconosciuto al catalogo: ${priceId}` };
  }

  const deleted = raw.type === "customer.subscription.deleted";
  let billingStatus: BillingStatus;
  if (deleted) {
    billingStatus = "canceled";
  } else {
    const status = stripeBillingStatusSchema.safeParse(subscription.status);
    if (!status.success) {
      return { outcome: "error", reason: `stato subscription non riconosciuto: ${subscription.status}` };
    }
    billingStatus = status.data;
  }

  const event: LifecycleEvent = {
    kind: deleted ? "subscription_deleted" : "subscription_state",
    billingStatus,
    planCode: price.code,
    interval: price.interval,
  };

  return {
    outcome: "handled",
    value: {
      eventId: raw.id,
      siteId: siteId.data,
      subscriptionId: subscription.id ?? null,
      priceId,
      customerId: customerIdOf(subscription.customer),
      event,
    },
  };
}
