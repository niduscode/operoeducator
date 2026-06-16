// Cliente Supabase para uso SERVER-SIDE (server components, route handlers,
// server actions). Lee/escribe la cookie de sesión del usuario para que el
// SSR respete la auth del usuario logueado.
//
// IMPORTANTE: este módulo solo se importa desde server code. No lo
// importes desde un componente "use client" — usá lib/supabase.ts ahí.
//
// El cliente server-only con service_role (admin) se construye con
// createServiceClient(); úsalo para scripts/operaciones de admin que
// deban bypasear RLS. NUNCA expongas eso al cliente.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente con sesión del usuario (respeta RLS según su rol).
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde Server Component: setear cookies no está permitido
          // en ese contexto. Se ignora porque el cliente ya recibe la cookie
          // vía middleware/route handler.
        }
      },
    },
  });
}

// Cliente ADMIN con service_role. Bypasea RLS. NUNCA usar en código que
// pueda ejecutarse en el cliente.
export function getSupabaseServiceClient() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurado");
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
