import type { Metadata } from "next";

import { safeRedirectPath } from "../_lib/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Accedi — AIDENTITY",
  description: "Accesso senza password tramite link inviato per email.",
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

  return (
    <main>
      <h1>Accedi ad AIDENTITY</h1>
      <p>Nessuna password: si entra con un link valido una volta sola.</p>
      <LoginForm next={next} />
    </main>
  );
}
