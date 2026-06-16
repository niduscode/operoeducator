"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EvaluacionAlumno } from "@/lib/database.types";
import {
  getEvaluacionesPorAlumno,
  registrarEvaluacion as sbRegistrar,
  updateEvaluacion as sbUpdate,
  deleteEvaluacion as sbDelete,
} from "@/lib/queries";

// Mantener compatibilidad con la firma anterior (Firestore exponía EvaluacionAlumnoInput).
export type EvaluacionAlumnoInput = Omit<EvaluacionAlumno, "id">;

interface UseEvaluacionesReturn {
  evaluaciones: EvaluacionAlumno[];
  isLoading: boolean;
  error: string | null;
  registrar: (data: EvaluacionAlumnoInput) => Promise<string>;
  actualizar: (id: string, data: Partial<EvaluacionAlumnoInput>) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

// Suscripción reactiva a las evaluaciones de un alumno (orden desc por fecha).
// Si alumnoId es null/vacío, no dispara la query.
export function useEvaluaciones(
  alumnoId: string | null | undefined
): UseEvaluacionesReturn {
  const [evaluaciones, setEvaluaciones] = useState<EvaluacionAlumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const doFetch = useCallback(async () => {
    if (!alumnoId) {
      setEvaluaciones([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    try {
      const rows = await getEvaluacionesPorAlumno(alumnoId);
      setEvaluaciones(rows);
      setError(null);
    } catch (err) {
      console.error("useEvaluaciones fetch:", err);
      setError("No se pudieron cargar las evaluaciones del alumno.");
    } finally {
      setIsLoading(false);
    }
  }, [alumnoId]);

  useEffect(() => {
    fetchRef.current = doFetch;
  }, [doFetch]);

  useEffect(() => {
    if (!alumnoId) {
      setEvaluaciones([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    void doFetch();

    const channel = supabase
      .channel(`evaluaciones-${alumnoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluaciones_alumnos",
          filter: `alumno_id=eq.${alumnoId}`,
        },
        () => {
          void fetchRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alumnoId, doFetch]);

  const registrar = useCallback(
    (data: EvaluacionAlumnoInput) => sbRegistrar(data),
    []
  );
  const actualizar = useCallback(
    (id: string, data: Partial<EvaluacionAlumnoInput>) => sbUpdate(id, data),
    []
  );
  const eliminar = useCallback((id: string) => sbDelete(id), []);

  return useMemo(
    () => ({ evaluaciones, isLoading, error, registrar, actualizar, eliminar }),
    [evaluaciones, isLoading, error, registrar, actualizar, eliminar]
  );
}
