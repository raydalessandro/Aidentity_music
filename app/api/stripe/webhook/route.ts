import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { applyBillingEvent, readBillingContext } from "../_lib/apply";
import { resolvePriceId } from "../_lib/catalog";
import { decideLifecycle } from "../_lib/lifecycle";
import { normalizeStripeEvent } from "../_lib/normalize";
import { createStripeClient, requireWebhookSigningSecret } from "../_lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unico scrittore di `sites.publication_status`.
 *
 * Nessuna via dal client arriva qui: la richiesta e' accettata solo con una
 * firma Stripe valida, e la scrittura passa da `service_role` verso funzioni
 * con EXECUTE concesso a `service_role` e a nessun altro ruolo.
 *
 * Stripe ritenta: l'idempotenza e' garantita dalla chiave primaria di
 * `public.billing_events`, non da un controllo applicativo.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "firma mancante" }, { status: 400 });
  }

  const payload = await request.text();

  let event;
  try {
    const stripe = createStripeClient();
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      requireWebhookSigningSecret(),
    );
  } catch {
    // Nessun dettaglio nella risposta e nessun segreto nei log.
    return NextResponse.json({ error: "firma non valida" }, { status: 400 });
  }

  const normalized = normalizeStripeEvent(event, resolvePriceId);
  if (normalized.outcome === "ignored") {
    return NextResponse.json({ status: "ignored", reason: normalized.reason }, { status: 200 });
  }
  if (normalized.outcome === "error") {
    console.error("[stripe] evento non normalizzabile", { id: event.id, reason: normalized.reason });
    return NextResponse.json({ status: "error", reason: normalized.reason }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const context = await readBillingContext(
    supabase,
    normalized.value.siteId,
    normalized.value.event.planCode,
  );
  if (!context) {
    console.error("[stripe] sito sconosciuto", { id: event.id });
    return NextResponse.json({ status: "error", reason: "sito sconosciuto" }, { status: 404 });
  }

  const decision = decideLifecycle({
    event: normalized.value.event,
    site: context.site,
    facts: context.facts,
  });

  const outcome = await applyBillingEvent(supabase, normalized.value, context.site, decision);

  console.info("[stripe] evento applicato", {
    id: event.id,
    type: event.type,
    rule: decision.rule,
    from: context.site.publicationStatus,
    to: decision.nextStatus ?? context.site.publicationStatus,
    outcome,
  });

  return NextResponse.json(
    {
      status: outcome,
      rule: decision.rule,
      from: context.site.publicationStatus,
      to: decision.nextStatus ?? context.site.publicationStatus,
    },
    { status: 200 },
  );
}
