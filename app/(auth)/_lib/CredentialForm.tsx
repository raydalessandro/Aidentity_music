"use client";

import { useActionState } from "react";

import { LUNGHEZZA_MINIMA_PASSWORD, STATO_INIZIALE, type StatoAccesso } from "./credenziali";

type Azione = (precedente: StatoAccesso, formData: FormData) => Promise<StatoAccesso>;

/**
 * Un solo form per accesso e registrazione: cambiano l'azione, l'etichetta del
 * pulsante e la soglia sulla password, non la struttura.
 *
 * `next` viaggia in un campo nascosto e non in una variabile di modulo: la
 * pagina e' resa per richiesta, e legarla al modulo la farebbe condividere fra
 * utenti diversi. Il valore e' gia' ripulito dalla pagina e viene ripulito di
 * nuovo dall'azione: non ci si fida di un campo nascosto.
 */
export function CredentialForm({
  azione,
  etichetta,
  registrazione,
  next,
}: {
  readonly azione: Azione;
  readonly etichetta: string;
  readonly registrazione: boolean;
  readonly next?: string;
}) {
  const [stato, formAction, pending] = useActionState<StatoAccesso, FormData>(
    azione,
    STATO_INIZIALE,
  );

  return (
    <form className="auth-form" action={formAction}>
      {next === undefined ? null : <input type="hidden" name="next" value={next} />}

      <label htmlFor="email">Indirizzo email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={registrazione ? "new-password" : "current-password"}
        minLength={registrazione ? LUNGHEZZA_MINIMA_PASSWORD : undefined}
        required
        aria-describedby={registrazione ? "auth-requisito auth-esito" : "auth-esito"}
      />
      {registrazione ? (
        <p id="auth-requisito" className="auth-nota">
          Almeno {LUNGHEZZA_MINIMA_PASSWORD} caratteri.
        </p>
      ) : null}

      <button className="auth-cta" type="submit" disabled={pending}>
        {pending ? "Un momento…" : etichetta}
      </button>

      {/*
        `role="status"` e `aria-live` perche' l'esito compare senza cambio di
        pagina: senza, chi usa uno screen reader non saprebbe che e' successo
        qualcosa. La classe cambia col tipo di esito, ma il testo resta leggibile
        in entrambi i casi — un colore non e' un'informazione.
      */}
      <p
        id="auth-esito"
        className={stato.status === "error" ? "auth-esito auth-esito-errore" : "auth-esito"}
        role="status"
        aria-live="polite"
      >
        {stato.message}
      </p>
    </form>
  );
}
