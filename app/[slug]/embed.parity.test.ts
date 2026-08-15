import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMBED_HOSTS, embedSrc, isAllowedEmbed } from "./embed";
import type { EmbedProvider } from "./site-reader";

const migrationsDir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function migrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");
}

/**
 * Estrae gli host ammessi da `private.valid_embed_url`.
 * Il punto letterale è normalizzato perché nel sorgente SQL compare come `\\.`:
 * la duplicazione del backslash è segnalata a parte come sospetto difetto della migrazione,
 * qui interessa soltanto l'insieme degli host.
 */
function hostsFromMigration(): Record<string, readonly string[]> {
  const sql = migrationSql();

  // `create or replace`: una seconda definizione vincerebbe sul database mentre
  // l'estrattore leggerebbe ancora la prima, e la parità passerebbe a vuoto.
  expect(
    sql.match(/create or replace function private\.valid_embed_url/g) ?? [],
    "valid_embed_url deve avere una sola definizione nelle migrazioni",
  ).toHaveLength(1);

  const body = /create or replace function private\.valid_embed_url[\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(sql);
  expect(body?.[1], "funzione private.valid_embed_url non trovata").toBeTruthy();

  const hosts: Record<string, readonly string[]> = {};
  const clause = /when '(\w+)' then value ~ '\^https:\/\/([^']*?)\/'/g;
  let match = clause.exec(body?.[1] ?? "");
  while (match !== null) {
    const [, provider = "", pattern = ""] = match;
    hosts[provider] = pattern
      .replace(/^\(|\)$/g, "")
      .split("|")
      .map((host) => host.replace(/\\+\./g, "."))
      .filter((host) => host !== "");
    match = clause.exec(body?.[1] ?? "");
  }
  return hosts;
}

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
  ] as const)("accetta %s con %s", (provider: EmbedProvider, url: string) => {
    expect(isAllowedEmbed(provider, url)).toBe(true);
  });

  // Casi che DEVONO essere rifiutati: l'esito atteso è `false`, mai un iframe.
  it.each([
    { why: "host che prefissa quello lecito", provider: "spotify", url: "https://open.spotify.com.evil.test/track/1" },
    { why: "host arbitrario", provider: "spotify", url: "https://evil.test/open.spotify.com/track/1" },
    { why: "schema non HTTPS", provider: "youtube", url: "http://www.youtube.com/watch?v=abc" },
    { why: "host del player non memorizzabile", provider: "soundcloud", url: "https://w.soundcloud.com/player/?url=x" },
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
});
