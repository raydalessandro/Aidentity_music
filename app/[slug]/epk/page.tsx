// EPK — superficie non spegnibile (L0.7 §2).
//
// SALDATURA E↔D. Fino a ieri questa route importava `EpkIdentity` da `../surface-content` e
// rendeva soltanto bio e identità: i componenti di `components/epk` non li usava nessuno.
// Ora li rende tutti e sei, con le righe che `loadEpk` restituisce e **senza adattatori**.
//
// L'assenza di adattatori non è un'affermazione di stile, è misurata: assegnando
// `readonly PublicContactRow[]`, `readonly PublicLinkRow[]`, `readonly PublicPressRow[]`,
// `readonly PublicDateRow[]` e `readonly PublicMetricRow[]` rispettivamente a
// `readonly EpkContact[]`, `readonly EpkLink[]`, `readonly EpkPressQuote[]`,
// `readonly EpkLiveDate[]` e `readonly EpkMetric[]`, `tsc --noEmit` non emette alcun errore.
// La sonda che lo misura è committata: `components/epk/contact-boundary.probe.ts`.
// Le colonne in più delle righe pubbliche (`site_id`) non disturbano: non sono letterali di
// oggetto, quindi il controllo delle proprietà in eccesso non si applica. Il che è esattamente
// il motivo per cui i tipi di E sono stati scritti sulle colonne.
//
// ORDINE — decisione di prodotto presa dal filone E in `EpkSurface` e qui rispettata:
// Contatti → Bio → Ascolta e segui → Stampa → Date live → Numeri.
// I contatti stanno in cima perché chi apre un EPK dal telefono lo apre per trovare l'email.
// `EpkIdentity` sta subito dopo la bio: porta claim e `Base`, che nessun componente del filone
// E copre e che senza di lui sparirebbero dalla pagina.
//
// Non si usa `EpkSurface`: quel componente apre una `<section aria-label="EPK">` propria, e
// dentro `SurfaceShell` — che ha già `<main>` e `<h1>` — sarebbe un secondo landmark con lo
// stesso nome della pagina. Si montano i blocchi direttamente, nello stesso ordine.
//
// ── Il consenso dei contatti, e come mai la route non deve fingerlo ─────────────────────
//
// `EpkContact` è la forma di **render**: le colonne di `public_contacts`, senza
// `consent_confirmed_at`. `EpkContactRecord` è la forma di **riga di tabella**, che quel campo
// ce l'ha. Non sono intercambiabili, e non per convenzione: `EpkContact` dichiara
// `consent_confirmed_at?: never`, quindi il compilatore rifiuta una riga di tabella passata a
// un componente di render. L'unico ponte è `publishableContacts`, che filtra sul consenso e
// lascia indietro il campo.
//
// Il che vuol dire che qui `records.contacts` — righe di `public_contacts`, dove il consenso è
// già un filtro di riga per L0.7 §6.3 — entra in `EpkContacts` così com'è. Nessuna mappatura, e
// soprattutto nessun `consent_confirmed_at: <qualcosa>` scritto a mano: inventare quel campo
// significherebbe firmare al posto della persona il consenso alla pubblicazione della sua email.

import type { Metadata } from "next";

import {
  EpkBio,
  EpkContacts,
  EpkLinks,
  EpkLiveDates,
  EpkMetrics,
  EpkPress,
} from "../../../components/epk";
import { loadEpk } from "../composition";
import type { PublicContactRow } from "../site-reader";
import { EpkIdentity, SurfaceShell } from "../surface-content";
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
 * Il tipo da solo non basta a fermarla. `EpkContact` vieta il campo a compile time, ma qui i
 * dati arrivano come JSON da PostgREST attraverso una vista, una policy e una grant: se una
 * di quelle derivasse, la riga in più esisterebbe a runtime e nessun tipo la vedrebbe. Questa
 * guardia è il controllo che il tipo non può fare, ed è il motivo per cui resta anche ora che
 * i tipi sono a posto.
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

  return (
    <SurfaceShell site={site} surface="epk">
      <EpkContacts contacts={records.contacts.filter(fromPublicProjection)} />
      <EpkBio shortBio={identity.shortBio} longBio={identity.longBio} />
      <EpkIdentity site={site} />
      <EpkLinks links={records.links} />
      <EpkPress press={records.press} />
      <EpkLiveDates dates={records.dates} />
      <EpkMetrics metrics={records.metrics} />
    </SurfaceShell>
  );
}
