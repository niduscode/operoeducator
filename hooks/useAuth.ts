"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { UserRole, determineRole, usernameToEmail } from "@/lib/database.types";

interface UseAuthReturn {
  user: User | null;
  userRole: UserRole | null;
  userEmail: string;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Suscripción al estado de autenticación de Supabase.
  // Se ejecuta una sola vez y se limpia al desmontar.
  useEffect(() => {
    let resolved = false;
    let mounted = true;

    const applySession = (supabaseUser: User | null) => {
      if (!mounted) return;
      if (supabaseUser) {
        const email = supabaseUser.email ?? "";
        // El rol se deriva del username (parte antes de @) contra DIRECTORES/ADMINS.
        setUser(supabaseUser);
        setUserEmail(email);
        setUserRole(determineRole(email));
      } else {
        setUser(null);
        setUserEmail("");
        setUserRole(null);
      }
      setIsLoading(false);
    };

    // Red de seguridad: si Supabase Auth no resuelve en 5s (red lenta,
    // storage colgado, túnel HTTPS con problemas), tratamos al usuario
    // como no autenticado en vez de quedarnos en loading infinito.
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

    // Hidratamos el estado con la sesión actual (si existe) antes de
    // engancharnos a los cambios. getSession() lee de storage local y es
    // sincrónico-rápido cuando ya hay sesión persistida.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        applySession(data.session?.user ?? null);
      })
      .catch((err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.warn("useAuth: error obteniendo sesión inicial", err);
        applySession(null);
      });

    // Suscripción a cambios futuros (login, logout, refresh de token).
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolved = true;
      clearTimeout(timeoutId);
      applySession(session?.user ?? null);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // El usuario escribe solo su username (ej. "director.christan");
    // usernameToEmail le agrega el dominio interno para Supabase Auth.
    const email = usernameToEmail(username.trim());
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    user,
    userRole,
    userEmail,
    isLoading,
    login,
    logout,
  };
}
