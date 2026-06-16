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
import type {
  Alumno,
  AsistenciaAlumno,
  Instructor,
  PagoCalculado,
} from "@/lib/types";
import {
  ALUMNOS_COLLECTION,
  ASISTENCIAS_ALUMNOS_COLLECTION,
  INSTRUCTORES_COLLECTION,
  construirPagoCalculadoInstructorEscalado,
} from "@/lib/firestore";
import { useConfigPagos } from "@/hooks/useConfigPagos";

interface UsePagosInstructoresReturn {
  pagos: PagoCalculado[];
  isLoading: boolean;
  totalAPagar: number;
  error: string | null;
}

// Calcula reactivamente los pagos del mes para todos los instructores activos
// usando el MODELO NUEVO escalado (1er alumno + adicionales). Re-calcula
// cuando cambian las asistencias del mes, los instructores, los alumnos
// asignados (fallback legacy) o la configuración de montos.
export function usePagosInstructores(
  mes: number,
  año: number
): UsePagosInstructoresReturn {
  const { config, isLoading: configLoading } = useConfigPagos();
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loadingInst, setLoadingInst] = useState(true);
  const [loadingAsist, setLoadingAsist] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub a instructores.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, INSTRUCTORES_COLLECTION),
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: Instructor[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            username: data.username ?? "",
            email: data.email ?? "",
            nombreCompleto: data.nombreCompleto ?? "",
            telefono: data.telefono ?? "",
            sucursalActual: data.sucursalActual,
            activo: data.activo ?? true,
            fechaIngreso: data.fechaIngreso ?? "",
            fechaCreacion: data.fechaCreacion ?? "",
            creadoPor: data.creadoPor ?? "",
            authVerificado: data.authVerificado ?? false,
          };
        });
        setInstructores(rows);
        setLoadingInst(false);
      },
      (err) => {
        console.error("usePagosInstructores instructores:", err);
        setError("No se pudieron cargar los instructores.");
        setLoadingInst(false);
      }
    );
    return () => unsub();
  }, []);

  // Sub a alumnos (necesarios como fallback para asistencias legacy sin
  // instructorIdSnapshot).
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, ALUMNOS_COLLECTION),
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: Alumno[] = snap.docs.map((d) => {
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
          };
        });
        setAlumnos(rows);
        setLoadingAlumnos(false);
      },
      (err) => {
        console.error("usePagosInstructores alumnos:", err);
        setError("No se pudieron cargar los alumnos.");
        setLoadingAlumnos(false);
      }
    );
    return () => unsub();
  }, []);

  // Sub a asistencias del mes.
  useEffect(() => {
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;

    setLoadingAsist(true);
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS_COLLECTION),
      where("fecha", ">=", desde),
      where("fecha", "<=", hasta)
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
            instructorIdSnapshot:
              typeof data.instructorIdSnapshot === "string"
                ? data.instructorIdSnapshot
                : undefined,
          };
        });
        setAsistencias(rows);
        setLoadingAsist(false);
      },
      (err) => {
        console.error("usePagosInstructores asistencias:", err);
        setError("No se pudieron cargar las asistencias del mes.");
        setLoadingAsist(false);
      }
    );
    return () => unsub();
  }, [mes, año]);

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
