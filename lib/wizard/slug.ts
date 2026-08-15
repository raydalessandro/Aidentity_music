/**
 * Slug tecnico per il primo draft di un account vuoto.
 * Non deriva da nome/handle: il contratto non stabilisce una relazione fra i due.
 * È deterministico, quindi due bootstrap concorrenti convergono sulla stessa riga.
 */
export function draftSlugForUser(userId: string): string {
  const compact = userId.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) throw new Error("user id non utilizzabile per lo slug draft");
  return `draft-${compact}`;
}

/** Normalizzazione UX. La allowlist definitiva resta il CHECK del database. */
export function normalizeSlugInput(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}
