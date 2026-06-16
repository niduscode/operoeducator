// Cliente Supabase para uso desde el navegador (componentes client).
//
// Conviene tener UNA sola instancia compartida: cada `createClient` abre
// su propio WebSocket de Realtime y suscripción a auth. Crearlo por
// hook/efecto causa fugas y duplica los listeners de Realtime.
//
// Server-side (API routes / server components) usa otro cliente con
// `cookies()` para reusar la sesión del usuario — eso vive en
// lib/supabase-server.ts y NO se importa desde acá.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __opero_supabase: SupabaseClient | undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // En build time las env vars no están — Next.js prerendera estáticamente
  // las páginas "use client" pero no las evalúa. Solo importa esto cuando
  // el bundle de cliente corre en el navegador.
  if (typeof window !== "undefined") {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }
}

/**
 * Cliente singleton de Supabase para el navegador. Usa createBrowserClient
 * de @supabase/ssr que ya configura cookies seguras para que la sesión
 * sobreviva recargas y navegue bien entre páginas server/client.
 *
 * Reutiliza la instancia entre re-renders y HMR vía globalThis para evitar
 * múltiples WebSockets de Realtime y duplicados del listener de auth.
 */
export const supabase: SupabaseClient =
  globalThis.__opero_supabase ??
  createBrowserClient(url ?? "", anonKey ?? "");

if (typeof window !== "undefined" && !globalThis.__opero_supabase) {
  globalThis.__opero_supabase = supabase;
}

export default supabase;
