import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { billingStatusSchema, planCodeSchema, publicationStatusSchema } from "@/lib/contract";

import {
  billingIntervalSchema,
  type LifecycleDecision,
  type PlanCode,
  type SiteLifecycleState,
  type LifecycleFacts,
} from "./lifecycle";
import type { NormalizedEvent } from "./normalize";

/**
 * Ponte fra la decisione pura e il database. L'unico scrittore di
 * `sites.publication_status` e' questo percorso, e passa da `service_role`
 * verso due sole funzioni pubbliche a grant minimo.
 *
 * Il database non si fida della decisione: `public.apply_billing_event`
 * rivalida la coppia (da, a), rifiuta la pubblicazione sotto hold di
 * moderazione e garantisce l'idempotenza. Qui si valida ai bordi con Zod
 * quello che torna da PostgREST.
 */

const billingContextRowSchema = z.object({
  publication_status: publicationStatusSchema,
  approved_at: z.string().nullable(),
  moderation_suspended_at: z.string().nullable(),
  subscription_ended_at: z.string().nullable(),
  plan_code: planCodeSchema,
  billing_interval: billingIntervalSchema,
  billing_status: billingStatusSchema,
  over_quota: z.boolean(),
  content_publishable: z.boolean(),
});

const applyOutcomeSchema = z.enum(["applied", "duplicate"]);
export type ApplyOutcome = z.infer<typeof applyOutcomeSchema>;

export type BillingContext = { site: SiteLifecycleState; facts: LifecycleFacts };

export async function readBillingContext(
  supabase: SupabaseClient,
  siteId: string,
  candidatePlan: PlanCode,
): Promise<BillingContext | null> {
  const { data, error } = await supabase.rpc("billing_context", {
    target: siteId,
    candidate: candidatePlan,
  });
  if (error) {
    throw new Error(`billing_context ha fallito: ${error.message}`);
  }

  const rows = z.array(billingContextRowSchema).parse(data);
  const row = rows[0];
  if (!row) return null;

  return {
    site: {
      publicationStatus: row.publication_status,
      approvedAt: row.approved_at,
      moderationSuspendedAt: row.moderation_suspended_at,
      subscriptionEndedAt: row.subscription_ended_at,
      planCode: row.plan_code,
      interval: row.billing_interval,
      billingStatus: row.billing_status,
    },
    facts: { overQuota: row.over_quota, contentPublishable: row.content_publishable },
  };
}

export async function applyBillingEvent(
  supabase: SupabaseClient,
  normalized: NormalizedEvent,
  current: SiteLifecycleState,
  decision: LifecycleDecision,
): Promise<ApplyOutcome> {
  const { data, error } = await supabase.rpc("apply_billing_event", {
    p_event_id: normalized.eventId,
    p_site_id: normalized.siteId,
    p_billing_status: normalized.event.billingStatus,
    p_plan_code: normalized.event.planCode,
    p_interval: normalized.event.interval,
    p_subscription_id: normalized.subscriptionId,
    p_price_id: normalized.priceId,
    // `null` significa "nessun cambiamento": al database si passa lo stato
    // corrente, cosi' la whitelist di transizioni resta l'unica autorita'.
    p_next_status: decision.nextStatus ?? current.publicationStatus,
    p_retention: decision.retention,
    p_rule: decision.rule,
  });
  if (error) {
    throw new Error(`apply_billing_event ha fallito: ${error.message}`);
  }
  return applyOutcomeSchema.parse(data);
}

/** Collega il customer Stripe al profilo. Scrittura server-only per contratto. */
export async function linkStripeCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId);
  if (error) {
    throw new Error(`Collegamento del customer Stripe fallito: ${error.message}`);
  }
}
