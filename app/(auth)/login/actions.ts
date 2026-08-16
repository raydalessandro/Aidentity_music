"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeRedirectPath } from "../_lib/safe-redirect";
import {
  MESSAGGIO_CREDENZIALI_ERRATE,
  credenzialiPerAccesso,
  type StatoAccesso,
} from "../_lib/credenziali";

// ATTENZIONE, e' costato un 500 in produzione: da qui si esportano SOLTANTO
// funzioni asincrone. Tipi e costanti stanno in `../_lib/credenziali.ts`, e
// `use-server-exports.test.ts` impedisce che tornino qui.

/**
 * Accesso con email e password.
 *
 * Il messaggio di fallimento e' uno solo, identico per indirizzo sconosciuto e
 * per password sbagliata: un messaggio diverso trasformerebbe il form in un
 * elenco degli iscritti, interrogabile da chiunque un indirizzo alla volta.
 */
export async function accedi(_precedente: StatoAccesso, formData: FormData): Promise<StatoAccesso> {
  const lette = credenzialiPerAccesso(formData);
  if (!lette.ok) return { status: "error", message: lette.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(lette.credenziali);

  if (error) {
    // Il codice nel log, mai nella risposta.
    console.error("[auth] accesso fallito", { code: error.code });
    return { status: "error", message: MESSAGGIO_CREDENZIALI_ERRATE };
  }

  const grezzo = formData.get("next");
  redirect(typeof grezzo === "string" ? safeRedirectPath(grezzo) : "/app/wizard");
}
