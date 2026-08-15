import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMBED_HOSTS, embedSrc, isAllowedEmbed } from "./embed";
import type { EmbedProvider } from "./site-reader";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/** Migrazioni concatenate in ordine di applicazione: i nomi file sono timestampati. */
function migrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");
}

/**
 * Corpo di `private.valid_embed_url` come lo vede il database.
 *
 * `create or replace` non somma: sostituisce. Quindi la definizione viva è **l'ultima**
 * in ordine di applicazione, e leggere la prima farebbe passare la parità su una fonte
 * morta. Vietare una seconda definizione sarebbe più stretto del necessario: una
 * migrazione correttiva è un evento normale, non un'anomalia.
 *
 * Zero definizioni resta invece un fallimento: un presidio che non trova la propria
 * fonte non deve passare a vuoto.
 */
function lastValidEmbedUrlBody(sql: string): string | null {
  const definitions = [
    ...sql.matchAll(/create or replace function private\.valid_embed_url[\s\S]*?\$\$([\s\S]*?)\$\$;/g),
  ];
  if (definitions.length === 0) return null;
  return definitions[definitions.length - 1]?.[1] ?? null;
}

/**
 * Estrae gli host ammessi da un corpo di funzione.
 * Il punto letterale è normalizzato sia nella forma `\.` sia in `\\.`: la migrazione PR-0
 * usa oggi il backslash doppio, la correzione in arrivo userà quello singolo, e in
 * entrambi i casi qui interessa soltanto l'insieme degli host.
 */
function hostsFromBody(body: string): Record<string, readonly string[]> {
  const hosts: Record<string, readonly string[]> = {};
  const clause = /when '(\w+)' then value ~ '\^https:\/\/([^']*?)\/'/g;
  let match = clause.exec(body);
  while (match !== null) {
    const [, provider = "", pattern = ""] = match;
    hosts[provider] = pattern
      .replace(/^\(|\)$/g, "")
      .split("|")
      .map((host) => host.replace(/\\+\./g, "."))
      .filter((host) => host !== "");
    match = clause.exec(body);
  }
  return hosts;
}

function hostsFromMigration(): Record<string, readonly string[]> {
  const body = lastValidEmbedUrlBody(migrationSql());
  expect(body, "nessuna definizione di private.valid_embed_url trovata nelle migrazioni").not.toBeNull();
  return hostsFromBody(body ?? "");
}

/**
 * La regola "vince l'ultima" è dimostrata su SQL sintetico, così vale anche prima che una
 * seconda migrazione esista davvero, e resta vera dopo.
 */
describe("l'estrattore segue la semantica di `create or replace`", () => {
  const primaDefinizione = [
    "create or replace function private.valid_embed_url(provider public.embed_provider, value text)",
    "returns boolean language sql immutable set search_path = '' as $$",
    "  select case provider",
    "    when 'spotify' then value ~ '^https://open\\\\.spotify\\\\.com/'",
    "    else false end;",
    "$$;",
  ].join("\n");
  const secondaDefinizione = [
    "create or replace function private.valid_embed_url(provider public.embed_provider, value text)",
    "returns boolean language sql immutable set search_path = '' as $$",
    "  select case provider",
    "    when 'spotify' then value ~ '^https://open\\.spotify\\.com/'",
    "    when 'soundcloud' then value ~ '^https://soundcloud\\.com/'",
    "    else false end;",
    "$$;",
  ].join("\n");

  it("legge l'ultima definizione, non la prima", () => {
    const body = lastValidEmbedUrlBody(`${primaDefinizione}\n${secondaDefinizione}`);
    expect(body).not.toBeNull();
    expect(Object.keys(hostsFromBody(body ?? "")).sort()).toEqual(["soundcloud", "spotify"]);
  });

  it("legge l'unica definizione quando ce n'è una sola", () => {
    expect(Object.keys(hostsFromBody(lastValidEmbedUrlBody(primaDefinizione) ?? ""))).toEqual([
      "spotify",
    ]);
  });

  it("normalizza allo stesso host sia il backslash doppio sia quello singolo", () => {
    expect(hostsFromBody(lastValidEmbedUrlBody(primaDefinizione) ?? "").spotify).toEqual([
      "open.spotify.com",
    ]);
    expect(hostsFromBody(lastValidEmbedUrlBody(secondaDefinizione) ?? "").spotify).toEqual([
      "open.spotify.com",
    ]);
  });

  // Caso che DEVE fallire: senza fonte il presidio non passa a vuoto.
  it("non trova nessuna fonte in SQL che non definisce la funzione", () => {
    expect(lastValidEmbedUrlBody("create table public.sites (id uuid);")).toBeNull();
  });
});

describe("parità dell'allowlist embed con il contratto database", () => {
  it("espone gli stessi provider della funzione SQL", () => {
    expect(Object.keys(hostsFromMigration()).sort()).toEqual(Object.keys(EMBED_HOSTS).sort());
  });

  it("espone gli stessi host per ogni provider", () => {
    const fromDatabase = hostsFromMigration();
    for (const [provider, hosts] of Object.entries(EMBED_HOSTS)) {
      expect([...(fromDatabase[provider] ?? [])].sort(), `provider ${provider}`).toEqual(
        [...hosts].sort(),
      );
    }
  });
});

describe("accettazione degli URL embed", () => {
  it.each([
    ["spotify", "https://open.spotify.com/track/1"],
    ["apple_music", "https://music.apple.com/it/album/1"],
    ["youtube", "https://www.youtube.com/watch?v=abc"],
    ["youtube", "https://youtu.be/abc"],
    ["soundcloud", "https://soundcloud.com/artista/brano"],
    // L0.7 §5 ammette per SoundCloud entrambe le forme, non solo quella nuda.
    ["soundcloud", "https://www.soundcloud.com/artista/brano"],
  ] as const)("accetta %s con %s", (provider: EmbedProvider, url: string) => {
    expect(isAllowedEmbed(provider, url)).toBe(true);
  });

  // Casi che DEVONO essere rifiutati: l'esito atteso è `false`, mai un iframe.
  it.each([
    { why: "host che prefissa quello lecito", provider: "spotify", url: "https://open.spotify.com.evil.test/track/1" },
    { why: "host arbitrario", provider: "spotify", url: "https://evil.test/open.spotify.com/track/1" },
    { why: "schema non HTTPS", provider: "youtube", url: "http://www.youtube.com/watch?v=abc" },
    { why: "host del player non memorizzabile", provider: "soundcloud", url: "https://w.soundcloud.com/player/?url=x" },
    // L'host aggiunto è un'alternativa in più, non un prefisso libero.
    { why: "suffisso ostile dopo l'host www", provider: "soundcloud", url: "https://www.soundcloud.com.evil.test/artista/brano" },
    { why: "sottodominio non elencato", provider: "soundcloud", url: "https://m.soundcloud.com/artista/brano" },
    { why: "schema non HTTPS sull'host www", provider: "soundcloud", url: "http://www.soundcloud.com/artista/brano" },
    { why: "provider diverso dall'host", provider: "apple_music", url: "https://open.spotify.com/track/1" },
    { why: "pseudo-schema", provider: "spotify", url: "javascript:alert(1)" },
    { why: "stringa non parsabile", provider: "spotify", url: "non un url" },
  ] as const)("rifiuta $provider con $url ($why)", ({ provider, url }) => {
    expect(isAllowedEmbed(provider, url)).toBe(false);
    expect(embedSrc(provider, url)).toBeNull();
  });
});

describe("sorgente dell'iframe", () => {
  it("porta Spotify sulla forma /embed una volta sola", () => {
    expect(embedSrc("spotify", "https://open.spotify.com/track/1")).toBe(
      "https://open.spotify.com/embed/track/1",
    );
    expect(embedSrc("spotify", "https://open.spotify.com/embed/track/1")).toBe(
      "https://open.spotify.com/embed/track/1",
    );
  });

  it("porta Apple Music sull'host di embed", () => {
    expect(embedSrc("apple_music", "https://music.apple.com/it/album/1")).toBe(
      "https://embed.music.apple.com/it/album/1",
    );
  });

  it("riduce YouTube all'identificativo del video", () => {
    expect(embedSrc("youtube", "https://www.youtube.com/watch?v=abc")).toBe(
      "https://www.youtube.com/embed/abc",
    );
    expect(embedSrc("youtube", "https://youtu.be/abc")).toBe("https://www.youtube.com/embed/abc");
    expect(embedSrc("youtube", "https://music.youtube.com/watch?v=abc")).toBe(
      "https://www.youtube.com/embed/abc",
    );
  });

  it("rifiuta un URL YouTube senza identificativo", () => {
    expect(embedSrc("youtube", "https://www.youtube.com/")).toBeNull();
  });

  it("incapsula SoundCloud nel player della piattaforma", () => {
    expect(embedSrc("soundcloud", "https://soundcloud.com/artista/brano")).toBe(
      "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartista%2Fbrano",
    );
  });

  // L'host `www.` arriva al player così com'è memorizzato: il player SoundCloud
  // risolve entrambe le forme, e riscriverle qui significherebbe inventare un URL
  // che l'utente non ha salvato.
  it("incapsula anche la forma www senza riscrivere l'host", () => {
    expect(embedSrc("soundcloud", "https://www.soundcloud.com/artista/brano")).toBe(
      "https://w.soundcloud.com/player/?url=https%3A%2F%2Fwww.soundcloud.com%2Fartista%2Fbrano",
    );
  });
});
