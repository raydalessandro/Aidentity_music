// EPK — superficie non spegnibile (L0.7 §2).
//
// SALDATURA E↔D. Fino a ieri questa route importava `EpkIdentity` da `../surface-content` e
// rendeva soltanto bio e identità: i componenti di `components/epk` non li usava nessuno.
// Ora li rende, con le righe che `loadEpk` restituisce e **senza adattatori**.
//
// L'assenza di adattatori non è un'affermazione di stile, è misurata: assegnando
// `readonly PublicLinkRow[]`, `readonly PublicPressRow[]`, `readonly PublicDateRow[]` e
// `readonly PublicMetricRow[]` rispettivamente a `readonly EpkLink[]`, `readonly EpkPressQuote[]`,
// `readonly EpkLiveDate[]` e `readonly EpkMetric[]`, `tsc --noEmit` non emette alcun errore.
// Le colonne in più delle righe pubbliche (`site_id`) non disturbano: non sono letterali di
// oggetto, quindi il controllo delle proprietà in eccesso non si applica. Il che è esattamente
// il motivo per cui i tipi di E sono stati scritti sulle colonne.
//
// ORDINE — decisione di prodotto presa dal filone E in `EpkSurface` e qui rispettata:
// Contatti → Bio → Ascolta e segui → Stampa → Date live → Numeri.
// I contatti stanno in cima perché chi apre un EPK dal telefono lo apre per trovare l'email.
//
// Non si usa `EpkSurface`: quel componente apre una `<section aria-label="EPK">` propria, e
// dentro `SurfaceShell` — che ha già `<main>` e `<h1>` — sarebbe un secondo landmark con lo
// stesso nome della pagina. Si montano i sei blocchi direttamente, nello stesso ordine.
//
// ── I contatti non passano da `EpkContacts`, e non è una scorciatoia ────────────────────
//
// `EpkContact` (components/epk/types.ts) richiede `consent_confirmed_at: string | null` e
// `publishableContacts` rende solo le righe che ce l'hanno valorizzato. `PublicContactRow` —
// ciò che `loadEpk` consegna — quel campo **non ce l'ha e non può averlo**: L0.7 §6.3 dice che
// il consenso non entra nelle proiezioni pubbliche, `public_contacts` lo usa come filtro di riga
// e `publicContactContract` in `lib/site-reader/rows.ts` è `strict` apposta per rifiutare la
// riga che se lo portasse dietro.
//
// Misurato: `readonly PublicContactRow[]` → `readonly EpkContact[]` è l'unica delle cinque
// assegnazioni che `tsc` rifiuta —
//   «Property 'consent_confirmed_at' is missing in type 'PublicContactRow'».
//
// Le due strade per chiudere anche questo lato passano entrambe fuori dal perimetro di questa
// PR (`components/epk/**`), e la scelta non è tecnica ma contrattuale. Qui non si sceglie: si
// dichiara. L'unica cosa che questa route **non** fa è inventare il campo — scrivere
// `consent_confirmed_at: <qualcosa>` su una riga che non lo porta significherebbe firmare al
// posto della persona il consenso alla pubblicazione della sua email, e trasformare
// l'invariante più importante dell'EPK in una formalità che si supera da sé.
//
// Nel frattempo l'invariante è ripresidiata qui sotto (`fromPublicProjection`), al livello
// della route e non solo dentro la funzione di selezione.

import type { Metadata } from "next";

import {
  EpkBio,
  EpkLinks,
  EpkLiveDates,
  EpkMetrics,
  EpkPress,
} from "../../../components/epk";
import { loadEpk } from "../composition";
import type { PublicContactRow } from "../site-reader";
import { SurfaceShell } from "../surface-content";
import { requireSurface, surfaceMetadata } from "../surface-route";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

/**
 * L0.7 §6.3 ripresidiata al bordo della resa: il consenso è un **filtro di riga**, non un campo.
 *
 * Una riga di contatto che si porta dietro `consent_confirmed_at` (o `consent_confirmed_by`)
 * non viene da `public_contacts`, perché quella vista non espone quelle colonne. Non è quindi
 * «un contatto a cui manca il consenso»: è una riga di provenienza ignota, e su una riga di
 * provenienza ignota non si sa nulla — nemmeno che l'interessato abbia acconsentito.
 *
 * Si scarta. Fallire chiuso costa una sezione in meno; fallire aperto costa la pubblicazione
 * dell'email di qualcuno che non l'ha autorizzata, ed è un danno che non si ritira.
 *
 * Nota: il controllo guarda la forma, non il valore, e quindi rifiuta anche la riga che
 * dichiarasse un consenso confermato. È voluto: se quel campo è arrivato fin qui, ciò che si è
 * rotto sta a monte e non è questa route a poterlo giudicare.
 */
function fromPublicProjection(contact: PublicContactRow): boolean {
  return !("consent_confirmed_at" in contact) && !("consent_confirmed_by" in contact);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return surfaceMetadata(slug, "epk");
}

export default async function EpkSurface({ params }: RouteParams) {
  const { slug } = await params;
  const site = await requireSurface(slug, "epk");
  const records = await loadEpk(site.id);
  const { identity } = site.config;
  const contacts = records.contacts.filter(fromPublicProjection);

  return (
    <SurfaceShell site={site} surface="epk">
      {contacts.length > 0 ? (
        <section aria-labelledby="epk-contatti">
          <h2 id="epk-contatti">Contatti</h2>
          <ul>
            {contacts.map((contact) => (
              <li key={contact.id}>
                {contact.role} — {contact.name} —{" "}
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <EpkBio shortBio={identity.shortBio} longBio={identity.longBio} />
      <EpkLinks links={records.links} />
      <EpkPress press={records.press} />
      <EpkLiveDates dates={records.dates} />
      <EpkMetrics metrics={records.metrics} />
    </SurfaceShell>
  );
}
