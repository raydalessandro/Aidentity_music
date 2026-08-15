/**
 * Lettura e formattazione dei valori che arrivano da Postgres.
 *
 * Nessuna dipendenza da `Intl` e nessuna dipendenza dal fuso orario del
 * processo: la data di un concerto è l'ora scritta nel locale, e l'offset che
 * `timestamptz` porta con sé è già quell'informazione. Formattare con il fuso
 * del server sposterebbe l'orario del concerto, e renderebbe i test dipendenti
 * dalla macchina che li esegue.
 */

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"] as const;
const MESI = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
] as const;

/** `timestamptz` serializzato. L'offset (o `Z`) è obbligatorio: senza, l'istante è ambiguo. */
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?(?:\d{2})?)$/;
/** `date` di Postgres. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type EventInstant = {
  /** Istante assoluto: serve solo a ordinare e a separare passato da futuro. */
  epochMs: number;
  /** Etichetta della data nell'ora locale dichiarata, es. `mer 4 nov 2026`. */
  dateLabel: string;
  /** Etichetta dell'ora nell'ora locale dichiarata, es. `21:30`. */
  timeLabel: string;
};

function normalizeOffset(offset: string): string {
  if (offset === "Z") return "Z";
  const sign = offset.slice(0, 1);
  const digits = offset.slice(1).replace(":", "");
  const hours = digits.slice(0, 2);
  const minutes = digits.length >= 4 ? digits.slice(2, 4) : "00";
  return `${sign}${hours}:${minutes}`;
}

function dateLabel(year: string, month: string, day: string): string | null {
  const monthIndex = Number(month) - 1;
  const probe = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
  if (probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== Number(day)) return null;
  const weekday = GIORNI[probe.getUTCDay()];
  const monthName = MESI[monthIndex];
  if (weekday === undefined || monthName === undefined) return null;
  return `${weekday} ${Number(day)} ${monthName} ${year}`;
}

/** Legge un `timestamptz`. Torna `null` se manca l'offset o se la data non esiste. */
export function readEventInstant(value: string): EventInstant | null {
  const match = DATE_TIME.exec(value.trim());
  if (match === null) return null;
  const [, year, month, day, hour, minute, offset] = match;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    offset === undefined
  ) {
    return null;
  }
  const epochMs = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:00${normalizeOffset(offset)}`,
  );
  if (Number.isNaN(epochMs)) return null;
  const label = dateLabel(year, month, day);
  if (label === null) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return { epochMs, dateLabel: label, timeLabel: `${hour}:${minute}` };
}

/** Legge una `date` (la data di uscita di un pezzo di stampa). Torna `null` se non è una data. */
export function readDateLabel(value: string): string | null {
  const match = DATE_ONLY.exec(value.trim());
  if (match === null) return null;
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;
  const label = dateLabel(year, month, day);
  if (label === null) return null;
  return label.slice(label.indexOf(" ") + 1);
}

/**
 * Torna l'URL solo se è `https://`. Qualunque altro schema — `http:`,
 * `javascript:`, `data:` — vale come assenza di URL.
 */
export function httpsUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (candidate === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" ? candidate : null;
}

/**
 * `mailto:` con i caratteri riservati percentuali codificati, `@` lasciata
 * leggibile. Senza codifica una email che contiene `?` o `&` verrebbe letta dal
 * client di posta come inizio degli header.
 */
export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, "@")}`;
}

/** Testo non vuoto una volta tolti gli spazi. Il database lo impone, il componente non si fida. */
export function filled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}
