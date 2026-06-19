"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { UserRole, determineRole, usernameToEmail } from "@/lib/database.types";
import { getStaffRoleByEmail } from "@/lib/queries";

interface UseAuthReturn {
  user: User | null;
  userRole: UserRole | null;
  userEmail: string;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Cache del rol resuelto en sessionStorage para que navegar entre páginas no
// re-resuelva contra la BD (cada página re-monta useAuth). Si no cacheamos,
// hay una ventana de ~100-500ms donde el rol queda en el fallback hardcoded
// ("instructor" para usuarios nuevos no listados en DIRECTORES/ADMINS) y los
// guards `if (userRole !== "director") router.replace("/dashboard")` rebotan
// al usuario antes de que la query a la BD termine.
//
// TTL corto (5 min) para que cambios de rol desde /admin/usuarios se reflejen
// pronto. Más allá de eso, basta con que el usuario refresque para limpiar.
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

function roleCacheKey(email: string): string {
  return `opero_role_${email.toLowerCase()}`;
}

function getCachedRole(email: string): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(roleCacheKey(email));
    if (!raw) return null;
    const { role, exp } = JSON.parse(raw) as { role: UserRole; exp: number };
    if (Date.now() > exp) {
      sessionStorage.removeItem(roleCacheKey(email));
      return null;
    }
    return role;
  } catch {
    return null;
  }
}

function setCachedRole(email: string, role: UserRole): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      roleCacheKey(email),
      JSON.stringify({ role, exp: Date.now() + ROLE_CACHE_TTL_MS })
    );
  } catch {
    // sessionStorage lleno o no disponible; ignorar.
  }
}

function clearCachedRole(email: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(roleCacheKey(email));
  } catch {
    // ignorar.
  }
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let resolved = false;
    let mounted = true;

    const applySession = async (supabaseUser: User | null) => {
      if (!mounted) return;
      if (!supabaseUser) {
        setUser(null);
        setUserEmail("");
        setUserRole(null);
        setIsLoading(false);
        return;
      }

      const email = supabaseUser.email ?? "";
      setUser(supabaseUser);
      setUserEmail(email);

      // 1) Si hay rol cacheado, úsalo de inmediato. Esto evita el flash de
      //    "instructor" cuando un director/admin nuevo navega entre páginas.
      const cached = getCachedRole(email);
      if (cached) {
        setUserRole(cached);
        setIsLoading(false);
        // Re-validamos en background con bajo costo para mantener fresco el cache.
        try {
          const fresh = await getStaffRoleByEmail(email);
          const finalRole: UserRole = fresh ?? determineRole(email);
          if (mounted && finalRole !== cached) {
            setUserRole(finalRole);
          }
          setCachedRole(email, finalRole);
        } catch {
          // Mantenemos el cached si la red falla.
        }
        return;
      }

      // 2) Sin cache: bloqueamos isLoading hasta tener el rol real. Es la
      //    primera carga de la sesión (login fresco o refresh), ahí sí
      //    podemos pagar los ~150ms de la query.
      try {
        const fresh = await getStaffRoleByEmail(email);
        if (!mounted) return;
        const finalRole: UserRole = fresh ?? determineRole(email);
        setUserRole(finalRole);
        setCachedRole(email, finalRole);
      } catch (err) {
        console.warn("useAuth: fallback a rol hardcoded", err);
        if (mounted) setUserRole(determineRole(email));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    // Red de seguridad: si Supabase Auth no resuelve en 5s, tratamos al
    // usuario como no autenticado en vez de quedarnos en loading infinito.
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.warn("useAuth: timeout 5s sin resolver sesión, asumiendo no autenticado");
      if (!mounted) return;
      setUser(null);
      setUserEmail("");
      setUserRole(null);
      setIsLoading(false);
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        void applySession(data.session?.user ?? null);
      })
      .catch((err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.warn("useAuth: error obteniendo sesión inicial", err);
        void applySession(null);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolved = true;
      clearTimeout(timeoutId);
      void applySession(session?.user ?? null);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const email = usernameToEmail(username.trim());
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    // Limpiamos el cache del rol al cerrar sesión para evitar leak si
    // otra persona usa el mismo navegador después.
    if (userEmail) clearCachedRole(userEmail);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [userEmail]);

  return {
    user,
    userRole,
    userEmail,
    isLoading,
    login,
    logout,
  };
}
