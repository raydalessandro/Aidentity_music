/**
 * Copia negli appunti con ricaduta.
 *
 * `navigator.clipboard` non esiste fuori da un contesto sicuro e può negare il
 * permesso; in quei casi si ricade sulla selezione di un campo temporaneo.
 * La funzione torna un booleano invece di lanciare: chi chiama deve poter
 * annunciare l'esito, non gestire un'eccezione.
 */

type ClipboardLike = { writeText: (text: string) => Promise<void> };

function readClipboard(): ClipboardLike | null {
  const scope: { navigator?: { clipboard?: Partial<ClipboardLike> } } = globalThis;
  const clipboard = scope.navigator?.clipboard;
  return typeof clipboard?.writeText === "function" ? (clipboard as ClipboardLike) : null;
}

function copyWithSelection(text: string): boolean {
  const scope: { document?: Document } = globalThis;
  const page = scope.document;
  if (page === undefined || typeof page.execCommand !== "function") return false;

  const field = page.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.opacity = "0";
  page.body.appendChild(field);
  try {
    field.select();
    return page.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Elemento reso da cui si legge il testo da copiare.
 * È un tipo, non una stringa, apposta: così è **impossibile** passare una
 * seconda copia della prop al posto del testo che l'utente sta guardando.
 */
export type RenderedText = { textContent: string | null } | null;

/**
 * Copia il testo così com'è reso nella pagina.
 * Unico ingresso usato dai componenti: la stringa copiata e la stringa vista
 * sono lo stesso oggetto, non due che possono divergere.
 */
export async function copyRenderedText(source: RenderedText): Promise<boolean> {
  return copyText(source?.textContent ?? "");
}

/** Copia `text`. Torna `true` solo se la copia è andata davvero a buon fine. */
export async function copyText(text: string): Promise<boolean> {
  if (text === "") return false;
  const clipboard = readClipboard();
  if (clipboard !== null) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Permesso negato o contesto non sicuro: si prova la via legacy.
    }
  }
  return copyWithSelection(text);
}
