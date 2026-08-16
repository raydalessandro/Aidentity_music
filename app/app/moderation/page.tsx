// L'area di moderazione. È il pezzo che mancava: dopo un pagamento valido un sito entra in
// `pending_review` e, finché nessuno chiama `public.moderate_site`, ci resta per sempre —
// quindi `/[slug]` risponde 404 a tutti e il prodotto non pubblica niente.
//
// ── Perché 404 e non 403 ─────────────────────────────────────────────────────────────────
//
// Chi non è amministratore non riceve un rifiuto: riceve `notFound()`, la stessa risposta
// che darebbe un indirizzo inesistente. Un 403 direbbe «esiste un'area riservata qui»,
// cioè racconterebbe a chiunque dove provare. Un 404 non dice niente, e non dire niente è
// la risposta giusta a una domanda che nessuno ha diritto di fare.
//
// Vale anche per chi non ha alcuna sessione: nessun rimando a `/login`. Il wizard rimanda,
// perché l'area dell'owner è pubblicamente nota e quel rimando è un servizio; qui rimandare
// significherebbe confermare l'esistenza dell'area a un anonimo. L'amministratore che si
// trova davanti un 404 fa `/login` da sé e torna: è l'unico attrito accettato, ed è
// deliberato.
//
// ── Chi decide cosa ──────────────────────────────────────────────────────────────────────
//
// Questa pagina non giudica: chiede alla porta, ordina con `buildModerationQueue`, rende.
// L'unica autorità su cosa sia approvabile è `moderate_site`. Per questo il pulsante
// «Approva» compare **sempre**, anche quando la colonna Abbonamento dice che non c'è nulla
// di attivo: se lo spegnessimo, il rifiuto del database non arriverebbe mai sotto gli occhi
// di nessuno e la ragione del rifiuto resterebbe un'ipotesi dell'interfaccia. Quella
// colonna è un indizio, non un cancello.

import { notFound } from "next/navigation";

import { outcomeNotice, parseOutcomeToken } from "../../../lib/moderation/outcome";
import { buildModerationQueue, formatQueueDate } from "../../../lib/moderation/queue";
import { OUTCOME_PARAM } from "../../../lib/moderation/route";
import type { QueueEntry } from "../../../lib/moderation/types";

import { approveSite, suspendSite } from "./actions";
import { moderationGateway } from "./composition";
import styles from "./moderation.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_LABEL: Record<QueueEntry["status"], string> = {
  pending_review: "In attesa di revisione",
  published: "Pubblicato",
  suspended: "Sospeso",
};

export default async function ModerationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const gateway = await moderationGateway();
  const admin = await gateway.currentAdmin();
  if (admin === null) notFound();

  const params = (await searchParams) ?? {};
  const token = parseOutcomeToken(params[OUTCOME_PARAM]);
  const notice = token === null ? null : outcomeNotice(token);
  const queue = buildModerationQueue(await gateway.listQueue());

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Moderazione</h1>

      {notice === null ? null : (
        <p role="status" data-tone={notice.tone} className={styles.notice}>
          {notice.text}
        </p>
      )}

      {queue.length === 0 ? (
        <p className={styles.empty}>Nessun sito da moderare.</p>
      ) : (
        <table className={styles.table}>
          <caption className={styles.caption}>
            Siti in moderazione, dal più vecchio in attesa. L&apos;esito di ogni azione lo
            decide il database: l&apos;approvazione richiede una configurazione completa e un
            abbonamento attivo o in prova.
          </caption>
          <thead>
            <tr>
              <th scope="col">Sito</th>
              <th scope="col">Stato</th>
              <th scope="col">Abbonamento</th>
              <th scope="col">Creato il</th>
              <th scope="col">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((entry) => (
              <tr key={entry.id} data-slug={entry.slug} data-status={entry.status}>
                <th scope="row">{entry.slug}</th>
                <td>
                  {STATUS_LABEL[entry.status]}
                  {entry.suspensionReason === null ? null : (
                    <span className={styles.reason}> — {entry.suspensionReason}</span>
                  )}
                </td>
                <td data-subscription-active={String(entry.subscriptionActive)}>
                  {entry.billing ?? "nessuno"}
                </td>
                <td>{formatQueueDate(entry.requestedAt)}</td>
                <td className={styles.actions}>
                  <form action={approveSite} className={styles.form}>
                    <input type="hidden" name="target" value={entry.id} />
                    <button type="submit" data-action="approve" className={styles.button}>
                      Approva {entry.slug}
                    </button>
                  </form>
                  <form action={suspendSite} className={styles.form}>
                    <input type="hidden" name="target" value={entry.id} />
                    <label htmlFor={`motivo-${entry.id}`} className={styles.label}>
                      Motivazione della sospensione di {entry.slug}
                    </label>
                    <textarea
                      id={`motivo-${entry.id}`}
                      name="reason"
                      rows={2}
                      required
                      className={styles.textarea}
                    />
                    <button type="submit" data-action="suspend" className={styles.button}>
                      Sospendi {entry.slug}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
