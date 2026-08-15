// Risoluzione dell'URL base del deploy. Un'app, un deploy, molti siti: l'origine è
// una proprietà dell'ambiente, non del tenant. La usano SEO, sitemap e robots.
// Fonte: docs/L0.7-AIDENTITY-contratto-canonico.md §0 e §2 (routing v1 sotto /[slug]).

export type BaseUrlEnv = Readonly<Record<string, string | undefined>>;

/**
 * Ordine di precedenza, dal più esplicito al più derivato:
 * 1. `NEXT_PUBLIC_SITE_URL` — il dominio canonico, l'unico che vale in produzione;
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — il dominio di produzione noto a Vercel;
 * 3. `VERCEL_URL` — il deploy corrente (preview), senza schema;
 * 4. `http://localhost:${PORT}` — sviluppo locale e CI.
 */
export const BASE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

const DEFAULT_PORT = "3000";

export class BaseUrlError extends Error {
  readonly key: string;
  readonly value: string;

  constructor(key: string, value: string) {
    super(`${key} non è un'origine assoluta valida: "${value}"`);
    this.name = "BaseUrlError";
    this.key = key;
    this.value = value;
  }
}

function normalize(key: string, raw: string): string {
  const trimmed = raw.trim();
  // Vercel espone l'host senza schema; un dominio canonico può arrivare con o senza.
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new BaseUrlError(key, raw);
  }

  // Un'origine, non un percorso: qualunque path, query o hash è un errore di configurazione.
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    throw new BaseUrlError(key, raw);
  }
  if (parsed.hostname === "") {
    throw new BaseUrlError(key, raw);
  }

  return parsed.origin;
}

/** Funzione pura: stesso ambiente, stessa origine. Nessuna lettura implicita di `process`. */
export function resolveBaseUrl(env: BaseUrlEnv): string {
  for (const key of BASE_URL_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value.trim() !== "") {
      return normalize(key, value);
    }
  }

  const port = env.PORT?.trim() === "" || env.PORT === undefined ? DEFAULT_PORT : env.PORT.trim();
  return normalize("PORT", `http://localhost:${port}`);
}

/** Compone un URL assoluto a partire da un percorso applicativo già codificato. */
export function absoluteUrl(path: string, env: BaseUrlEnv): string {
  const base = resolveBaseUrl(env);
  if (path === "" || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Punto d'ingresso runtime: l'unico posto che tocca `process.env`. */
export function baseUrl(): string {
  return resolveBaseUrl(process.env as BaseUrlEnv);
}
