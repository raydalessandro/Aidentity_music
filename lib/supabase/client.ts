"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readPublicSupabaseEnv } from "./public-env";

let cached: SupabaseClient | null = null;

/**
 * Client browser. Usa esclusivamente la chiave anon: ogni lettura e scrittura
 * passa da RLS. Non esiste un percorso da qui a `service_role`.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  const { supabaseUrl, supabaseAnonKey } = readPublicSupabaseEnv();
  cached = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return cached;
}
