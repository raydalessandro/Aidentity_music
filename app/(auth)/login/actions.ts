"use server";

import { z } from "zod";

import { readSiteUrl } from "@/lib/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { magicLinkRedirect } from "../_lib/magic-link-redirect";

export type MagicLinkState = {
  status: "idle" | "sent" | "error";
  message: string;
};

export const initialMagicLinkState: MagicLinkState = { status: "idle", message: "" };

const emailSchema = z.email();

/**
 * Richiesta del magic link.
 *
 * La risposta e' deliberatamente identica per un indirizzo esistente e per uno
 * inesistente: la pagina di accesso non e' un oracolo che dice chi e' iscritto.
 */
export async function requestMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) {
    return { status: "error", message: "Inserisci un indirizzo email valido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: magicLinkRedirect(formData.get("next")) },
  });

  if (error) {
    console.error("[auth] invio magic link fallito", { code: error.code });
  }

  return {
    status: "sent",
    message: "Se l'indirizzo e' valido riceverai un link di accesso. Controlla la posta.",
  };
}
