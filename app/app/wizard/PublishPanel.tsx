"use client";

import { useState } from "react";

import styles from "./wizard.module.css";

type PlanCode = "base" | "pro" | "max";
type BillingInterval = "month" | "year";

type Props = {
  siteId: string;
  slug: string;
  publicationStatus: string;
  billingStatus: string | null;
  currentPlan: string | null;
  currentInterval: string | null;
  readyForCheckout: boolean;
  checkoutOutcome: "ok" | "annullato" | null;
};

const plans = [
  { code: "base" as const, label: "BASE", month: "€2", year: "€24", quota: "12 foto · 3 upload · 150 MiB" },
  { code: "pro" as const, label: "PRO", month: "€10", year: "€120", quota: "100 foto · 30 upload · 1 GiB" },
  { code: "max" as const, label: "MAX", month: "€20", year: "€240", quota: "1000 foto · 300 upload · 8 GiB" },
] as const;

function isBillingActive(status: string | null): boolean {
  return status === "active" || status === "trialing";
}

export default function PublishPanel(props: Props) {
  const [plan, setPlan] = useState<PlanCode>("base");
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billingActive = isBillingActive(props.billingStatus);

  async function openCheckout() {
    if (!props.readyForCheckout || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: props.siteId, planCode: plan, interval }),
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Checkout non disponibile.");
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError("Checkout non raggiungibile. Riprova.");
    } finally {
      setPending(false);
    }
  }

  async function openPortal() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? "Portale billing non disponibile.");
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError("Portale billing non raggiungibile. Riprova.");
    } finally {
      setPending(false);
    }
  }

  const publicUrl = `/${props.slug}`;

  return (
    <section className={styles.publishPanel} aria-labelledby="publish-title">
      <div className={styles.publishHeading}>
        <div>
          <p className={styles.eyebrow}>AIDENTITY / PUBBLICAZIONE</p>
          <h2 id="publish-title">Porta il draft online.</h2>
          <p className={styles.muted}>Il piano cambia le quote, non le funzioni del sito.</p>
        </div>
        <div className={styles.stateBadge} data-state={props.publicationStatus}>{props.publicationStatus.replace("_", " ")}</div>
      </div>

      {props.checkoutOutcome === "ok" && (
        <div className={`${styles.notice} ${styles.ok}`} role="status">
          Pagamento completato. Stripe sta aggiornando lo stato tramite webhook: se è il primo pagamento valido, il sito passa in revisione.
        </div>
      )}
      {props.checkoutOutcome === "annullato" && (
        <div className={styles.notice} role="status">Checkout annullato. Il draft è rimasto intatto.</div>
      )}

      {props.publicationStatus === "published" ? (
        <div className={styles.publishStateCard}>
          <div><strong>ONLINE</strong><p>Il sito è pubblico. Le modifiche future restano nello stesso spazio.</p></div>
          <div className={styles.actions}>
            <a className={`${styles.button} ${styles.primary}`} href={publicUrl} target="_blank" rel="noreferrer">Apri sito ↗</a>
            <button className={styles.button} type="button" disabled={pending} onClick={() => void openPortal()}>Gestisci piano</button>
          </div>
        </div>
      ) : props.publicationStatus === "pending_review" ? (
        <div className={styles.publishStateCard}>
          <div><strong>IN REVISIONE</strong><p>Pagamento valido ricevuto. La prima pubblicazione aspetta l&apos;approvazione amministrativa.</p></div>
          {billingActive && <button className={styles.button} type="button" disabled={pending} onClick={() => void openPortal()}>Gestisci piano</button>}
        </div>
      ) : props.checkoutOutcome === "ok" ? (
        <div className={styles.publishStateCard}>
          <div><strong>PAGAMENTO RICEVUTO</strong><p>Non apriamo un secondo checkout mentre aspettiamo il webhook. Ricarica lo stato fra qualche secondo: il database resta la fonte canonica.</p></div>
          {/*
            Qui il ricaricamento pieno e' voluto, non una svista. Lo stato che
            questo riquadro mostra lo scrive il webhook Stripe, fuori da questa
            sessione: serve rileggerlo dal server, e un `<Link>` verso la rotta
            in cui gia' ci si trova non garantisce di farlo. `router.refresh()`
            lo garantirebbe, ma richiede il contesto del router, che il banco
            di questo componente non ha — e indebolire il banco per compiacere
            una regola di lint sarebbe il verso sbagliato.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- vedi sopra: ricaricamento voluto */}
          <a className={styles.button} href="/app/wizard">Aggiorna stato</a>
        </div>
      ) : billingActive ? (
        <div className={styles.publishStateCard}>
          <div>
            <strong>PIANO ATTIVO · {props.currentPlan?.toUpperCase() ?? "—"} · {props.currentInterval === "year" ? "ANNUALE" : props.currentInterval === "month" ? "MENSILE" : "—"}</strong>
            <p>{props.readyForCheckout ? "Il contenuto è pronto: attendi l'aggiornamento del webhook o ricarica la pagina." : "Completa configurazione e hero: il billing è attivo ma il contenuto non è ancora pubblicabile."}</p>
          </div>
          <button className={styles.button} type="button" disabled={pending} onClick={() => void openPortal()}>Gestisci piano</button>
        </div>
      ) : (
        <>
          <div className={styles.publishChecklist}>
            <span data-ok={props.readyForCheckout}>01 · CONFIG COMPLETA</span>
            <span data-ok={props.readyForCheckout}>02 · HERO PRESENTE</span>
            <span>03 · SCEGLI PIANO</span>
            <span>04 · CHECKOUT</span>
          </div>

          <div className={styles.intervalSwitch} role="group" aria-label="Cadenza di pagamento">
            <button type="button" data-active={interval === "year"} onClick={() => setInterval("year")}>Annuale</button>
            <button type="button" data-active={interval === "month"} onClick={() => setInterval("month")}>Mensile</button>
          </div>

          <div className={styles.planGrid}>
            {plans.map((item) => (
              <button key={item.code} type="button" className={styles.planCard} data-active={plan === item.code} onClick={() => setPlan(item.code)}>
                <span>{item.label}</span>
                <div><strong>{interval === "year" ? item.year : item.month}</strong><small>/{interval === "year" ? "anno" : "mese"}</small></div>
                <p>{item.quota}</p>
              </button>
            ))}
          </div>

          {!props.readyForCheckout && (
            <p className={styles.publishBlocker}>Prima del checkout servono una configurazione completa e una hero valida. Il backend applica la stessa regola.</p>
          )}
          {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
          <button className={`${styles.button} ${styles.primary} ${styles.checkoutButton}`} type="button" disabled={!props.readyForCheckout || pending} onClick={() => void openCheckout()}>
            {pending ? "Apertura checkout…" : `Continua con ${plan.toUpperCase()} ${interval === "year" ? "annuale" : "mensile"} ↗`}
          </button>
          <p className={styles.publishFine}>Il primo pagamento valido porta un draft pubblicabile in <code>pending_review</code>. L&apos;approvazione resta una decisione amministrativa separata.</p>
        </>
      )}

      {error && (props.publicationStatus === "published" || props.publicationStatus === "pending_review" || billingActive) && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>
      )}
    </section>
  );
}
