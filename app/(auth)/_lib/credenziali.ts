// Le decisioni dell'accesso, separate da chi parla con Supabase.
//
// Perche' un modulo a parte invece della logica dentro l'azione: un file
// `"use server"` non e' importabile da vitest — `lib/supabase/server.ts` apre con
// `import "server-only"`, che non risolve fuori da Next. Se la validazione vivesse
// nell'azione, nessun test potrebbe eseguirla, ed e' esattamente la condizione in
// cui l'accesso e' arrivato in produzione rotto.

/**
 * Lo stato del form vive QUI e non nel file dell'azione.
 *
 * Non e' una preferenza di organizzazione: un file `"use server"` puo' esportare
 * **soltanto funzioni asincrone**. Esportare da li' una costante — com'era
 * `initialMagicLinkState` — fa fallire il modulo a runtime con
 * «A "use server" file can only export async functions, found object», e ogni
 * POST su `/login` rispondeva 500. La build passava, i test unitari passavano, e
 * il difetto viveva solo in produzione. Vedi `use-server-exports.test.ts`, che
 * ora lo impedisce a tutti i file, non solo a questo.
 */
export type StatoAccesso = {
  readonly status: "idle" | "ok" | "error";
  readonly message: string;
};

export const STATO_INIZIALE: StatoAccesso = { status: "idle", message: "" };

/** Sotto questa soglia non si accetta. Supabase ne accetta 6: sei pochi. */
export const LUNGHEZZA_MINIMA_PASSWORD = 10;

export type Credenziali = { readonly email: string; readonly password: string };

export type EsitoCredenziali =
  | { readonly ok: true; readonly credenziali: Credenziali }
  | { readonly ok: false; readonly message: string };

/**
 * Un indirizzo email accettabile. Non si tenta di essere piu' precisi della
 * realta': l'unica prova che un indirizzo esiste e' scriverci.
 */
function emailPlausibile(value: string): boolean {
  if (value.length > 254 || /\s/u.test(value)) return false;
  const parti = value.split("@");
  if (parti.length !== 2) return false;
  const [locale, dominio] = parti as [string, string];
  if (locale.length === 0 || dominio.length < 3) return false;
  if (!dominio.includes(".") || dominio.startsWith(".") || dominio.endsWith(".")) return false;
  return !dominio.includes("..");
}

function leggiCampo(formData: FormData, nome: string): string | null {
  const grezzo = formData.get(nome);
  // Un campo ripetuto arriva come piu' valori: `get` ne prende uno, e quale
  // dipenderebbe dall'ordine. Un file caricato al posto di un testo non e' una
  // credenziale. In entrambi i casi si rifiuta invece di indovinare.
  if (typeof grezzo !== "string") return null;
  return grezzo;
}

/**
 * Per l'ACCESSO: la password si accetta com'e'. Applicare qui la lunghezza minima
 * escluderebbe dal proprio account chi si e' registrato quando la soglia era piu'
 * bassa, e trasformerebbe il form in un oracolo — un messaggio diverso a seconda
 * di come e' fatta la password di chi possiede quell'indirizzo.
 */
export function credenzialiPerAccesso(formData: FormData): EsitoCredenziali {
  const email = leggiCampo(formData, "email");
  const password = leggiCampo(formData, "password");

  if (email === null || !emailPlausibile(email.trim())) {
    return { ok: false, message: "Inserisci un indirizzo email valido." };
  }
  if (password === null || password.length === 0) {
    return { ok: false, message: "Inserisci la password." };
  }
  return { ok: true, credenziali: { email: email.trim(), password } };
}

/** Solo l'indirizzo: serve all'accesso senza password, che una password non la chiede. */
export function soloEmail(formData: FormData): { ok: true; email: string } | { ok: false; message: string } {
  const email = leggiCampo(formData, "email");
  if (email === null || !emailPlausibile(email.trim())) {
    return { ok: false, message: "Inserisci un indirizzo email valido." };
  }
  return { ok: true, email: email.trim() };
}

/** Per la REGISTRAZIONE: qui la soglia si applica, perche' la password nasce ora. */
export function credenzialiPerRegistrazione(formData: FormData): EsitoCredenziali {
  const email = leggiCampo(formData, "email");
  const password = leggiCampo(formData, "password");

  if (email === null || !emailPlausibile(email.trim())) {
    return { ok: false, message: "Inserisci un indirizzo email valido." };
  }
  if (password === null || password.length < LUNGHEZZA_MINIMA_PASSWORD) {
    return {
      ok: false,
      message: `La password deve avere almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri.`,
    };
  }
  return { ok: true, credenziali: { email: email.trim(), password } };
}

/**
 * Il messaggio mostrato quando l'accesso fallisce.
 *
 * Uno solo, sempre lo stesso: indirizzo sconosciuto e password sbagliata devono
 * essere indistinguibili, altrimenti il form dice a chiunque chi e' iscritto.
 */
export const MESSAGGIO_CREDENZIALI_ERRATE = "Indirizzo email o password non corretti.";
