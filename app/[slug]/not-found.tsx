import Link from "next/link";

/**
 * Una sola pagina per tutte le cause: slug riservato, slug malformato, sito inesistente,
 * sito in `draft`, `pending_review` o `suspended`, config non pubblicabile, superficie
 * spenta. Il testo non rivela quale delle sette sia.
 */
export default function SiteNotFound() {
  return (
    <main className="not-found">
      <h1>Questo sito non è disponibile</h1>
      <p>L&apos;indirizzo non corrisponde a nessun sito pubblicato su AIDENTITY.</p>
      <p>
        <Link href="/">Torna alla pagina iniziale</Link>
      </p>
    </main>
  );
}
