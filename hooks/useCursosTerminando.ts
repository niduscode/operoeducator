"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type Alumno,
  type Curso,
  type PreciosAlumnos,
  type Sucursal,
  DURACION_DEFAULT_CLASES,
} from "@/lib/database.types";
import {
  getAlumnos,
  getAlumnosPorSucursal,
  getPreciosAlumnos,
} from "@/lib/queries";

// Item para listas con offset en días respecto a hoy.
export interface AlumnoCertificacionReciente {
  alumno: Alumno;
  diasAtras: number; // cantidad de días desde que terminó (1..3)
}

export interface AlumnoCertificacionProxima {
  alumno: Alumno;
  diasAdelante: number; // cantidad de días hasta que termina (1..7)
}

interface UseCursosTerminandoReturn {
  hoy: Alumno[];
  recientes: AlumnoCertificacionReciente[];
  proximos: AlumnoCertificacionProxima[];
  isLoading: boolean;
  error: string | null;
  // Aliases compat con la API vieja (CertificacionesBanner usa estos).
  cursosCertificandoseHoy: Alumno[];
  cursosCertificadosRecientes: AlumnoCertificacionReciente[];
  cursosProximosATerminar: AlumnoCertificacionProxima[];
}

// Cuántas clases dura el curso según los precios configurados; si no hay
// configuración válida, cae al default por curso.
function duracionClasesDeCurso(
  curso: Curso,
  precios: PreciosAlumnos | null
): number {
  const fromConfig =
    curso === "Junior"
      ? precios?.duracionJuniorClases
      : curso === "Senior"
        ? precios?.duracionSeniorClases
        : precios?.duracionMasterClases;
  if (typeof fromConfig === "number" && fromConfig > 0) return fromConfig;
  return DURACION_DEFAULT_CLASES[curso];
}

// Calcula la fecha de término del curso de un alumno:
//   fechaTermino = fechaIngreso + ⌈duracionClases / 2⌉ semanas
// Las clases se dictan martes y miércoles (2 por semana), así que
// ⌈clases/2⌉ semanas cubre el curso completo. Devuelve null si el alumno
// no tiene fecha de ingreso aprovechable.
function calcularFechaTerminoCurso(
  alumno: Alumno,
  precios: PreciosAlumnos | null
): Date | null {
  const desde = alumno.fecha || "";
  if (!desde) return null;
  const base = new Date(desde);
  if (Number.isNaN(base.getTime())) return null;
  const clases = duracionClasesDeCurso(alumno.curso, precios);
  const semanas = Math.ceil(clases / 2);
  const dias = semanas * 7;
  const out = new Date(base);
  out.setDate(out.getDate() + dias);
  return out;
}

// Devuelve grupos de alumnos cuya fecha de término del curso está cerca de
// hoy. Útil para el banner "🎓 Hoy se certifican…" que aparece en los
// dashboards y en /aulas.
//
// Si pasas `sucursal`, filtra (útil para el InstructorDashboard).
//
// Cálculo: fechaTermino = fechaIngreso + ⌈duracionClases / 2⌉ semanas. Para
// alumnos sin `fecha`, no se calcula (quedan fuera del aviso).
//
// Este hook se considera "de hoy": usa Realtime sobre `alumnos` y
// `precios_alumnos` para reflejar cambios de fecha / configuración sin
// que el usuario recargue.
export function useCursosTerminando(
  sucursal?: Sucursal | null
): UseCursosTerminandoReturn {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [precios, setPrecios] = useState<PreciosAlumnos | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Última referencia al fetch para que los handlers de realtime siempre
  // consuman el filtro vigente sin recrear la suscripción.
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const doFetch = useCallback(async () => {
    try {
      const [rowsAlumnos, preciosRow] = await Promise.all([
        sucursal ? getAlumnosPorSucursal(sucursal) : getAlumnos(),
        getPreciosAlumnos().catch((err) => {
          // Si los precios no existen, seguimos con null y caemos al default.
          console.warn("useCursosTerminando getPreciosAlumnos:", err);
          return null as PreciosAlumnos | null;
        }),
      ]);
      setAlumnos(rowsAlumnos);
      setPrecios(preciosRow);
      setError(null);
    } catch (err) {
      console.error("useCursosTerminando fetch:", err);
      setError("No se pudieron cargar los cursos por terminar.");
    } finally {
      setIsLoading(false);
    }
  }, [sucursal]);

  useEffect(() => {
    fetchRef.current = doFetch;
  }, [doFetch]);

  useEffect(() => {
    setIsLoading(true);
    void doFetch();

    const sufijo = sucursal ?? "all";
    const filterAlumnos = sucursal ? `sucursal=eq.${sucursal}` : undefined;

    const channel = supabase
      .channel(`cursos-terminando-${sufijo}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alumnos",
          ...(filterAlumnos ? { filter: filterAlumnos } : {}),
        },
        () => {
          void fetchRef.current();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "precios_alumnos" },
        () => {
          void fetchRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sucursal, doFetch]);

  return useMemo<UseCursosTerminandoReturn>(() => {
    // Normalizamos hoy a 00:00 local para comparar por día.
    const hoyDate = new Date();
    hoyDate.setHours(0, 0, 0, 0);
    const msPorDia = 1000 * 60 * 60 * 24;

    const hoy: Alumno[] = [];
    const recientes: AlumnoCertificacionReciente[] = [];
    const proximos: AlumnoCertificacionProxima[] = [];

    for (const a of alumnos) {
      if (a.activo === false) continue;
      const fechaTermino = calcularFechaTerminoCurso(a, precios);
      if (!fechaTermino) continue;
      fechaTermino.setHours(0, 0, 0, 0);
      const diffDias = Math.round(
        (fechaTermino.getTime() - hoyDate.getTime()) / msPorDia
      );
      if (diffDias === 0) {
        hoy.push(a);
      } else if (diffDias < 0 && diffDias >= -3) {
        recientes.push({ alumno: a, diasAtras: -diffDias });
      } else if (diffDias > 0 && diffDias <= 7) {
        proximos.push({ alumno: a, diasAdelante: diffDias });
      }
    }

    // Orden estable: recientes por más recientes primero (diasAtras asc),
    // proximos por los que terminan antes (diasAdelante asc).
    recientes.sort((x, y) => x.diasAtras - y.diasAtras);
    proximos.sort((x, y) => x.diasAdelante - y.diasAdelante);

    return {
      hoy,
      recientes,
      proximos,
      isLoading,
      error,
      // Aliases compat
      cursosCertificandoseHoy: hoy,
      cursosCertificadosRecientes: recientes,
      cursosProximosATerminar: proximos,
    };
  }, [alumnos, precios, isLoading, error]);
}
