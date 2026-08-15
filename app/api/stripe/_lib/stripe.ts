import "server-only";

import Stripe from "stripe";
import { z } from "zod";

/**
 * Stripe vive esclusivamente sul server e soltanto in MODALITA' TEST.
 *
 * La chiave segreta e' obbligata a essere una chiave di test: il prefisso di
 * test e' l'unico ammesso, quindi una chiave di produzione non parte nemmeno.
 * E' un controllo positivo (deve iniziare con `sk_test_`), non una blocklist:
 * non c'e' nessuna stringa di chiave viva scritta in questo repository.
 */
const testSecretKeySchema = z
  .string()
  .trim()
  .regex(/^sk_test_[A-Za-z0-9]+$/u, "La chiave Stripe deve essere una chiave di test.");

let cached: Stripe | null = null;

export function createStripeClient(): Stripe {
  if (cached) return cached;

  const parsed = testSecretKeySchema.safeParse(process.env.STRIPE_SECRET_KEY);
  if (!parsed.success) {
    throw new Error(
      "STRIPE_SECRET_KEY mancante o non in modalita' test: v1 accetta esclusivamente chiavi di test.",
    );
  }

  cached = new Stripe(parsed.data, { typescript: true });
  return cached;
}

export function requireWebhookSigningSecret(): string {
  const parsed = z.string().trim().min(1).safeParse(process.env.STRIPE_WEBHOOK_SECRET);
  if (!parsed.success) {
    throw new Error("STRIPE_WEBHOOK_SECRET mancante: il webhook non accetta richieste non firmate.");
  }
  return parsed.data;
}
