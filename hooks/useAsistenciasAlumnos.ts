"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AsistenciaAlumno, Sucursal } from "@/lib/types";
import {
  ASISTENCIAS_ALUMNOS_COLLECTION,
  AsistenciaAlumnoInput,
  registrarAsistenciaAlumno as fsRegistrar,
  updateAsistenciaAlumno as fsUpdate,
  deleteAsistenciaAlumno as fsDelete,
} from "@/lib/firestore";

interface UseAsistenciasAlumnosReturn {
  asistencias: AsistenciaAlumno[];
  isLoading: boolean;
  error: string | null;
  registrar: (data: AsistenciaAlumnoInput) => Promise<string>;
  actualizar: (id: string, data: Partial<AsistenciaAlumnoInput>) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

// Suscripción reactiva a asistencias de una sucursal en una fecha específica.
// La fecha viene en formato ISO (yyyy-mm-dd). Si sucursal o fecha son null,
// no dispara la query.
export function useAsistenciasAlumnos(
  sucursal: Sucursal | null | undefined,
  fecha: string
): UseAsistenciasAlumnosReturn {
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursal || !fecha) {
      setAsistencias([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS_COLLECTION),
      where("sucursal", "==", sucursal),
      where("fecha", "==", fecha)
    );

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: AsistenciaAlumno[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            alumnoId: data.alumnoId ?? "",
            fecha: data.fecha ?? "",
            estado: data.estado ?? "Presente",
            observacion: data.observacion ?? "",
            registradaPor: data.registradaPor ?? "",
            sucursal: data.sucursal,
            curso: data.curso,
            turno: data.turno,
            tarifaInstructorAplicada:
              typeof data.tarifaInstructorAplicada === "number"
                ? data.tarifaInstructorAplicada
                : undefined,
            tarifaProfeGuiaAplicada:
              typeof data.tarifaProfeGuiaAplicada === "number"
                ? data.tarifaProfeGuiaAplicada
                : undefined,
            profeGuiaIdSnapshot:
              typeof data.profeGuiaIdSnapshot === "string"
                ? data.profeGuiaIdSnapshot
                : undefined,
          };
        });
        setAsistencias(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useAsistenciasAlumnos onSnapshot:", err);
        setError("No se pudieron cargar las asistencias del día.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [sucursal, fecha]);

  const registrar = useCallback(
    (data: AsistenciaAlumnoInput) => fsRegistrar(data),
    []
  );
  const actualizar = useCallback(
    (id: string, data: Partial<AsistenciaAlumnoInput>) => fsUpdate(id, data),
    []
  );
  const eliminar = useCallback((id: string) => fsDelete(id), []);

  return useMemo(
    () => ({ asistencias, isLoading, error, registrar, actualizar, eliminar }),
    [asistencias, isLoading, error, registrar, actualizar, eliminar]
  );
}
