"use client";

import { useMemo } from "react";
import type { Alumno, Sucursal } from "@/lib/types";
import { useAlumnos } from "./useAlumnos";
import { usePreciosAlumnos } from "./usePreciosAlumnos";
import { calcularFechaTerminoCurso } from "@/lib/firestore";

interface UseCursosTerminandoReturn {
  cursosCertificandoseHoy: Alumno[];
  cursosCertificadosRecientes: Alumno[]; // hace ≤ 3 días
  cursosProximosATerminar: Alumno[];     // entre +1 y +7 días
  isLoading: boolean;
}

// Devuelve grupos de alumnos cuya fecha de término del curso está cerca de
// hoy. Útil para el banner "🎓 Hoy se certifican…" que aparece en los
// dashboards y en /aulas.
//
// Si pasas `sucursal`, filtra (útil para el InstructorDashboard).
//
// Cálculo: fechaTermino = fechaIngreso + ⌈duracionClases / 2⌉ semanas. Para
// alumnos sin `fecha`, no se calcula (quedan fuera del aviso). El director
// puede editar la fecha de ingreso desde la pantalla de alumnos.
export function useCursosTerminando(
  sucursal?: Sucursal | null
): UseCursosTerminandoReturn {
  const { alumnos, isLoading: alumnosLoading } = useAlumnos(sucursal ?? null);
  const { precios, isLoading: preciosLoading } = usePreciosAlumnos();

  return useMemo<UseCursosTerminandoReturn>(() => {
    // Normalizamos hoy a 00:00 local para comparar por día.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const msPorDia = 1000 * 60 * 60 * 24;

    const certificandoseHoy: Alumno[] = [];
    const certificadosRecientes: Alumno[] = [];
    const proximosATerminar: Alumno[] = [];

    for (const a of alumnos) {
      if (a.activo === false) continue;
      const fechaTermino = calcularFechaTerminoCurso(a, precios);
      if (!fechaTermino) continue;
      fechaTermino.setHours(0, 0, 0, 0);
      const diffDias = Math.round(
        (fechaTermino.getTime() - hoy.getTime()) / msPorDia
      );
      if (diffDias === 0) {
        certificandoseHoy.push(a);
      } else if (diffDias < 0 && diffDias >= -3) {
        certificadosRecientes.push(a);
      } else if (diffDias > 0 && diffDias <= 7) {
        proximosATerminar.push(a);
      }
    }

    return {
      cursosCertificandoseHoy: certificandoseHoy,
      cursosCertificadosRecientes: certificadosRecientes,
      cursosProximosATerminar: proximosATerminar,
      isLoading: alumnosLoading || preciosLoading,
    };
  }, [alumnos, precios, alumnosLoading, preciosLoading]);
}
