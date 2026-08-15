import { z } from "zod";

import {
  billingStatusSchema,
  planCodeSchema,
  publicationStatusSchema,
  validBillingForPublication,
} from "../../../../lib/contract";

/**
 * Macchina degli stati di L0.7 §4, righe di cui il webhook Stripe e' autore.
 *
 * E' una funzione PURA: nessuna I/O, nessun orologio, nessun accesso a Stripe
 * o a Postgres. Prende evento normalizzato + stato corrente del sito + fatti
 * che solo il database conosce (hold di moderazione, esito quote, completezza
 * della config) e restituisce lo stato successivo oppure "nessun cambiamento".
 *
 * Le righe autorate dal platform admin (approvazione iniziale, moderazione)
 * non stanno qui: vivono in `public.moderate_site` di PR-0. Questa macchina
 * non deve poterle produrre, e i test lo verificano.
 */

export type BillingStatus = z.infer<typeof billingStatusSchema>;
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;
export type PlanCode = z.infer<typeof planCodeSchema>;
export const billingIntervalSchema = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** L0.7 §4: `purge_after = subscription_ended_at + 90 giorni`. */
export const RETENTION_DAYS = 90;

export function retentionPurgeDate(endedAt: Date): Date {
  return new Date(endedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export type LifecycleEvent = {
  /** `subscription_deleted` e' la fine effettiva; ogni altro evento porta uno stato. */
  kind: "subscription_state" | "subscription_deleted";
  billingStatus: BillingStatus;
  planCode: PlanCode;
  interval: BillingInterval;
};

export type SiteLifecycleState = {
  publicationStatus: PublicationStatus;
  /** Non nullo se il sito ha gia' superato almeno una revisione. */
  approvedAt: string | null;
  /** Hold di moderazione persistente: non e' billing e non si aggira. */
  moderationSuspendedAt: string | null;
  subscriptionEndedAt: string | null;
  planCode: PlanCode;
  interval: BillingInterval;
  billingStatus: BillingStatus;
};

export type LifecycleFacts = {
  /** Uso EFFETTIVO oltre i limiti del piano portato dall'evento. */
  overQuota: boolean;
  /** Config completa e hero disponibile. Non include billing ne' quote. */
  contentPublishable: boolean;
};

export type RetentionAction = "start" | "clear" | "none";

export const LIFECYCLE_RULES = [
  "first_valid_payment",
  "valid_payment_after_approval",
  "payment_lost_before_first_approval",
  "payment_recovered_before_first_approval",
  "cancellation",
  "payment_failed",
  "payment_recovered",
  "downgrade_over_quota",
  "plan_change",
  "blocked_by_moderation_hold",
  "blocked_not_publishable",
  "no_change",
] as const;

export type LifecycleRule = (typeof LIFECYCLE_RULES)[number];

export type LifecycleDecision = {
  /** `null` significa: lo stato di pubblicazione non cambia. */
  nextStatus: PublicationStatus | null;
  retention: RetentionAction;
  rule: LifecycleRule;
};

export type LifecycleInput = {
  event: LifecycleEvent;
  site: SiteLifecycleState;
  facts: LifecycleFacts;
};

/**
 * Stati da cui un pagamento valido e' un RECUPERO e non un primo pagamento.
 * `not_started`, `incomplete` e `incomplete_expired` sono il primo tentativo:
 * un `active` che li segue e' "primo pagamento valido" di L0.7 §4.
 */
const RECOVERABLE_FAILURES: readonly BillingStatus[] = ["past_due", "unpaid", "paused", "canceled"];

function planChanged(event: LifecycleEvent, site: SiteLifecycleState): boolean {
  return event.planCode !== site.planCode || event.interval !== site.interval;
}

function unchanged(event: LifecycleEvent, site: SiteLifecycleState, retention: RetentionAction): LifecycleDecision {
  return {
    nextStatus: null,
    retention,
    rule: planChanged(event, site) ? "plan_change" : "no_change",
  };
}

export function decideLifecycle({ event, site, facts }: LifecycleInput): LifecycleDecision {
  const status = site.publicationStatus;
  const everApproved = site.approvedAt !== null;
  const underModerationHold = site.moderationSuspendedAt !== null;
  const cancelled = event.kind === "subscription_deleted" || event.billingStatus === "canceled";
  const billingValid = validBillingForPublication(event.billingStatus);

  // --- Disdetta / scadenza -------------------------------------------------
  // L0.7 §4: da pending_review, published o suspended si torna a draft e parte
  // la retention. Un draft mai stato attivo non avvia nessuna retention.
  if (cancelled) {
    if (status === "pending_review" || status === "published" || status === "suspended") {
      return { nextStatus: "draft", retention: "start", rule: "cancellation" };
    }
    if (status === "draft" && everApproved) {
      // Gia' in draft (per esempio dopo un downgrade oltre quota) ma il sito
      // e' stato pubblicato in passato: la retention parte comunque.
      return { nextStatus: null, retention: "start", rule: "cancellation" };
    }
    return { nextStatus: null, retention: "none", rule: "no_change" };
  }

  // --- Pagamento valido (active oppure trialing, §12 E2) -------------------
  if (billingValid) {
    // Downgrade o cambio piano che porta l'uso effettivo oltre la quota:
    // blocca la pubblicazione, non cancella niente (§3 regola 6).
    if (facts.overQuota) {
      return {
        nextStatus: status === "published" ? "draft" : null,
        retention: "clear",
        rule: "downgrade_over_quota",
      };
    }

    if (underModerationHold && (status === "draft" || status === "suspended")) {
      return { nextStatus: null, retention: "clear", rule: "blocked_by_moderation_hold" };
    }

    if (status === "draft") {
      if (!facts.contentPublishable) {
        return { nextStatus: null, retention: "clear", rule: "blocked_not_publishable" };
      }
      if (everApproved) {
        return { nextStatus: "published", retention: "clear", rule: "valid_payment_after_approval" };
      }
      return {
        nextStatus: "pending_review",
        retention: "clear",
        rule: RECOVERABLE_FAILURES.includes(site.billingStatus)
          ? "payment_recovered_before_first_approval"
          : "first_valid_payment",
      };
    }

    if (status === "suspended") {
      if (!everApproved) {
        // Un suspended mai approvato puo' esistere solo per moderazione, gia'
        // intercettata sopra: il billing da solo non lo pubblica.
        return unchanged(event, site, "clear");
      }
      if (!facts.contentPublishable) {
        return { nextStatus: null, retention: "clear", rule: "blocked_not_publishable" };
      }
      return { nextStatus: "published", retention: "clear", rule: "payment_recovered" };
    }

    // pending_review: aspetta il platform admin. published: resta pubblicato.
    return unchanged(event, site, "clear");
  }

  // --- Pagamento non valido ma non disdetto --------------------------------
  if (status === "published") {
    return { nextStatus: "suspended", retention: "none", rule: "payment_failed" };
  }
  if (status === "pending_review") {
    return { nextStatus: "draft", retention: "none", rule: "payment_lost_before_first_approval" };
  }
  return unchanged(event, site, "none");
}
