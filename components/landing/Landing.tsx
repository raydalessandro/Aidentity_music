import Link from "next/link";

import { LANDING_ENTRY_HREF } from "./entry";
import styles from "./landing.module.css";

const features = [
  { number: "01", title: "SITO", copy: "Una presenza vera, non un link in bio." },
  { number: "02", title: "MUSICA", copy: "Embed e upload nello stesso spazio." },
  { number: "03", title: "EPK", copy: "Bio, press, contatti, date e numeri." },
  { number: "04", title: "ONE-SHEET", copy: "Una pagina A4 pronta da mandare." },
] as const;

const plans = [
  { label: "BASE", price: "€2", note: "12 foto · 3 upload · 150 MiB" },
  { label: "PRO", price: "€10", note: "100 foto · 30 upload · 1 GiB" },
  { label: "MAX", price: "€20", note: "1000 foto · 300 upload · 8 GiB" },
] as const;

/**
 * Landing Control Room.
 *
 * Il funnel resta quello del prodotto reale: la CTA va a `/signup` conservando
 * `next=/app/wizard`. La pagina non duplica il renderer pubblico: il mock hero
 * comunica il prodotto, mentre i quattro `SiteShell` veri restano sotto come
 * showroom e continuano a essere il banco di parità visuale del filone A.
 */
export function Landing() {
  return (
    <section className={styles.landing} data-landing aria-labelledby="landing-titolo">
      <header className={styles.nav}>
        <Link className={styles.brand} href="/" aria-label="AIDENTITY home">
          <span className={styles.brandMark}>A</span>
          <span>AIDENTITY</span>
        </Link>
        <nav className={styles.navLinks} aria-label="Navigazione landing">
          <a href="#come-funziona">Come funziona</a>
          <a href="#template">Template</a>
          <a href="#prezzi">Prezzi</a>
        </nav>
        <div className={styles.navActions}>
          <Link className={styles.loginLink} href="/login?next=/app/wizard">Accedi</Link>
          <Link className={styles.navCta} href={LANDING_ENTRY_HREF}>Crea il tuo sito</Link>
        </div>
      </header>

      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="landing-eyebrow">AIDENTITY / CONTROL ROOM</p>
          <h1 id="landing-titolo">Il tuo sito non deve sembrare un link in bio.</h1>
          <p className="landing-claim">
            Costruisci sito, musica, EPK e one-sheet nello stesso flusso. Parti dal draft,
            guarda il risultato mentre lo costruisci e pubblichi soltanto quando sei pronto.
          </p>
          <div className={styles.heroActions}>
            <Link className="landing-cta" href={LANDING_ENTRY_HREF}>Costruisci gratis</Link>
            <a className={styles.secondaryCta} href="#template">Guarda i template</a>
          </div>
          <p className="landing-nota">Nessuna carta per iniziare · il draft si salva · paghi quando pubblichi.</p>
        </div>

        <div className={styles.heroStage} aria-label="Anteprima del prodotto AIDENTITY">
          <div className={styles.orbitA} aria-hidden="true" />
          <div className={styles.orbitB} aria-hidden="true" />
          <div className={styles.productWindow}>
            <div className={styles.windowBar}><span>AIDENTITY / DEMO</span><span>IT</span></div>
            <div className={styles.windowBody}>
              <p>MILANO · ALT POP</p>
              <strong>MIRA<br />NOIR</strong>
              <span>Pop notturno per stanze troppo luminose.</span>
              <div className={styles.artwork} aria-hidden="true">MN</div>
            </div>
            <div className={styles.windowDock}>
              <span>FEED</span><span>LISTEN</span><b>EPK</b><span>HOME</span>
            </div>
          </div>
          <div className={`${styles.floatCard} ${styles.floatOne}`}>EPK<br /><strong>pronto</strong></div>
          <div className={`${styles.floatCard} ${styles.floatTwo}`}>ONE-SHEET<br /><strong>A4</strong></div>
        </div>
      </div>

      <div className={styles.signalStrip} aria-label="Output AIDENTITY">
        {features.map((item) => <span key={item.number}>{item.number} / {item.title}</span>)}
      </div>

      <section className={styles.section} id="come-funziona">
        <div className={styles.sectionHeading}>
          <p>DAL PRIMO ACCESSO ALLA PAGINA ONLINE</p>
          <h2>Non compili un pannello.<br />Costruisci un&apos;identità.</h2>
        </div>
        <div className={styles.processGrid}>
          <article><em>01</em><h3>Crea l&apos;account</h3><p>Email e password. Se torni, riprendi lo stesso draft.</p></article>
          <article><em>02</em><h3>Scegli una base visiva</h3><p>Parti da un template e regola il tono senza dover conoscere token o CSS.</p></article>
          <article><em>03</em><h3>Metti dentro ciò che conta</h3><p>Nome, visual, musica, bio, link, contatti e date con salvataggio continuo.</p></article>
          <article><em>04</em><h3>Guarda, poi pubblica</h3><p>Preview privata, piano e checkout. Il primo sito passa dalla revisione.</p></article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeadingSplit}>
          <div><p>UNA STRUTTURA SOLIDA, QUATTRO TONI</p><h2>Il template è un punto di partenza.</h2></div>
          <p>I contenuti restano tuoi. Cambiano palette, caratteri, icone e atmosfera, non la solidità del renderer.</p>
        </div>
        <div className={styles.templateStrip} aria-hidden="true">
          <div data-template="acid"><span>01</span><strong>ACID<br />MONO</strong><small>sharp / nocturnal</small></div>
          <div data-template="ivory"><span>02</span><strong>EDITORIAL<br />IVORY</strong><small>warm / precise</small></div>
          <div data-template="live"><span>03</span><strong>STENCIL<br />LIVE</strong><small>raw / kinetic</small></div>
          <div data-template="blue"><span>04</span><strong>DEEP<br />BLUE</strong><small>quiet / premium</small></div>
        </div>
      </section>

      <section className={styles.section} id="prezzi">
        <div className={styles.sectionHeading}>
          <p>PAGHI QUANDO VUOI PUBBLICARE</p>
          <h2>Stesso prodotto.<br />Più spazio quando serve.</h2>
        </div>
        <div className={styles.pricingGrid}>
          {plans.map((plan) => (
            <article key={plan.label} data-featured={plan.label === "PRO"}>
              <span>{plan.label}</span><div><strong>{plan.price}</strong><small>/mese</small></div>
              <p>{plan.note}</p>
            </article>
          ))}
        </div>
        <p className={styles.priceNote}>L&apos;annuale equivale a dodici mensilità. Nessun finto sconto barrato.</p>
      </section>

      <section className={styles.finalCta}>
        <div><p>AIDENTITY / PRIMO DRAFT</p><h2>Parti adesso.<br />Decidi dopo se pubblicarlo.</h2></div>
        <Link className={styles.finalButton} href={LANDING_ENTRY_HREF}>Crea il tuo spazio</Link>
      </section>
    </section>
  );
}

export { LANDING_ENTRY_HREF };
