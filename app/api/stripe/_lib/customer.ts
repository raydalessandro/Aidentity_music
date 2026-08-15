import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { z } from "zod";

import { linkStripeCustomer } from "./apply";

const profileRowSchema = z.object({ stripe_customer_id: z.string().nullable() });

/**
 * Restituisce il customer Stripe del profilo, creandolo una volta sola.
 * La lettura passa dal client con RLS (l'utente legge il proprio profilo);
 * la scrittura di `stripe_customer_id` e' server-only per contratto (§6.5),
 * quindi usa il client `service_role`.
 */
export async function ensureStripeCustomer(params: {
  stripe: Stripe;
  scoped: SupabaseClient;
  privileged: SupabaseClient;
  userId: string;
  email: string | undefined;
}): Promise<string> {
  const { stripe, scoped, privileged, userId, email } = params;

  const { data, error } = await scoped
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  if (error) {
    throw new Error(`Profilo non leggibile: ${error.message}`);
  }

  const existing = profileRowSchema.parse(data).stripe_customer_id;
  if (existing) return existing;

  const customer = await stripe.customers.create(
    { email, metadata: { user_id: userId } },
    // Un secondo tentativo dello stesso utente non crea un secondo customer.
    { idempotencyKey: `aidentity-customer-${userId}` },
  );

  await linkStripeCustomer(privileged, userId, customer.id);
  return customer.id;
}
