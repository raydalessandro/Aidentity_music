import { NextResponse } from "next/server";
import { z } from "zod";

import { readSiteUrl } from "@/lib/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { createStripeClient } from "../_lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileRowSchema = z.object({ stripe_customer_id: z.string().nullable() });

/**
 * Customer portal Stripe: al termine si torna al Control Room, non alla landing.
 * Le modifiche del portale continuano a entrare nel lifecycle soltanto via webhook.
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
    return_url: `${readSiteUrl()}/app/wizard?billing=portal`,
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
