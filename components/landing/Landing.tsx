import Link from "next/link";

import { LANDING_ENTRY_HREF } from "./entry";

/**
 * La porta d'ingresso.
 *
 * Fino a qui `/` era il banco di prova del filone A: quattro artisti finti, l'intestazione
 * `FILONE A / GUSCIO THEMABLE` — il nome interno di un filone di lavoro — e **zero** `href`
 * in tutta la pagina. Il funnel esisteva per intero (accesso, wizard, sito, superfici) e non
 * aveva una porta: `/login` era raggiungibile solo digitandolo.
 *
 * Design essenziale per scelta: qui si stabilisce che la radice promette qualcosa e offre un
 * ingresso. La rifinitura è lavoro a sé, a prodotto online.
 */

export function Landing() {
  return (
    <section className="landing" aria-labelledby="landing-titolo">
      <p className="landing-eyebrow">AIDENTITY</p>
      <h1 id="landing-titolo">Il tuo sito, il tuo EPK, la tua one-sheet.</h1>
      <p className="landing-claim">
        Rispondi a qualche domanda, carica le tue foto e le tue tracce: ottieni un sito che vive
        online e un press kit che puoi mandare a chi programma le date.
      </p>

      <p className="landing-azione">
        <Link className="landing-cta" href={LANDING_ENTRY_HREF}>
          Comincia
        </Link>
      </p>
      <p className="landing-nota">Si entra con un link via email. Nessuna password da ricordare.</p>

      <h2 className="landing-sezione">Come funziona</h2>
      <ol className="landing-passi">
        <li>Accedi e rispondi al wizard: nome, claim, bio, contatti, date.</li>
        <li>Carichi foto e tracce, e scegli quali superfici tenere accese.</li>
        <li>Pubblichi: il sito vive al tuo indirizzo, con EPK e one-sheet stampabile in A4.</li>
      </ol>
    </section>
  );
}

export { LANDING_ENTRY_HREF };
