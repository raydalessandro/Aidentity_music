/**
 * Copia negli appunti con ricaduta.
 *
 * `navigator.clipboard` non esiste fuori da un contesto sicuro, può negare il
 * permesso e — questo è il caso che ci è costato un test rosso — può
 * **restare appesa**: in Chromium la promessa di `writeText` non si risolve se
 * il documento non ha il focus. Una promessa che non torna è peggio di un
 * errore, perché non c'è niente da intercettare: chi aspetta l'esito aspetta
 * per sempre e l'utente non riceve nessun annuncio.
 *
 * Perciò l'attesa è limitata nel tempo e la funzione torna sempre un booleano,
 * senza mai lanciare: chi chiama deve poter annunciare l'esito in entrambi i
 * casi, non gestire un'eccezione né restare in ascolto di niente.
 */

type ClipboardLike = { writeText: (text: string) => Promise<void> };

/**
 * Oltre questa attesa si passa alla ricaduta. Un secondo e mezzo è più di
 * quanto serva a una API locale e meno di quanto un pollice consideri “rotto”.
 */
const ATTESA_MS = 1500;

function readClipboard(): ClipboardLike | null {
  const scope: { navigator?: { clipboard?: Partial<ClipboardLike> } } = globalThis;
  const clipboard = scope.navigator?.clipboard;
  return typeof clipboard?.writeText === "function" ? (clipboard as ClipboardLike) : null;
}

async function copyWithClipboardApi(text: string, attesaMs: number): Promise<boolean> {
  const clipboard = readClipboard();
  if (clipboard === null) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // `then(ok, ko)` e non `catch`: dopo la scadenza la promessa non deve
    // restare senza gestore, altrimenti diventa un unhandled rejection.
    const scrittura = clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    const scadenza = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), attesaMs);
    });
    return await Promise.race([scrittura, scadenza]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Ricaduta storica: un campo temporaneo selezionato e copiato.
 * Non lancia mai — nemmeno se `appendChild` fallisce — perché è l'ultima
 * risorsa: se esplode qui, l'utente deve comunque ricevere una risposta.
 */
function copyWithSelection(text: string): boolean {
  const scope: { document?: Document } = globalThis;
  const page = scope.document;
  if (page === undefined || typeof page.execCommand !== "function") return false;

  let field: HTMLTextAreaElement | undefined;
  try {
    field = page.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.width = "1px";
    field.style.height = "1px";
    field.style.padding = "0";
    field.style.border = "none";
    page.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return page.execCommand("copy");
  } catch {
    return false;
  } finally {
    field?.remove();
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
 *
 * Unico ingresso usato dai componenti: la stringa copiata e la stringa vista
 * sono lo stesso oggetto, non due che possono divergere. **Non lancia mai**,
 * nemmeno se leggere l'elemento fallisce: chi chiama deve poter annunciare
 * l'esito sempre, e un'eccezione qui diventerebbe silenzio là.
 */
export async function copyRenderedText(source: RenderedText): Promise<boolean> {
  try {
    return await copyText(source?.textContent ?? "");
  } catch {
    return false;
  }
}

/**
 * Copia `text`. Torna `true` solo se la copia è andata davvero a buon fine,
 * `false` in ogni altro caso — permesso negato, API assente, attesa scaduta,
 * ricaduta fallita. Non lancia e non resta appesa.
 */
export async function copyText(text: string, attesaMs: number = ATTESA_MS): Promise<boolean> {
  if (text === "") return false;
  if (await copyWithClipboardApi(text, attesaMs)) return true;
  return copyWithSelection(text);
}
