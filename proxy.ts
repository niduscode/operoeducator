// Proxy Next.js (antes "middleware") para Supabase Auth con SSR.
//
// Función: refrescar el token de acceso del usuario en cada request, para
// que las cookies de sesión nunca expiren con el usuario online y los
// server components siempre vean al usuario autenticado.
//
// Si no fuera por esto, el token expira en ~1h y el usuario tendría que
// loguearse de nuevo aunque la tab esté abierta. Es el patrón oficial
// recomendado por Supabase (https://supabase.com/docs/guides/auth/server-side/nextjs)
// y Next 16 renombró la convención a "proxy" (el archivo se llama proxy.ts
// y exporta una función llamada `proxy`).

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Toca la sesión; si el token está próximo a expirar, lo refresca y
  // setea las cookies nuevas en response.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Aplica a todas las rutas EXCEPTO assets estáticos y rutas internas
  // de Next.js. Si no excluimos /_next/static y /favicon.ico habría
  // overhead por cada chunk de JS y CSS.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
