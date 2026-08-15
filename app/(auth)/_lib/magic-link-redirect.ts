// Percorso relativo e non l'alias `@/`: vitest non risolve l'alias, e questa
// funzione ha un banco di prova proprio.
import { readSiteUrl } from "../../../lib/supabase/public-env";

import { safeRedirectPath } from "./safe-redirect";

/**
 * Destinazione del magic link.
 *
 * Il valore arriva da un campo nascosto, quindi da fuori: viene ripulito qui
 * anche se la pagina lo ha gia' ripulito. Il motivo non e' diffidenza verso la
 * pagina — e' che questo indirizzo finisce **dentro un'email**, e un link
 * avvelenato spedito da noi vale piu' di uno costruito da un attaccante,
 * perche' arriva firmato dal nostro dominio.
 *
 * `safeRedirectPath` riporta a `/` qualunque cosa non sia un percorso interno,
 * quindi il caso peggiore e' un ritorno alla home, mai un dominio di terzi.
 * La rimozione del parametro quando la destinazione e' la radice tiene l'URL
 * identico a prima per il caso normale.
 */
export function magicLinkRedirect(next: FormDataEntryValue | null): string {
  const callback = new URL("/auth/callback", readSiteUrl());
  const destinazione = typeof next === "string" ? safeRedirectPath(next) : "/";
  if (destinazione !== "/") callback.searchParams.set("next", destinazione);
  return callback.toString();
}
