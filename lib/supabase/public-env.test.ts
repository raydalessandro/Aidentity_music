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

  it("un URL del sito assente fa fallire il calcolo dei redirect", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => readSiteUrl()).toThrowError(/NEXT_PUBLIC_SITE_URL/u);
  });
});
