// EPK — superficie non spegnibile (L0.7 C6).
// Oggi rende soltanto ciò che ha una proiezione pubblica: identità e bio da
// `public_sites.config`. Contatti consentiti, link, quote stampa, date, numeri e kit foto
// restano vuoti finché non esistono le viste elencate nel report (stop b): meglio una
// sezione assente che un contenuto inventato.

import type { Metadata } from "next";

import { loadEpk } from "../composition";
import { EpkIdentity, SurfaceShell } from "../surface-content";
import { requireSurface, surfaceMetadata } from "../surface-route";

type RouteParams = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  return surfaceMetadata(slug, "epk");
}

export default async function EpkSurface({ params }: RouteParams) {
  const { slug } = await params;
  const site = await requireSurface(slug, "epk");
  const records = await loadEpk(site.id);

  return (
    <SurfaceShell site={site} surface="epk">
      <EpkIdentity site={site} />
      {records.contacts.length > 0 ? (
        <section aria-labelledby="epk-contatti">
          <h2 id="epk-contatti">Contatti</h2>
          <ul>
            {records.contacts.map((contact) => (
              <li key={contact.id}>
                {contact.role} — {contact.name} — <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SurfaceShell>
  );
}
