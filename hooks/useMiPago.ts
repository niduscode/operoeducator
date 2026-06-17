"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Alumno,
  AsistenciaAlumno,
  Instructor,
  PagoCalculado,
} from "@/lib/database.types";
import {
  getAlumnos,
  getInstructorPorEmail,
} from "@/lib/queries";
import { construirPagoCalculadoInstructorEscalado } from "@/lib/firestore";
import { useConfigPagos } from "@/hooks/useConfigPagos";

interface UseMiPagoReturn {
  pago: PagoCalculado | null;
  isLoading: boolean;
  error: string | null;
}

// Mapea una fila cruda de `asistencias_alumnos` (snake_case) al tipo de
// dominio camelCase. Local al hook porque las consultas que hacemos aquí
// no pasan por la capa toAsistencia() de lib/queries — filtramos en server
// con .eq("instructor_id_snapshot", ...) para reducir payload.
function rowToAsistencia(r: Record<string, unknown>): AsistenciaAlumno {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  return {
    id: String(r.id ?? ""),
    alumnoId: String(r.alumno_id ?? ""),
    fecha: String(r.fecha ?? ""),
    estado: (r.estado as AsistenciaAlumno["estado"]) ?? "Presente",
    observacion: typeof r.observacion === "string" ? r.observacion : "",
    registradaPor: typeof r.registrada_por === "string" ? r.registrada_por : "",
    sucursal: r.sucursal as AsistenciaAlumno["sucursal"],
    curso: r.curso as AsistenciaAlumno["curso"],
    turno: r.turno as AsistenciaAlumno["turno"],
    tarifaInstructorAplicada: num(r.tarifa_instructor_aplicada),
    tarifaProfeGuiaAplicada: num(r.tarifa_profe_guia_aplicada),
    profeGuiaIdSnapshot: str(r.profe_guia_id_snapshot),
    instructorIdSnapshot: str(r.instructor_id_snapshot),
  };
}

// Calcula reactivamente el pago del instructor logueado para un mes/año
// usando el modelo escalado (1er alumno + adicionales).
//
// Estrategia v2 (Supabase):
//  - El email se obtiene de supabase.auth.getUser().
//  - El perfil de instructor se resuelve via getInstructorPorEmail.
//  - Las asistencias se filtran en server por instructor_id_snapshot y
//    estado IN ('Presente','Tarde').
//  - Realtime: la página "Mi pago" debe reflejar al instante cada asistencia
//    que el instructor registre durante su jornada — suscribimos a
//    postgres_changes sobre asistencias_alumnos filtrado por su snapshot id.
export function useMiPago(mes: number, año: number): UseMiPagoReturn {
  const { config, isLoading: configLoading } = useConfigPagos();

  const [perfil, setPerfil] = useState<Instructor | null>(null);
  const [perfilLoading, setPerfilLoading] = useState<boolean>(true);

  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [alumnosAsignados, setAlumnosAsignados] = useState<Alumno[]>([]);
  const [loadingAsist, setLoadingAsist] = useState<boolean>(true);
  const [loadingAsig, setLoadingAsig] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const instructorId = perfil?.id ?? null;

  // Bumpear este nonce fuerza un re-fetch de asistencias / alumnos.
  // Lo usamos desde la suscripción Realtime para que cualquier INSERT /
  // UPDATE / DELETE en server gatille un refresco.
  const [nonce, setNonce] = useState<number>(0);

  // Rango de fechas del mes (memoizado para evitar refetches innecesarios).
  const { desde, hasta } = useMemo(() => {
    const mm = String(mes).padStart(2, "0");
    const d = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const h = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    return { desde: d, hasta: h };
  }, [mes, año]);

  // 1) Resolver el instructor logueado.
  useEffect(() => {
    let cancelled = false;
    setPerfilLoading(true);
    (async () => {
      try {
        const { data: userData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        const email = userData.user?.email ?? "";
        if (!email) {
          if (cancelled) return;
          setPerfil(null);
          return;
        }
        const inst = await getInstructorPorEmail(email);
        if (cancelled) return;
        setPerfil(inst);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("useMiPago perfil:", err);
        setError("No se pudo cargar tu perfil de instructor.");
        setPerfil(null);
      } finally {
        if (!cancelled) setPerfilLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Asistencias del mes para este instructor (filtradas en server por
  // instructor_id_snapshot + estado pagable).
  const refetchAsistencias = useCallback(async () => {
    if (!instructorId) {
      setAsistencias([]);
      setLoadingAsist(false);
      return;
    }
    setLoadingAsist(true);
    try {
      const { data, error: qErr } = await supabase
        .from("asistencias_alumnos")
        .select("*")
        .eq("instructor_id_snapshot", instructorId)
        .in("estado", ["Presente", "Tarde"])
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (qErr) throw qErr;
      const rows: AsistenciaAlumno[] = (data ?? []).map((r) =>
        rowToAsistencia(r as Record<string, unknown>)
      );
      setAsistencias(rows);
      setError(null);
    } catch (err) {
      console.error("useMiPago asistencias:", err);
      setError("No se pudieron cargar tus asistencias del mes.");
    } finally {
      setLoadingAsist(false);
    }
  }, [instructorId, desde, hasta]);

  useEffect(() => {
    void refetchAsistencias();
  }, [refetchAsistencias, nonce]);

  // 3) Alumnos asignados HOY a este instructor (fallback legacy para
  // asistencias sin instructor_id_snapshot). Lista chica → fetch + refetch.
  const refetchAlumnos = useCallback(async () => {
    if (!instructorId) {
      setAlumnosAsignados([]);
      setLoadingAsig(false);
      return;
    }
    setLoadingAsig(true);
    try {
      const todos = await getAlumnos();
      setAlumnosAsignados(todos.filter((a) => a.instructorId === instructorId));
    } catch (err) {
      console.error("useMiPago alumnos asignados:", err);
      // No es crítico — el cálculo seguirá usando el snapshot. No reportamos
      // este error a la UI para no tapar el error principal de asistencias.
    } finally {
      setLoadingAsig(false);
    }
  }, [instructorId]);

  useEffect(() => {
    void refetchAlumnos();
  }, [refetchAlumnos, nonce]);

  // 4) Realtime sobre asistencias del instructor — refresca a cada cambio.
  useEffect(() => {
    if (!instructorId) return;
    const channel = supabase
      .channel(`mi-pago-asistencias-${instructorId}-${año}-${mes}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asistencias_alumnos",
          filter: `instructor_id_snapshot=eq.${instructorId}`,
        },
        () => {
          setNonce((n) => n + 1);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [instructorId, mes, año]);

  const pago = useMemo<PagoCalculado | null>(() => {
    if (!perfil) return null;
    const MONTOS_VACIOS = {
      Junior: { primero: 0, adicional: 0 },
      Senior: { primero: 0, adicional: 0 },
      Master: { primero: 0, adicional: 0 },
    };
    const montosPorCurso = config?.montosInstructor ?? MONTOS_VACIOS;
    const setIds = new Set(alumnosAsignados.map((a) => a.id));
    return construirPagoCalculadoInstructorEscalado({
      instructorId: perfil.id,
      instructorNombre: perfil.nombreCompleto,
      sucursal: perfil.sucursalActual,
      mes,
      año,
      asistencias,
      alumnosDeEsteInstructor: setIds,
      montosPorCurso,
    });
  }, [perfil, config, asistencias, alumnosAsignados, mes, año]);

  return {
    pago,
    isLoading: perfilLoading || configLoading || loadingAsist || loadingAsig,
    error,
  };
}
