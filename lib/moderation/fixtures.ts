// Fixture della moderazione. Gli identificativi sono quelli veri di `supabase/seed.sql`:
// un banco scritto su UUID inventati proverebbe cose su un prodotto che non esiste, e in
// questo repo la differenza è misurabile — `z.uuid()` rifiuterebbe proprio questi valori,
// che non rispettano versione e variante RFC 9562 (vedi `lib/media/target.ts`).
//
// Ogni collezione qui dentro contiene almeno una riga **che deve essere rifiutata**, e
// ciascuna dice in un commento perché. Una fixture di soli casi validi misura solo che il
// codice sa copiare l'ingresso nell'uscita.

import type {
  ModerationCommand,
  ModerationGateway,
  ModerationQueueSource,
  ModerationSiteRow,
  ModerationSubscriptionRow,
  PlatformAdmin,
  RpcFailure,
} from "./types";

/** Owner C del seed: è anche l'unico `platform_admins`. */
export const ADMIN_ID = "77777777-7777-7777-7777-777777777777";
/** Owner A: proprietario legittimo di un sito, e nessun potere di moderazione. */
export const OWNER_A_ID = "11111111-1111-1111-1111-111111111111";

/** `nvll-click`: pubblicato, abbonamento `trialing`, configurazione completa. */
export const SITE_PUBLISHED = "22222222-2222-2222-2222-222222222222";
/** `owner-b-draft`: draft, `billing_status` di default (`not_started`). */
export const SITE_DRAFT = "55555555-5555-5555-5555-555555555555";
/** `owner-c-review`: `pending_review` **senza** abbonamento attivo. È il caso di Ray. */
export const SITE_PENDING = "88888888-8888-8888-8888-888888888888";

export const sitesFixture: readonly ModerationSiteRow[] = [
  {
    id: SITE_PUBLISHED,
    slug: "nvll-click",
    publication_status: "published",
    created_at: "2026-01-10T09:00:00+00:00",
    moderation_reason: null,
  },
  {
    id: SITE_PENDING,
    slug: "owner-c-review",
    publication_status: "pending_review",
    created_at: "2026-02-01T09:00:00+00:00",
    moderation_reason: null,
  },
  {
    id: "99999999-9999-9999-9999-999999999999",
    slug: "sospeso-vecchio",
    publication_status: "suspended",
    created_at: "2025-12-01T09:00:00+00:00",
    moderation_reason: "immagini non di proprietà",
  },
  // RIFIUTATA — il caso obbligatorio: un `draft` non entra in coda. L'ingresso in
  // moderazione è `public.request_site_review`, che è dell'owner; mostrare qui un pulsante
  // «Approva» significherebbe pubblicare un sito che non ha mai chiesto di esserlo.
  {
    id: SITE_DRAFT,
    slug: "owner-b-draft",
    publication_status: "draft",
    created_at: "2026-01-05T09:00:00+00:00",
    moderation_reason: null,
  },
  // RIFIUTATA: stato che l'enum `publication_status` non contiene. Una riga che non si
  // capisce non si modera.
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    slug: "stato-inventato",
    publication_status: "in_revisione",
    created_at: "2026-01-01T09:00:00+00:00",
    moderation_reason: null,
  },
  // RIFIUTATA: identificativo che non è un UUID. Finirebbe dritto in `moderate_site` come
  // primo argomento.
  {
    id: "non-un-uuid",
    slug: "identificativo-rotto",
    publication_status: "pending_review",
    created_at: "2026-01-02T09:00:00+00:00",
    moderation_reason: null,
  },
  // RIFIUTATA: slug vuoto. Sarebbe una riga con due pulsanti e nessun nome sopra.
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    slug: "   ",
    publication_status: "pending_review",
    created_at: "2026-01-03T09:00:00+00:00",
    moderation_reason: null,
  },
];

export const subscriptionsFixture: readonly ModerationSubscriptionRow[] = [
  { site_id: SITE_PUBLISHED, billing_status: "trialing" },
  { site_id: SITE_PENDING, billing_status: "not_started" },
  { site_id: "99999999-9999-9999-9999-999999999999", billing_status: "past_due" },
  // RIFIUTATA: `site_id` non è un UUID, quindi non può appartenere a nessun sito. Se
  // entrasse nella mappa per chiave grezza, un domani basterebbe una riga così per
  // raccontare un abbonamento attivo accanto al sito sbagliato.
  { site_id: "site-8888", billing_status: "active" },
];

export function queueFixture(): ModerationQueueSource {
  return { sites: sitesFixture, subscriptions: subscriptionsFixture };
}

/**
 * Il doppio della porta. Registra i comandi ricevuti: serve a dimostrare non solo cosa la
 * superficie dice, ma **se ha chiamato il database** — una sospensione senza motivazione
 * non deve arrivarci affatto, e l'unico modo di misurarlo è contare le chiamate.
 */
export class StubModerationGateway implements ModerationGateway {
  readonly commands: ModerationCommand[] = [];

  constructor(
    private readonly options: {
      readonly admin?: PlatformAdmin | null;
      readonly queue?: ModerationQueueSource;
      readonly failure?: (command: ModerationCommand) => RpcFailure | null;
    } = {},
  ) {}

  currentAdmin(): Promise<PlatformAdmin | null> {
    return Promise.resolve(this.options.admin ?? null);
  }

  listQueue(): Promise<ModerationQueueSource> {
    return Promise.resolve(this.options.queue ?? queueFixture());
  }

  moderate(command: ModerationCommand): Promise<RpcFailure | null> {
    this.commands.push(command);
    return Promise.resolve(this.options.failure?.(command) ?? null);
  }
}

/** L'amministratore del seed, nella forma che la porta restituisce. */
export const admin: PlatformAdmin = { userId: ADMIN_ID };

/**
 * Il rifiuto che il database alza davvero quando si approva un sito senza abbonamento
 * `active`/`trialing`: nessuna riga aggiornata, quindi `if not found then raise`.
 * Testo e SQLSTATE sono quelli della migrazione, non un'approssimazione.
 */
export const INVALID_TRANSITION: RpcFailure = {
  code: "23514",
  message: "invalid moderation transition",
};

/** `if not private.is_platform_admin() then raise ... using errcode='insufficient_privilege'`. */
export const NOT_PLATFORM_ADMIN: RpcFailure = {
  code: "42501",
  message: "not platform admin",
};
