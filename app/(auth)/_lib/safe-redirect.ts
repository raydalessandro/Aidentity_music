/**
 * Il parametro `next` del callback di autenticazione arriva dall'esterno.
 * Se lo si usasse cosi' com'e', un link di accesso potrebbe portare l'utente
 * appena autenticato su un dominio di terzi: open redirect classico.
 *
 * Funzione pura: si accetta soltanto un percorso relativo alla stessa origine.
 */
const FALLBACK = "/";
const ORIGIN = "https://redirect.invalid";
/** Caratteri di controllo: servono a spezzare header o confondere il parser. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

export function safeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return FALLBACK;
  if (!value.startsWith("/")) return FALLBACK;
  // `//host` e `/\host` sono URL protocol-relative: portano fuori sito.
  if (value.startsWith("//") || value.startsWith("/\\")) return FALLBACK;
  if (CONTROL_CHARS.test(value)) return FALLBACK;

  try {
    const resolved = new URL(value, ORIGIN);
    if (resolved.origin !== ORIGIN) return FALLBACK;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return FALLBACK;
  }
}
