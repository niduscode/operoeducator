"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAsistenciasEnRango } from "@/lib/queries";
import type { AsistenciaAlumno } from "@/lib/database.types";
import { useAlumnos } from "./useAlumnos";
import { useProfesGuias } from "./useProfesGuias";
import { useInstructores } from "./useInstructores";

export interface AusenciaResuelta {
  asistencia: AsistenciaAlumno;
  alumnoNombre: string;
  profesionalNombre: string;
  profesionalRol: "instructor" | "profeGuia" | "sin-asignar";
}

interface UseAusenciasDelMesReturn {
  ausencias: AusenciaResuelta[];
  isLoading: boolean;
  error: string | null;
}

export function useAusenciasDelMes(
  mes: number,
  año: number
): UseAusenciasDelMesReturn {
  const { alumnos } = useAlumnos(null, { incluirInactivos: true });
  const { profesGuias } = useProfesGuias(null, { incluirInactivos: true });
  const { instructores } = useInstructores();

  const [rows, setRows] = useState<AsistenciaAlumno[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mm = String(mes).padStart(2, "0");
  const desde = `${año}-${mm}-01`;
  const ultimoDia = new Date(año, mes, 0).getDate();
  const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;

  const fetchAusencias = useCallback(async () => {
    setIsLoading(true);
    try {
      const todas = await getAsistenciasEnRango(null, desde, hasta);
      const ausentes = todas.filter((a) => a.estado === "Ausente");
      setRows(ausentes);
      setError(null);
    } catch (err) {
      console.error("useAusenciasDelMes:", err);
      setError("No se pudieron cargar las ausencias del mes.");
    } finally {
      setIsLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    fetchAusencias();
  }, [fetchAusencias]);

  return useMemo<UseAusenciasDelMesReturn>(() => {
    const alumnoPorId = new Map(alumnos.map((a) => [a.id, a]));
    const profePorId = new Map(profesGuias.map((p) => [p.id, p]));
    const instructorPorId = new Map(instructores.map((i) => [i.id, i]));

    const ausencias: AusenciaResuelta[] = rows.map((a) => {
      const alumno = alumnoPorId.get(a.alumnoId);
      const instructorId =
        a.instructorIdSnapshot || alumno?.instructorId || "";
      const profeGuiaId = a.profeGuiaIdSnapshot || alumno?.profeGuiaId || "";

      let profesionalNombre = "Sin asignar";
      let profesionalRol: AusenciaResuelta["profesionalRol"] = "sin-asignar";
      if (instructorId) {
        const inst = instructorPorId.get(instructorId);
        if (inst) {
          profesionalNombre = inst.nombreCompleto;
          profesionalRol = "instructor";
        }
      } else if (profeGuiaId) {
        const prof = profePorId.get(profeGuiaId);
        if (prof) {
          profesionalNombre = prof.nombre;
          profesionalRol = "profeGuia";
        }
      }

      return {
        asistencia: a,
        alumnoNombre: alumno?.nombre ?? "Alumno desconocido",
        profesionalNombre,
        profesionalRol,
      };
    });

    ausencias.sort((x, y) => {
      if (x.asistencia.fecha !== y.asistencia.fecha) {
        return y.asistencia.fecha.localeCompare(x.asistencia.fecha);
      }
      return x.alumnoNombre.localeCompare(y.alumnoNombre);
    });

    return { ausencias, isLoading, error };
  }, [rows, alumnos, profesGuias, instructores, isLoading, error]);
}
