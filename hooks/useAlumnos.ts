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
import type { Alumno, Sucursal } from "@/lib/types";
import {
  ALUMNOS_COLLECTION,
  AlumnoInput,
  createAlumno as fsCreateAlumno,
  updateAlumno as fsUpdateAlumno,
  deleteAlumno as fsDeleteAlumno,
  reactivateAlumno as fsReactivateAlumno,
  createAlumnosMasivo as fsCreateAlumnosMasivo,
} from "@/lib/firestore";

interface UseAlumnosReturn {
  alumnos: Alumno[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createAlumno: (data: AlumnoInput) => Promise<string>;
  updateAlumno: (id: string, data: Partial<AlumnoInput>) => Promise<void>;
  deleteAlumno: (id: string) => Promise<void>;
  reactivateAlumno: (id: string) => Promise<void>;
  importMasivo: (data: AlumnoInput[]) => Promise<string[]>;
}

interface UseAlumnosOptions {
  // Por defecto el hook devuelve solo alumnos activos. Pasar true para incluir
  // los desactivados (útil en pantallas con toggle "Mostrar inactivos").
  incluirInactivos?: boolean;
}

// Si pasas `sucursal`, la suscripción se filtra server-side.
// Pensado para instructores (ven solo su sucursal); director/admin lo omiten.
export function useAlumnos(
  sucursal?: Sucursal | null,
  options?: UseAlumnosOptions
): UseAlumnosReturn {
  const incluirInactivos = options?.incluirInactivos ?? false;
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Bump this to forzar re-suscripción cuando se pida refetch manual.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const base = collection(db, ALUMNOS_COLLECTION);
    const q = sucursal ? query(base, where("sucursal", "==", sucursal)) : base;

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: Alumno[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              nombre: data.nombre ?? "",
              telefono: data.telefono ?? "",
              sucursal: data.sucursal,
              curso: data.curso,
              horario: data.horario,
              fecha: data.fecha ?? "",
              profeGuiaId: data.profeGuiaId ?? "",
              instructorId: data.instructorId ?? "",
              activo: data.activo ?? true,
            } as Alumno;
          })
          .filter((a) => incluirInactivos || a.activo !== false);
        setAlumnos(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useAlumnos onSnapshot:", err);
        setError("No se pudieron cargar los alumnos en tiempo real.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [sucursal, nonce, incluirInactivos]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const createAlumno = useCallback((data: AlumnoInput) => fsCreateAlumno(data), []);
  const updateAlumno = useCallback(
    (id: string, data: Partial<AlumnoInput>) => fsUpdateAlumno(id, data),
    []
  );
  const deleteAlumno = useCallback((id: string) => fsDeleteAlumno(id), []);
  const reactivateAlumno = useCallback(
    (id: string) => fsReactivateAlumno(id),
    []
  );
  const importMasivo = useCallback(
    (data: AlumnoInput[]) => fsCreateAlumnosMasivo(data),
    []
  );

  return useMemo(
    () => ({
      alumnos,
      isLoading,
      error,
      refetch,
      createAlumno,
      updateAlumno,
      deleteAlumno,
      reactivateAlumno,
      importMasivo,
    }),
    [
      alumnos,
      isLoading,
      error,
      refetch,
      createAlumno,
      updateAlumno,
      deleteAlumno,
      reactivateAlumno,
      importMasivo,
    ]
  );
}
