"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AsistenciaAlumno } from "@/lib/types";
import { ASISTENCIAS_ALUMNOS_COLLECTION } from "@/lib/firestore";
import { useAlumnos } from "./useAlumnos";
import { useProfesGuias } from "./useProfesGuias";
import { useInstructores } from "./useInstructores";

export interface AusenciaResuelta {
  asistencia: AsistenciaAlumno;
  alumnoNombre: string;
  // Profesional a cargo. Preferimos los snapshots de la asistencia (verdad
  // histórica), con fallback al estado actual del alumno cuando son legacy.
  profesionalNombre: string;
  profesionalRol: "instructor" | "profeGuia" | "sin-asignar";
}

interface UseAusenciasDelMesReturn {
  ausencias: AusenciaResuelta[];
  isLoading: boolean;
  error: string | null;
}

// Devuelve todas las asistencias con estado "Ausente" del mes/año dados,
// resolviendo el profesional responsable. Sirve para que el admin entienda
// por qué un instructor o profe guía cobrará menos en su liquidación.
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

  useEffect(() => {
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    setIsLoading(true);
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS_COLLECTION),
      where("estado", "==", "Ausente"),
      where("fecha", ">=", desde),
      where("fecha", "<=", hasta)
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const data: AsistenciaAlumno[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            alumnoId: v.alumnoId ?? "",
            fecha: v.fecha ?? "",
            estado: "Ausente",
            observacion: v.observacion ?? "",
            registradaPor: v.registradaPor ?? "",
            sucursal: v.sucursal,
            curso: v.curso,
            turno: v.turno,
            tarifaInstructorAplicada:
              typeof v.tarifaInstructorAplicada === "number"
                ? v.tarifaInstructorAplicada
                : undefined,
            tarifaProfeGuiaAplicada:
              typeof v.tarifaProfeGuiaAplicada === "number"
                ? v.tarifaProfeGuiaAplicada
                : undefined,
            profeGuiaIdSnapshot:
              typeof v.profeGuiaIdSnapshot === "string"
                ? v.profeGuiaIdSnapshot
                : undefined,
            instructorIdSnapshot:
              typeof v.instructorIdSnapshot === "string"
                ? v.instructorIdSnapshot
                : undefined,
          };
        });
        setRows(data);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useAusenciasDelMes:", err);
        setError("No se pudieron cargar las ausencias del mes.");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [mes, año]);

  return useMemo<UseAusenciasDelMesReturn>(() => {
    const alumnoPorId = new Map(alumnos.map((a) => [a.id, a]));
    const profePorId = new Map(profesGuias.map((p) => [p.id, p]));
    const instructorPorId = new Map(instructores.map((i) => [i.id, i]));

    const ausencias: AusenciaResuelta[] = rows.map((a) => {
      const alumno = alumnoPorId.get(a.alumnoId);
      // Resolución del profesional: snapshots primero, luego estado actual.
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

    // Orden por fecha desc; empate → alumno.
    ausencias.sort((x, y) => {
      if (x.asistencia.fecha !== y.asistencia.fecha) {
        return y.asistencia.fecha.localeCompare(x.asistencia.fecha);
      }
      return x.alumnoNombre.localeCompare(y.alumnoNombre);
    });

    return { ausencias, isLoading, error };
  }, [rows, alumnos, profesGuias, instructores, isLoading, error]);
}
