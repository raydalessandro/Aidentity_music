// PORTA DELLA MODERAZIONE — il confine fra la superficie e il database.
//
// Qui non c'è nessuna implementazione: nessun import di `lib/supabase/**`, nessun `fetch`.
// L'adattatore vive in `app/app/moderation/supabase-gateway.ts` ed è l'unico punto del
// filone che conosce un client. Il motivo è un vincolo di prodotto, non un gusto:
// `public.moderate_site` è `security definer` e la sua prima riga è
// `if not private.is_platform_admin() then raise ... 42501`, guardia che legge `auth.uid()`.
// Chiamarla con il client `service_role` la aggirerebbe per intero — `auth.uid()` sarebbe
// nullo, la guardia rifiuterebbe, e "risolvere" quel rifiuto significherebbe togliere la
// guardia. Perciò la porta parla di **comandi ed esiti**, mai di privilegi: chi la
// implementa deve passare dalla sessione dell'utente, e `no-service-role.test.ts` misura
// che nessun file di questo filone importi il client privilegiato.

/** `create type public.moderation_action as enum ('approve','suspend')`. */
export const MODERATION_ACTIONS = ["approve", "suspend"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** `create type public.publication_status as enum ('draft','pending_review','published','suspended')`. */
export const PUBLICATION_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "suspended",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * Gli stati su cui `moderate_site` può avere effetto.
 *
 * `suspend` filtra `publication_status in ('pending_review','published','suspended')`;
 * `approve` non filtra sullo stato ma pretende `private.site_is_publishable(target)` e un
 * abbonamento `active`/`trialing`. Un `draft` resta fuori dalla coda perché l'ingresso in
 * moderazione è `public.request_site_review`, che è dell'owner: la piattaforma non decide
 * al posto suo di mandare in revisione un sito che non l'ha chiesto.
 */
export const MODERABLE_STATUSES = ["pending_review", "published", "suspended"] as const;
export type ModerableStatus = (typeof MODERABLE_STATUSES)[number];

/** Abbonamenti che `moderate_site` accetta per un `approve`. */
export const PUBLISHABLE_BILLING_STATUSES = ["active", "trialing"] as const;

/** Il comando validato, nella forma esatta degli argomenti della RPC. */
export type ModerationCommand = {
  readonly target: string;
  readonly action: ModerationAction;
  /** `null` per `approve`: la motivazione appartiene alla sospensione e non si inventa. */
  readonly reason: string | null;
};

/** Riga di `public.sites` come la consegna PostgREST: nulla è ancora fidato. */
export type ModerationSiteRow = {
  readonly id: unknown;
  readonly slug: unknown;
  readonly publication_status: unknown;
  readonly created_at?: unknown;
  readonly moderation_reason?: unknown;
};

/** Riga di `public.site_subscriptions`, stessa avvertenza. */
export type ModerationSubscriptionRow = {
  readonly site_id: unknown;
  readonly billing_status?: unknown;
  readonly plan_code?: unknown;
};

export type ModerationQueueSource = {
  readonly sites: readonly ModerationSiteRow[];
  readonly subscriptions: readonly ModerationSubscriptionRow[];
};

/** Una riga della coda, già giudicata: ciò che la pagina può rendere senza pensare. */
export type QueueEntry = {
  readonly id: string;
  readonly slug: string;
  readonly status: ModerableStatus;
  readonly requestedAt: string | null;
  /** `billing_status` dell'abbonamento, `null` se la riga manca del tutto. */
  readonly billing: string | null;
  /**
   * Indizio per chi modera, **mai** un cancello: l'autorità su cosa sia approvabile è la
   * RPC. Se questa colonna spegnesse il pulsante, il rifiuto del database diventerebbe
   * invisibile e la superficie smetterebbe di dire la verità sul perché.
   */
  readonly subscriptionActive: boolean;
  readonly suspensionReason: string | null;
};

/** L'errore PostgREST ridotto a ciò che serve a decidere: SQLSTATE e messaggio. */
export type RpcFailure = {
  readonly code: string | null;
  readonly message: string;
};

export type PlatformAdmin = {
  readonly userId: string;
};

/**
 * La porta. Tre domande, nessuna delle quali menziona Supabase.
 *
 * `currentAdmin()` risponde `null` per chiunque non sia amministratore — anonimo, owner
 * qualunque, sessione scaduta, errore di rete: casi diversi, stessa risposta. È il fail
 * closed richiesto, e la pagina lo traduce in 404 senza distinguere.
 */
export type ModerationGateway = {
  readonly currentAdmin: () => Promise<PlatformAdmin | null>;
  readonly listQueue: () => Promise<ModerationQueueSource>;
  readonly moderate: (command: ModerationCommand) => Promise<RpcFailure | null>;
};
