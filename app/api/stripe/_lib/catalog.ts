import type { BillingInterval, PlanCode } from "./lifecycle";

/**
 * Come si porta questo catalogo dentro Stripe, in MODALITA' TEST.
 * La CI non ha e non deve avere segreti Stripe: questi passi si eseguono in
 * locale, una volta, e riempiono le variabili elencate in `.env.example`.
 *
 *   stripe login                              # sceglie l'account di test
 *
 *   # un prodotto per piano
 *   stripe products create --name "AIDENTITY BASE"
 *   stripe products create --name "AIDENTITY PRO"
 *   stripe products create --name "AIDENTITY MAX"
 *
 *   # due prezzi ricorrenti per prodotto (importi in centesimi, valuta eur)
 *   stripe prices create --product prod_... --currency eur \
 *     --unit-amount 2400 --recurring.interval year     # -> STRIPE_PRICE_BASE_YEAR
 *   stripe prices create --product prod_... --currency eur \
 *     --unit-amount 200  --recurring.interval month    # -> STRIPE_PRICE_BASE_MONTH
 *   # ...e cosi' per PRO (12000 / 1000) e MAX (24000 / 2000).
 *
 *   # webhook verso l'app in sviluppo: stampa il signing secret da mettere in
 *   # STRIPE_WEBHOOK_SECRET
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 *
 *   # ciclo completo con le carte di test
 *   #   4242 4242 4242 4242  pagamento riuscito
 *   #   4000 0000 0000 0341  addebito rifiutato dopo l'aggancio -> past_due
 *   stripe trigger customer.subscription.updated
 *   stripe trigger customer.subscription.deleted
 *
 * L'eventuale promozione a mesi gratuiti si configura su Stripe con
 * `trial_period_days`: nessuna durata di trial vive nel codice (L0.7 §12 E2).
 */

/**
 * Catalogo canonico di L0.7 §3 e §12 E1.
 * L'annuale e' dodici mensilita' senza sconto; le quote sono quelle emendate
 * (150 MiB / 1 GiB / 8 GiB). I valori qui devono coincidere con le righe
 * `public.plans` inserite dalla migrazione PR-0: il test lo verifica.
 */
export type PlanDefinition = {
  code: PlanCode;
  label: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  photoLimit: number;
  uploadTrackLimit: number;
  storageBytes: number;
};

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export const PLANS: readonly PlanDefinition[] = [
  {
    code: "base",
    label: "BASE",
    monthlyPriceCents: 200,
    annualPriceCents: 2400,
    photoLimit: 12,
    uploadTrackLimit: 3,
    storageBytes: 150 * MIB,
  },
  {
    code: "pro",
    label: "PRO",
    monthlyPriceCents: 1000,
    annualPriceCents: 12000,
    photoLimit: 100,
    uploadTrackLimit: 30,
    storageBytes: 1 * GIB,
  },
  {
    code: "max",
    label: "MAX",
    monthlyPriceCents: 2000,
    annualPriceCents: 24000,
    photoLimit: 1000,
    uploadTrackLimit: 300,
    storageBytes: 8 * GIB,
  },
];

export type CatalogEntry = {
  code: PlanCode;
  label: string;
  interval: BillingInterval;
  priceCents: number;
  /** Nome della variabile d'ambiente che porta il price id di test Stripe. */
  priceEnvName: string;
};

const PLAN_ORDER: Record<PlanCode, number> = { base: 0, pro: 1, max: 2 };
/** L0.7 §3: "L'annuale e' presentato per primo". */
const INTERVAL_ORDER: Record<BillingInterval, number> = { year: 0, month: 1 };

export function priceEnvName(code: PlanCode, interval: BillingInterval): string {
  return `STRIPE_PRICE_${code.toUpperCase()}_${interval.toUpperCase()}`;
}

/**
 * Le sei voci acquistabili, ordinate come vanno mostrate: annuale prima di
 * mensile, e a parita' di intervallo BASE, PRO, MAX. La prima voce e' quindi
 * sempre BASE annuale.
 */
export function orderedCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const plan of PLANS) {
    for (const interval of ["month", "year"] as const) {
      entries.push({
        code: plan.code,
        label: plan.label,
        interval,
        priceCents: interval === "year" ? plan.annualPriceCents : plan.monthlyPriceCents,
        priceEnvName: priceEnvName(plan.code, interval),
      });
    }
  }
  return entries.sort(
    (a, b) =>
      INTERVAL_ORDER[a.interval] - INTERVAL_ORDER[b.interval] ||
      PLAN_ORDER[a.code] - PLAN_ORDER[b.code],
  );
}

/**
 * Mappa price id Stripe -> (piano, intervallo), costruita dalle variabili
 * d'ambiente. Un price id sconosciuto non viene indovinato: il webhook
 * fallisce rumorosamente invece di scrivere il piano sbagliato.
 */
export function resolvePriceId(priceId: string): { code: PlanCode; interval: BillingInterval } | null {
  for (const entry of orderedCatalog()) {
    if (process.env[entry.priceEnvName] === priceId) {
      return { code: entry.code, interval: entry.interval };
    }
  }
  return null;
}

export function requirePriceId(code: PlanCode, interval: BillingInterval): string {
  const name = priceEnvName(code, interval);
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Price id Stripe mancante: ${name}.`);
  }
  return value;
}
