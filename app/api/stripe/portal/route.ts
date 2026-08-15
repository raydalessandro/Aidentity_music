import { NextResponse } from "next/server";
import { z } from "zod";

import { readSiteUrl } from "@/lib/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { createStripeClient } from "../_lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileRowSchema = z.object({ stripe_customer_id: z.string().nullable() });

/**
 * Customer portal Stripe: l'owner cambia piano, aggiorna il metodo di
 * pagamento o disdice. Nessuna di quelle azioni cambia lo stato di
 * pubblicazione qui: il portale produce eventi, e sono gli eventi a passare
 * dal webhook.
 */
export async function POST(): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "autenticazione richiesta" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (error) {
    return NextResponse.json({ error: "profilo non leggibile" }, { status: 500 });
  }

  const customerId = profileRowSchema.parse(data).stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "nessun abbonamento da gestire" }, { status: 404 });
  }

  const session = await createStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${readSiteUrl()}/`,
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
