import type { Metadata } from "next";
import Link from "next/link";

import { CredentialForm } from "../_lib/CredentialForm";
import { safeRedirectPath } from "../_lib/safe-redirect";
import { accedi } from "./actions";

export const metadata: Metadata = {
  title: "Accedi — AIDENTITY",
  description: "Accesso al pannello AIDENTITY.",
};

/**
 * `/login` e' uno degli slug riservati di L0.7 §5: non puo' collidere con il
 * sito di un cliente.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const grezzo = (await searchParams).next;
  // Un `next` ripetuto (`?next=/a&next=/b`) arriva come array: si scarta invece
  // di sceglierne uno, perche' scegliere sarebbe una regola che l'attaccante
  // conosce quanto noi.
  const next = typeof grezzo === "string" ? safeRedirectPath(grezzo) : undefined;
  const versoRegistrazione = next === undefined ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <main className="auth">
      <p className="auth-eyebrow">AIDENTITY</p>
      <h1 className="auth-titolo">Accedi</h1>
      <CredentialForm azione={accedi} etichetta="Accedi" registrazione={false} next={next} />
      <p className="auth-alternativa">
        Non hai ancora un account? <Link href={versoRegistrazione}>Creane uno</Link>.
      </p>
    </main>
  );
}
