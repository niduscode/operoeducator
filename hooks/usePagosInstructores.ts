"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Alumno,
  AsistenciaAlumno,
  Instructor,
  PagoCalculado,
  Sucursal,
} from "@/lib/database.types";
import {
  getAlumnos,
  getAsistenciasEnRango,
  getInstructores,
  getInstructoresPorSucursal,
} from "@/lib/queries";
import { construirPagoCalculadoInstructorEscalado } from "@/lib/firestore";
import { useConfigPagos } from "@/hooks/useConfigPagos";

interface UsePagosInstructoresReturn {
  pagos: PagoCalculado[];
  isLoading: boolean;
  totalAPagar: number;
  error: string | null;
}

// Calcula los pagos del mes para todos los instructores activos usando el
// MODELO escalado (1er alumno + adicionales).
//
// Estrategia v2 (Supabase):
//  - Fetch one-shot al montar (y al re-bumpear el nonce) de:
//      * instructores (filtrados por sucursal si se pasa)
//      * alumnos (necesarios como fallback legacy para asistencias sin
//        instructor_id_snapshot)
//      * asistencias del mes (filtradas por sucursal en server si aplica)
//  - No usa Realtime: esta es la vista de director/admin para liquidar el
//    mes. Refetch manual via `nonce` si se cambia mes/año/sucursal o si se
//    quiere refrescar tras una acción externa.
export function usePagosInstructores(
  mes: number,
  año: number,
  sucursal?: Sucursal | null
): UsePagosInstructoresReturn {
  const { config, isLoading: configLoading } = useConfigPagos();
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loadingInst, setLoadingInst] = useState<boolean>(true);
  const [loadingAsist, setLoadingAsist] = useState<boolean>(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // nonce reservado para forzar refetch desde acciones externas si fuera
  // necesario (mismo patrón que otros hooks v2).
  const [nonce] = useState<number>(0);

  // Rango de fechas del mes (memoizado para evitar refetches innecesarios).
  const { desde, hasta } = useMemo(() => {
    const mm = String(mes).padStart(2, "0");
    const d = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const h = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    return { desde: d, hasta: h };
  }, [mes, año]);

  // Fetch de instructores (opcionalmente filtrados por sucursal).
  const refetchInstructores = useCallback(async () => {
    setLoadingInst(true);
    try {
      const rows = sucursal
        ? await getInstructoresPorSucursal(sucursal)
        : await getInstructores();
      setInstructores(rows);
      setError(null);
    } catch (err) {
      console.error("usePagosInstructores instructores:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los instructores."
      );
    } finally {
      setLoadingInst(false);
    }
  }, [sucursal]);

  useEffect(() => {
    void refetchInstructores();
  }, [refetchInstructores, nonce]);

  // Fetch de alumnos (todos — necesarios como fallback legacy para
  // asistencias sin instructor_id_snapshot).
  const refetchAlumnos = useCallback(async () => {
    setLoadingAlumnos(true);
    try {
      const rows = await getAlumnos();
      setAlumnos(rows);
    } catch (err) {
      console.error("usePagosInstructores alumnos:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los alumnos."
      );
    } finally {
      setLoadingAlumnos(false);
    }
  }, []);

  useEffect(() => {
    void refetchAlumnos();
  }, [refetchAlumnos, nonce]);

  // Fetch de asistencias del mes (filtradas por sucursal en server si aplica).
  const refetchAsistencias = useCallback(async () => {
    setLoadingAsist(true);
    try {
      const rows = await getAsistenciasEnRango(
        sucursal ?? null,
        desde,
        hasta
      );
      setAsistencias(rows);
    } catch (err) {
      console.error("usePagosInstructores asistencias:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las asistencias del mes."
      );
    } finally {
      setLoadingAsist(false);
    }
  }, [sucursal, desde, hasta]);

  useEffect(() => {
    void refetchAsistencias();
  }, [refetchAsistencias, nonce]);

  const pagos = useMemo<PagoCalculado[]>(() => {
    const montoPrimero = config?.montoInstructorPrimerAlumno ?? 0;
    const montoAdicional = config?.montoInstructorAlumnoAdicional ?? 0;

    // Pre-índice de alumnos por instructorId (fallback legacy).
    const porInst = new Map<string, Set<string>>();
    for (const al of alumnos) {
      if (!al.instructorId) continue;
      const set = porInst.get(al.instructorId) ?? new Set<string>();
      set.add(al.id);
      porInst.set(al.instructorId, set);
    }

    return instructores
      .filter((i) => i.activo)
      .map((i) =>
        construirPagoCalculadoInstructorEscalado({
          instructorId: i.id,
          instructorNombre: i.nombreCompleto,
          sucursal: i.sucursalActual,
          mes,
          año,
          asistencias: asistencias.filter(
            (a) => a.registradaPor === i.username
          ),
          alumnosDeEsteInstructor: porInst.get(i.id) ?? new Set<string>(),
          montoPrimerAlumno: montoPrimero,
          montoAlumnoAdicional: montoAdicional,
        })
      )
      .sort((a, b) => b.totalCLP - a.totalCLP);
  }, [instructores, asistencias, alumnos, config, mes, año]);

  const totalAPagar = useMemo(
    () => pagos.reduce((acc, p) => acc + p.totalCLP, 0),
    [pagos]
  );

  return {
    pagos,
    isLoading:
      configLoading || loadingInst || loadingAsist || loadingAlumnos,
    totalAPagar,
    error,
  };
}
