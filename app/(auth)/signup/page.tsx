import type { Metadata } from "next";
import Link from "next/link";

import { CredentialForm } from "../_lib/CredentialForm";
import { safeRedirectPath } from "../_lib/safe-redirect";
import { registrati } from "./actions";

export const metadata: Metadata = {
  title: "Crea un account — AIDENTITY",
  description: "Registrazione al pannello AIDENTITY.",
};

/**
 * `/signup` va aggiunto agli slug riservati di L0.7 §5 insieme a `/login`:
 * finche' non lo e', nessuno puo' rivendicarlo come slug: `classifySlug` rifiuta
 * gia' l'insieme dichiarato, e questa rotta lo precede nel routing di Next. La
 * voce e' comunque registrata nel TODO, perche' una rotta che dipende
 * dall'ordine di risoluzione e non dal contratto e' una difesa per coincidenza.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const grezzo = (await searchParams).next;
  const next = typeof grezzo === "string" ? safeRedirectPath(grezzo) : undefined;
  const versoAccesso = next === undefined ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <main className="auth">
      <p className="auth-eyebrow">AIDENTITY</p>
      <h1 className="auth-titolo">Crea il tuo account</h1>
      <p className="auth-claim">
        Serve solo un indirizzo email e una password. Poi si passa al wizard.
      </p>
      <CredentialForm
        azione={registrati}
        etichetta="Crea account"
        registrazione
        next={next}
      />
      <p className="auth-alternativa">
        Hai già un account? <Link href={versoAccesso}>Accedi</Link>.
      </p>
    </main>
  );
}
