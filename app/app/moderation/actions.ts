"use server";

// Le due azioni di moderazione. Sono endpoint POST a tutti gli effetti: raggiungibili
// senza passare dalla pagina, quindi si difendono da sole.
//
// Due cancelli indipendenti, entrambi chiusi in caso di dubbio:
//
//   1. `currentAdmin()` — la riga di `public.platform_admins` letta con la sessione di chi
//      chiama, sotto RLS. Nessuna riga, nessuna area: 404, come per la pagina.
//   2. `moderate_site` stessa, che rialza `42501` se `private.is_platform_admin()` è falsa.
//      Tradotto in `forbidden` e da lì di nuovo in 404.
//
// Il secondo cancello è quello che conta davvero — vive nel database e nessun errore di
// questo file può spegnerlo. Il primo esiste perché un non amministratore non deve nemmeno
// vedere la differenza fra «area che rifiuta» e «area che non esiste».
//
// Il verbo non arriva mai dal form: `approveSite` e `suspendSite` sono due export distinti
// e ciascuno inchioda la propria azione. Dal form arrivano solo il sito e la motivazione.

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { parseModerationCommand, type CommandRejection } from "../../../lib/moderation/command";
import {
  moderationOutcome,
  outcomeToken,
  type ModerationRejection,
} from "../../../lib/moderation/outcome";
import { MODERATION_PATH, moderationUrl } from "../../../lib/moderation/route";
import type { ModerationAction } from "../../../lib/moderation/types";

import { moderationGateway } from "./composition";

export async function approveSite(formData: FormData): Promise<void> {
  await moderate("approve", formData);
}

export async function suspendSite(formData: FormData): Promise<void> {
  await moderate("suspend", formData);
}

/** Il bordo rifiuta prima della RPC; il rifiuto conserva il proprio nome. */
const REJECTION_OF: Record<CommandRejection, ModerationRejection> = {
  "reason-required": "reason-required",
  "target-invalid": "malformed-request",
  "action-invalid": "malformed-request",
};

async function moderate(action: ModerationAction, formData: FormData): Promise<void> {
  const parsed = parseModerationCommand({
    action,
    target: formData.get("target"),
    reason: formData.get("reason"),
  });

  // Una sospensione senza motivazione non raggiunge il database. Il database la
  // rifiuterebbe comunque (`reason required`, `check_violation`), ma inoltrargliela per poi
  // tradurre il rifiuto significherebbe che qualcuno, un giorno, può essere tentato di
  // riempire il campo per far passare la chiamata. Qui non c'è niente da riempire.
  if (!parsed.ok) {
    redirect(moderationUrl(outcomeToken({ kind: "rejected", rejection: REJECTION_OF[parsed.rejection] })));
  }

  const gateway = await moderationGateway();
  if ((await gateway.currentAdmin()) === null) notFound();

  const outcome = moderationOutcome(parsed.command.action, await gateway.moderate(parsed.command));
  if (outcome.kind === "forbidden") notFound();

  // Si rivalida solo ciò che è cambiato davvero. Un rifiuto non ha toccato nessuna riga:
  // invalidare la cache anche lì non romperebbe niente, ma direbbe il falso su cosa è
  // successo, e `actions.test.ts` misura la differenza.
  if (outcome.kind === "applied") revalidatePath(MODERATION_PATH);
  redirect(moderationUrl(outcomeToken(outcome)));
}
