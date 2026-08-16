// La coda di moderazione: righe di `public.sites` più il loro abbonamento, giudicate una
// volta sola qui e rese senza ulteriori decisioni dalla pagina.
//
// Le righe arrivano da PostgREST con la sessione dell'amministratore: sono filtrate da RLS
// (`sites_own` … `or private.is_platform_admin()`), non dai tipi di TypeScript. Una
// proiezione rifatta a mano, una colonna rinominata a monte o un enum esteso arrivano qui
// come `unknown`, ed è questa funzione a decidere che una riga che non si capisce **non si
// modera**: meglio una riga assente dalla coda che un pulsante che agisce su uno stato che
// nessuno ha previsto.

import { z } from "zod";

import {
  MODERABLE_STATUSES,
  PUBLISHABLE_BILLING_STATUSES,
  type ModerableStatus,
  type ModerationQueueSource,
  type QueueEntry,
} from "./types";

const guid = z.guid();

const siteSchema = z.object({
  id: guid,
  slug: z.string().trim().min(1),
  publication_status: z.enum(MODERABLE_STATUSES),
  created_at: z.string().trim().min(1).nullish(),
  moderation_reason: z.string().trim().min(1).nullish(),
});

const subscriptionSchema = z.object({
  site_id: guid,
  billing_status: z.string().trim().min(1).nullish(),
});

/** Ordine di lavoro: prima chi aspetta una risposta, poi chi è fermo, infine chi è online. */
const STATUS_PRIORITY: Record<ModerableStatus, number> = {
  pending_review: 0,
  suspended: 1,
  published: 2,
};

export function buildModerationQueue(source: ModerationQueueSource): readonly QueueEntry[] {
  const billing = new Map<string, string | null>();
  for (const raw of source.subscriptions) {
    const row = subscriptionSchema.safeParse(raw);
    if (row.success) billing.set(row.data.site_id, row.data.billing_status ?? null);
  }

  const entries: QueueEntry[] = [];
  for (const raw of source.sites) {
    const row = siteSchema.safeParse(raw);
    if (!row.success) continue;
    const status = billing.get(row.data.id) ?? null;
    entries.push({
      id: row.data.id,
      slug: row.data.slug,
      status: row.data.publication_status,
      requestedAt: row.data.created_at ?? null,
      billing: status,
      subscriptionActive:
        status !== null && (PUBLISHABLE_BILLING_STATUSES as readonly string[]).includes(status),
      suspensionReason: row.data.moderation_reason ?? null,
    });
  }

  return entries.sort(compareEntries);
}

/**
 * Ordinamento totale e deterministico: senza l'ultimo criterio due righe con lo stesso
 * stato e lo stesso istante resterebbero nell'ordine in cui PostgREST le ha consegnate,
 * che non è un ordine promesso da nessuno.
 */
function compareEntries(left: QueueEntry, right: QueueEntry): number {
  const byStatus = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
  if (byStatus !== 0) return byStatus;
  // Sottrarre i due ranghi sarebbe un errore: due righe senza data valgono entrambe
  // `Infinity` e `Infinity - Infinity` è `NaN`, che rende il comparatore incoerente e
  // l'ordine finale dipendente dall'implementazione di `sort`. Si confrontano, non si
  // sottraggono.
  const leftAge = ageRank(left.requestedAt);
  const rightAge = ageRank(right.requestedAt);
  if (leftAge !== rightAge) return leftAge < rightAge ? -1 : 1;
  return left.slug.localeCompare(right.slug);
}

/** Le righe senza data vanno in fondo al proprio gruppo, non in cima per caso. */
function ageRank(value: string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * La data resa in tabella: giorno in UTC, o un trattino.
 *
 * Nessun `Intl.DateTimeFormat` e nessun fuso locale: la pagina è renderizzata dal server e
 * un formato che dipende dal fuso del processo produrrebbe un test che diventa rosso da
 * solo quando la CI gira in un'altra ora. Una stringa che non è una data non diventa
 * «Invalid Date» stampato in pagina: diventa un trattino.
 */
export function formatQueueDate(value: string | null): string {
  if (value === null) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toISOString().slice(0, 10);
}
