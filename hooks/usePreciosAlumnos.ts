"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getPreciosAlumnos,
  updatePreciosAlumnos,
} from "@/lib/queries";
import type { PreciosAlumnos } from "@/lib/database.types";

interface UsePreciosAlumnosReturn {
  precios: PreciosAlumnos | null;
  isLoading: boolean;
  error: string | null;
  updatePrecios: (
    patch: Partial<PreciosAlumnos>,
    actualizadoPor: string
  ) => Promise<void>;
  // Compat con código viejo que llama save().
  save: (
    patch: Partial<PreciosAlumnos>,
    actualizadoPor: string
  ) => Promise<void>;
}

export function usePreciosAlumnos(): UsePreciosAlumnosReturn {
  const [precios, setPrecios] = useState<PreciosAlumnos | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getPreciosAlumnos()
      .then((data) => {
        if (cancelled) return;
        setPrecios(data);
        setError(null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("usePreciosAlumnos fetch:", err);
        setPrecios(null);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los precios."
        );
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    const channel = supabase
      .channel("precios-alumnos-default")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "precios_alumnos",
          filter: "id=eq.default",
        },
        () => {
          setNonce((n) => n + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updatePrecios = useCallback(
    async (patch: Partial<PreciosAlumnos>, actualizadoPor: string) => {
      await updatePreciosAlumnos(patch, actualizadoPor);
      setNonce((n) => n + 1);
    },
    []
  );

  return useMemo(
    () => ({ precios, isLoading, error, updatePrecios, save: updatePrecios }),
    [precios, isLoading, error, updatePrecios]
  );
}
