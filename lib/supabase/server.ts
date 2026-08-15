import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { readPublicSupabaseEnv } from "./public-env";

/**
 * Client server con sessione su cookie. Usa la chiave anon: le letture e le
 * scritture restano soggette a RLS e all'identita' dell'utente loggato.
 * Va ricreato a ogni richiesta, mai condiviso fra richieste.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = readPublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // In un Server Component i cookie sono di sola lettura: il refresh
          // del token viene riscritto dal Route Handler o dalla Server Action
          // che gestisce la richiesta successiva.
        }
      },
    },
  });
}

/**
 * Variante per Route Handler: legge dalla richiesta e scrive sulla risposta,
 * inclusi gli header anti-cache che la libreria richiede quando emette cookie
 * di sessione.
 */
export function createSupabaseRouteHandlerClient(
  request: NextRequest,
  response: NextResponse,
): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = readPublicSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });
}
