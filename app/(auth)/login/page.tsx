import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Accedi — AIDENTITY",
  description: "Accesso senza password tramite link inviato per email.",
};

/**
 * `/login` e' uno degli slug riservati di L0.7 §5: non puo' collidere con il
 * sito di un cliente.
 */
export default function LoginPage() {
  return (
    <main>
      <h1>Accedi ad AIDENTITY</h1>
      <p>Nessuna password: si entra con un link valido una volta sola.</p>
      <LoginForm />
    </main>
  );
}
