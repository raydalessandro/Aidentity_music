/**
 * Selezione e ordinamento del contenuto EPK.
 *
 * Qui vivono gli invarianti di L0.7 §2 e §5. Sono funzioni pure e separate dai
 * componenti apposta: un invariante che si può rompere solo montando un albero
 * React è un invariante che nessuno riesce a testare davvero.
 *
 * I tipi dichiarano insiemi chiusi, ma i tipi non sono un confine di runtime: i
 * dati attraversano la rete come JSON e arrivano da un database che il
 * componente non controlla. Perciò ogni insieme chiuso è ricontrollato qui.
 */

import { filled, httpsUrl, readEventInstant, type EventInstant } from "./format";
import {
  contactRoles,
  linkProviders,
  type EpkContact,
  type EpkLink,
  type EpkLiveDate,
  type EpkMetric,
  type EpkPressQuote,
} from "./types";

/** Stessa forma del CHECK su `site_contacts.email`. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const roleRank = new Map(contactRoles.map((role, index) => [role, index] as const));
const providerRank = new Map(linkProviders.map((provider, index) => [provider, index] as const));

/**
 * Contatti pubblicabili.
 *
 * **Invariante del consenso (L0.7 §2, §5): si rende solo chi ha
 * `consent_confirmed_at` valorizzato.** Nessuna eccezione, nessun fallback.
 *
 * Ordine: `sort_order` scelto dall'artista, poi l'ordine canonico dei ruoli
 * (booking, management, stampa), poi il nome.
 */
export function publishableContacts(contacts: readonly EpkContact[]): EpkContact[] {
  return contacts
    .filter((contact) => filled(contact.consent_confirmed_at))
    .filter(
      (contact) =>
        roleRank.has(contact.role) &&
        filled(contact.name) &&
        filled(contact.email) &&
        EMAIL.test(contact.email.trim()),
    )
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        (roleRank.get(left.role) ?? 0) - (roleRank.get(right.role) ?? 0) ||
        left.name.localeCompare(right.name, "it"),
    );
}

/**
 * Link pubblicabili: provider dentro l'insieme chiuso di L0.7 §5 e URL `https://`.
 * Ordine: `sort_order`, poi l'ordine canonico dei provider.
 */
export function publishableLinks(links: readonly EpkLink[]): EpkLink[] {
  return links
    .filter((link) => providerRank.has(link.provider) && httpsUrl(link.url) !== null)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        (providerRank.get(left.provider) ?? 0) - (providerRank.get(right.provider) ?? 0),
    );
}

/**
 * Quote stampa pubblicabili: quote e testata non vuote.
 * Un URL non `https` non elimina la quote, elimina il link: la citazione resta
 * contenuto valido anche senza fonte navigabile (si veda `PressQuotes`).
 * Ordine: `sort_order`, poi la data più recente per prima.
 */
export function publishablePress(press: readonly EpkPressQuote[]): EpkPressQuote[] {
  return press
    .filter((entry) => filled(entry.quote) && filled(entry.publication))
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        (right.published_on ?? "").localeCompare(left.published_on ?? ""),
    );
}

/** Numeri pubblicabili: etichetta e valore entrambi non vuoti. Ordine: `sort_order`. */
export function publishableMetrics(metrics: readonly EpkMetric[]): EpkMetric[] {
  return metrics
    .filter((metric) => filled(metric.label) && filled(metric.value))
    .sort((left, right) => left.sort_order - right.sort_order);
}

/**
 * Data live già risolta: la riga più le etichette leggibili.
 * Risolvere qui evita che il componente ripeta il controllo sulla data e crei
 * un secondo punto in cui l'invariante può divergere.
 */
export type ResolvedLiveDate = { date: EpkLiveDate; when: EventInstant };

export type SplitLiveDates = {
  /** Future: crescenti, la più vicina per prima. */
  upcoming: ResolvedLiveDate[];
  /** Passate: decrescenti, la più recente per prima. */
  past: ResolvedLiveDate[];
};

/**
 * Divide le date live rispetto a `now`.
 *
 * Scelta di prodotto, non dettaglio: **le date future sono ordinate in modo
 * crescente** perché chi legge cerca la prossima occasione, **le passate in modo
 * decrescente** perché servono come prova di attività recente. Una data
 * esattamente uguale a `now` conta come futura: il concerto sta iniziando, non
 * è finito. Una riga senza offset, con data inesistente o con città/venue vuote
 * non finisce in nessuna delle due liste.
 */
export function splitLiveDates(dates: readonly EpkLiveDate[], now: Date): SplitLiveDates {
  const reference = now.getTime();
  const valid = dates
    .filter((date) => filled(date.city) && filled(date.venue))
    .flatMap<ResolvedLiveDate>((date) => {
      const when = readEventInstant(date.starts_at);
      return when === null ? [] : [{ date, when }];
    });

  const upcoming = valid
    .filter((entry) => entry.when.epochMs >= reference)
    .sort(
      (left, right) =>
        left.when.epochMs - right.when.epochMs || left.date.sort_order - right.date.sort_order,
    );

  const past = valid
    .filter((entry) => entry.when.epochMs < reference)
    .sort(
      (left, right) =>
        right.when.epochMs - left.when.epochMs || left.date.sort_order - right.date.sort_order,
    );

  return { upcoming, past };
}
