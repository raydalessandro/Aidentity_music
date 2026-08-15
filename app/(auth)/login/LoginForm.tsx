"use client";

import { useActionState } from "react";

import { initialMagicLinkState, requestMagicLink, type MagicLinkState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(
    requestMagicLink,
    initialMagicLinkState,
  );

  return (
    <form action={formAction} noValidate>
      {/*
        La destinazione viaggia nel form e non in una variabile di modulo: la
        pagina e' resa per richiesta, e legarla al modulo la farebbe condividere
        fra utenti diversi. Il valore e' gia' ripulito dalla pagina e viene
        ripulito di nuovo dall'azione: non ci si fida di un campo nascosto.
      */}
      {next === undefined ? null : <input type="hidden" name="next" value={next} />}
      <label htmlFor="email">Indirizzo email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        aria-describedby="magic-link-esito"
      />
      <button type="submit" disabled={pending}>
        {pending ? "Invio in corso…" : "Invia il link di accesso"}
      </button>
      <p id="magic-link-esito" role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
