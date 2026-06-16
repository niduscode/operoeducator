"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Alumno, Sucursal } from "@/lib/database.types";
import {
  getAlumnos,
  getAlumnosPorSucursal,
  createAlumno as sbCreateAlumno,
  updateAlumno as sbUpdateAlumno,
  deleteAlumno as sbDeleteAlumno,
  reactivateAlumno as sbReactivateAlumno,
  createAlumnosMasivo as sbCreateAlumnosMasivo,
} from "@/lib/queries";

// Mantener compatibilidad con la firma anterior (Firestore exponía AlumnoInput).
export type AlumnoInput = Omit<Alumno, "id">;

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

// Si pasas `sucursal`, la query se filtra server-side.
// Pensado para instructores (ven solo su sucursal); director/admin lo omiten.
export function useAlumnos(
  sucursal?: Sucursal | null,
  options?: UseAlumnosOptions
): UseAlumnosReturn {
  const incluirInactivos = options?.incluirInactivos ?? false;
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Bump this to forzar refetch manual.
  const [nonce, setNonce] = useState(0);

  // Guardamos la última referencia a fetch para que el handler de realtime
  // siempre consuma el filtro vigente sin recrear la suscripción.
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const doFetch = useCallback(async () => {
    try {
      const rows = sucursal
        ? await getAlumnosPorSucursal(sucursal)
        : await getAlumnos();
      const filtered = incluirInactivos
        ? rows
        : rows.filter((a) => a.activo !== false);
      setAlumnos(filtered);
      setError(null);
    } catch (err) {
      console.error("useAlumnos fetch:", err);
      setError("No se pudieron cargar los alumnos.");
    } finally {
      setIsLoading(false);
    }
  }, [sucursal, incluirInactivos]);

  useEffect(() => {
    fetchRef.current = doFetch;
  }, [doFetch]);

  useEffect(() => {
    setIsLoading(true);
    void doFetch();

    const channelName = sucursal
      ? `alumnos-${sucursal}`
      : `alumnos-all`;
    const filter = sucursal ? `sucursal=eq.${sucursal}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alumnos",
          ...(filter ? { filter } : {}),
        },
        () => {
          void fetchRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sucursal, incluirInactivos, nonce, doFetch]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const createAlumno = useCallback(
    (data: AlumnoInput) => sbCreateAlumno(data),
    []
  );
  const updateAlumno = useCallback(
    (id: string, data: Partial<AlumnoInput>) => sbUpdateAlumno(id, data),
    []
  );
  const deleteAlumno = useCallback((id: string) => sbDeleteAlumno(id), []);
  const reactivateAlumno = useCallback(
    (id: string) => sbReactivateAlumno(id),
    []
  );
  const importMasivo = useCallback(
    (data: AlumnoInput[]) => sbCreateAlumnosMasivo(data),
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
