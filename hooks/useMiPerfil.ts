"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getInstructorPorEmail } from "@/lib/queries";
import { determineRole } from "@/lib/database.types";
import type { Instructor } from "@/lib/database.types";

interface UseMiPerfilReturn {
  perfil: Instructor | null;
  isLoading: boolean;
  error: string | null;
}

// Devuelve el perfil del instructor logueado a partir de su email de Supabase Auth.
// Para director y admin retorna null (no son instructores).
// La suscripción Realtime es reactiva: si el director reasigna la sucursal,
// el dashboard del instructor se actualiza al instante sin recargar.
export function useMiPerfil(): UseMiPerfilReturn {
  const [perfil, setPerfil] = useState<Instructor | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<ReturnType<typeof determineRole> | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  // Guardamos la última referencia a fetch para que el handler de realtime
  // siempre lea el email vigente sin recrear la suscripción.
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  // Hidrata el estado de auth (email + rol) desde Supabase y se mantiene al día
  // con onAuthStateChange. Equivalente al `useAuth` que consumía el hook viejo.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const e = data.user?.email ?? "";
        setEmail(e);
        setRole(e ? determineRole(e) : null);
      } catch (err) {
        if (cancelled) return;
        console.warn("useMiPerfil getUser:", err);
        setEmail("");
        setRole(null);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };

    void hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const e = session?.user?.email ?? "";
      setEmail(e);
      setRole(e ? determineRole(e) : null);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const doFetch = useCallback(async () => {
    if (!email) {
      setPerfil(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    try {
      const row = await getInstructorPorEmail(email);
      setPerfil(row);
      setError(null);
    } catch (err) {
      console.error("useMiPerfil fetch:", err);
      setError("No se pudo cargar tu perfil de instructor.");
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    fetchRef.current = doFetch;
  }, [doFetch]);

  useEffect(() => {
    // Esperamos a que el auth termine de hidratar.
    if (!authReady) {
      setIsLoading(true);
      return;
    }

    // No-instructores no tienen perfil que cargar.
    if (role !== "instructor" || !email) {
      setPerfil(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    void doFetch();

    // Realtime: si el director cambia la sucursal del instructor (o cualquier
    // campo de su fila), refetcheamos. Filtramos por email server-side para
    // no recibir cambios de otros instructores.
    const channel = supabase
      .channel(`mi-perfil-${email}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instructores",
          filter: `email=eq.${email}`,
        },
        () => {
          void fetchRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [email, role, authReady, doFetch]);

  return useMemo(
    () => ({ perfil, isLoading, error }),
    [perfil, isLoading, error]
  );
}
