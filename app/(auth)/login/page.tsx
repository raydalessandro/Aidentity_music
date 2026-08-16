import type { Metadata } from "next";
import Link from "next/link";

import { CredentialForm } from "../_lib/CredentialForm";
import { safeRedirectPath } from "../_lib/safe-redirect";
import styles from "../auth-shell.module.css";
import { accedi } from "./actions";

export const metadata: Metadata = {
  title: "Accedi — AIDENTITY",
  description: "Rientra nel tuo Control Room AIDENTITY.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const grezzo = (await searchParams).next;
  const next = typeof grezzo === "string" ? safeRedirectPath(grezzo) : undefined;
  const versoRegistrazione = next === undefined ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <main className={`auth ${styles.page}`}>
      <Link className={styles.home} href="/">AIDENTITY</Link>
      <div className={styles.shell}>
        <section className={styles.story}>
          <p className={styles.eyebrow}>AIDENTITY / CONTROL ROOM</p>
          <h1>Riprendi da dove eri rimasto.</h1>
          <p>Il draft, i contenuti e le preview restano legati al tuo account. Accedi e continua a costruire.</p>
          <div className={styles.proof}>
            <span>✓ AUTOSAVE</span><span>✓ PREVIEW</span><span>✓ EPK + ONE-SHEET</span>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="login-title">
          <p className={styles.step}>ACCESSO / RETURNING</p>
          <h2 id="login-title">Bentornato.</h2>
          <p>Usa le credenziali con cui hai creato AIDENTITY.</p>
          <CredentialForm azione={accedi} etichetta="Accedi" registrazione={false} next={next} />
          <p className={styles.alternative}>Non hai ancora un account? <Link href={versoRegistrazione}>Creane uno</Link>.</p>
        </section>
      </div>
    </main>
  );
}
