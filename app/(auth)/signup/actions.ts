"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeRedirectPath } from "../_lib/safe-redirect";
import { credenzialiPerRegistrazione, type StatoAccesso } from "../_lib/credenziali";

// Da qui si esportano SOLTANTO funzioni asincrone: tipi e costanti stanno in
// `../_lib/credenziali.ts`. Vedi `use-server-exports.test.ts`.

/**
 * Registrazione con email e password.
 *
 * La conferma via email e' disattivata sul progetto: `signUp` restituisce quindi
 * una sessione utilizzabile subito, e chi si registra entra senza passare dalla
 * posta. E' una scelta consapevole di v1 — significa che nessuno verifica di
 * possedere davvero l'indirizzo con cui si registra — ed e' registrata nel TODO.
 *
 * Se la conferma venisse riattivata, `session` sarebbe `null` e la persona
 * resterebbe su questa pagina con il messaggio che le dice di controllare la
 * posta: il ramo esiste apposta, per non trasformare un cambio di impostazione
 * in un reindirizzamento verso una pagina che la rifiuterebbe.
 */
export async function registrati(
  _precedente: StatoAccesso,
  formData: FormData,
): Promise<StatoAccesso> {
  const lette = credenzialiPerRegistrazione(formData);
  if (!lette.ok) return { status: "error", message: lette.message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp(lette.credenziali);

  if (error) {
    console.error("[auth] registrazione fallita", { code: error.code });
    // `user_already_exists` arriva solo perche' la conferma via email e'
    // disattivata: e' il prezzo dichiarato della registrazione classica, e va
    // detto all'utente, altrimenti riprova all'infinito senza capire.
    if (error.code === "user_already_exists") {
      return {
        status: "error",
        message: "Esiste già un account con questo indirizzo. Accedi invece di registrarti.",
      };
    }
    return { status: "error", message: "Registrazione non riuscita. Riprova." };
  }

  if (data.session === null) {
    return {
      status: "ok",
      message: "Account creato. Controlla la posta per confermare l’indirizzo.",
    };
  }

  const grezzo = formData.get("next");
  redirect(typeof grezzo === "string" ? safeRedirectPath(grezzo) : "/app/wizard");
}
