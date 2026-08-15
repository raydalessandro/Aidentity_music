"use client";

import { useActionState } from "react";

import { initialMagicLinkState, requestMagicLink, type MagicLinkState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(
    requestMagicLink,
    initialMagicLinkState,
  );

  return (
    <form action={formAction} noValidate>
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
