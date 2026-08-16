import type { Metadata } from "next";
import Link from "next/link";

import { CredentialForm } from "../_lib/CredentialForm";
import { safeRedirectPath } from "../_lib/safe-redirect";
import styles from "../auth-shell.module.css";
import { registrati } from "./actions";

export const metadata: Metadata = {
  title: "Crea un account — AIDENTITY",
  description: "Crea il tuo spazio AIDENTITY e inizia il primo draft.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const grezzo = (await searchParams).next;
  const next = typeof grezzo === "string" ? safeRedirectPath(grezzo) : undefined;
  const versoAccesso = next === undefined ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <main className={`auth ${styles.page}`}>
      <Link className={styles.home} href="/">AIDENTITY</Link>
      <div className={styles.shell}>
        <section className={styles.story}>
          <p className={styles.eyebrow}>AIDENTITY / PRIMO ACCESSO</p>
          <h1>Crea il tuo spazio.</h1>
          <p>
            Parti da un draft gratuito. Scegli il tono, aggiungi visual, musica ed EPK e guarda
            il sito prendere forma prima di decidere se pubblicarlo.
          </p>
          <div className={styles.proof}>
            <span>✓ DRAFT SALVATO</span><span>✓ NESSUNA CARTA ORA</span><span>✓ PREVIEW PRIVATA</span>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="signup-title">
          <p className={styles.step}>ACCESSO / 01</p>
          <h2 id="signup-title">Crea l&apos;account.</h2>
          <p>Email e password. Dopo entri direttamente nel builder.</p>
          <CredentialForm azione={registrati} etichetta="Crea account" registrazione next={next} />
          <p className={styles.alternative}>Hai già un account? <Link href={versoAccesso}>Accedi</Link>.</p>
          <p className={styles.fine}>Il tuo spazio resta in bozza finché non scegli un piano e avvii la pubblicazione.</p>
        </section>
      </div>
    </main>
  );
}
