import { afterEach, describe, expect, it } from "vitest";

import { readPublicSupabaseEnv, readSiteUrl } from "./public-env";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const snapshot = new Map(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const previous = snapshot.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

describe("lettura delle variabili pubbliche", () => {
  it("legge una configurazione valida", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://progetto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(readPublicSupabaseEnv()).toEqual({
      supabaseUrl: "https://progetto.supabase.co",
      supabaseAnonKey: "chiave-anon-di-prova",
    });
  });

  /**
   * Lo stack locale della CLI Supabase serve su `http://127.0.0.1:54321` e non ha un
   * certificato. Senza questi casi, ogni client server della CI resta non costruibile — è
   * il difetto che ha reso rosso il primo run e-2-e della route media.
   */
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("accetta lo stack locale su %s", (url) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(readPublicSupabaseEnv().supabaseUrl).toBe(url);
  });

  it("toglie la barra finale dall'URL del sito", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://aidentity.example///";
    expect(readSiteUrl()).toBe("https://aidentity.example");
  });
});

describe("configurazioni che devono essere rifiutate", () => {
  it("una variabile mancante fa fallire subito, non silenziosamente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(() => readPublicSupabaseEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/u);
  });

  it("una chiave anon vuota non passa per valida", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://progetto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "   ";
    expect(() => readPublicSupabaseEnv()).toThrowError();
  });

  it("un URL Supabase non HTTPS viene rifiutato", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://progetto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(() => readPublicSupabaseEnv()).toThrowError();
  });

  /**
   * L'eccezione loopback non deve diventare «accetta http». Questi sono i modi in cui un
   * host ostile prova a somigliare al loopback: se uno solo passasse, l'eccezione sarebbe
   * un buco e non una deroga.
   */
  it.each([
    "http://127.0.0.1.attaccante.example",
    "http://localhost.attaccante.example",
    "http://attaccante.example/127.0.0.1",
    "http://127.0.0.1@attaccante.example",
    "http://progetto.supabase.co:54321",
  ])("HTTP su %s resta rifiutato", (url) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(() => readPublicSupabaseEnv()).toThrowError();
  });

  it("un protocollo che non è né http né https viene rifiutato", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "ftp://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chiave-anon-di-prova";
    expect(() => readPublicSupabaseEnv()).toThrowError();
  });

  it("un URL del sito assente fa fallire il calcolo dei redirect", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => readSiteUrl()).toThrowError(/NEXT_PUBLIC_SITE_URL/u);
  });
});
