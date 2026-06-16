"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EvaluacionAlumno } from "@/lib/types";
import {
  EVALUACIONES_ALUMNOS_COLLECTION,
  EvaluacionAlumnoInput,
  registrarEvaluacion as fsRegistrar,
  updateEvaluacion as fsUpdate,
  deleteEvaluacion as fsDelete,
} from "@/lib/firestore";

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

  useEffect(() => {
    if (!alumnoId) {
      setEvaluaciones([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      collection(db, EVALUACIONES_ALUMNOS_COLLECTION),
      where("alumnoId", "==", alumnoId),
      orderBy("fecha", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: EvaluacionAlumno[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            alumnoId: data.alumnoId ?? "",
            fecha: data.fecha ?? "",
            nota: typeof data.nota === "number" ? data.nota : 0,
            observacion: data.observacion ?? "",
            evaluadoPor: data.evaluadoPor ?? "",
            sucursal: data.sucursal,
            curso: data.curso,
          };
        });
        setEvaluaciones(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useEvaluaciones onSnapshot:", err);
        setError("No se pudieron cargar las evaluaciones del alumno.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [alumnoId]);

  const registrar = useCallback(
    (data: EvaluacionAlumnoInput) => fsRegistrar(data),
    []
  );
  const actualizar = useCallback(
    (id: string, data: Partial<EvaluacionAlumnoInput>) => fsUpdate(id, data),
    []
  );
  const eliminar = useCallback((id: string) => fsDelete(id), []);

  return useMemo(
    () => ({ evaluaciones, isLoading, error, registrar, actualizar, eliminar }),
    [evaluaciones, isLoading, error, registrar, actualizar, eliminar]
  );
}
