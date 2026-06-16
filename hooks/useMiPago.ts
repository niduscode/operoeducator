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
  PagoCalculado,
} from "@/lib/types";
import {
  ALUMNOS_COLLECTION,
  ASISTENCIAS_ALUMNOS_COLLECTION,
  construirPagoCalculadoInstructorEscalado,
} from "@/lib/firestore";
import { useConfigPagos } from "@/hooks/useConfigPagos";
import { useMiPerfil } from "@/hooks/useMiPerfil";

interface UseMiPagoReturn {
  pago: PagoCalculado | null;
  isLoading: boolean;
  error: string | null;
}

// Calcula reactivamente el pago del instructor logueado para un mes/año
// usando el modelo NUEVO escalado (1er alumno + adicionales).
export function useMiPago(mes: number, año: number): UseMiPagoReturn {
  const { perfil, isLoading: perfilLoading } = useMiPerfil();
  const { config, isLoading: configLoading } = useConfigPagos();

  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [alumnosAsignados, setAlumnosAsignados] = useState<Alumno[]>([]);
  const [loadingAsist, setLoadingAsist] = useState(true);
  const [loadingAsig, setLoadingAsig] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const username = perfil?.username ?? null;
  const instructorId = perfil?.id ?? null;

  // Asistencias del mes registradas por mí.
  useEffect(() => {
    if (!username) {
      setAsistencias([]);
      setLoadingAsist(false);
      return;
    }
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    setLoadingAsist(true);
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS_COLLECTION),
      where("registradaPor", "==", username),
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
        console.error("useMiPago asistencias:", err);
        setError("No se pudieron cargar tus asistencias del mes.");
        setLoadingAsist(false);
      }
    );
    return () => unsub();
  }, [username, mes, año]);

  // Alumnos asignados HOY a este instructor (fallback legacy para asistencias
  // sin instructorIdSnapshot).
  useEffect(() => {
    if (!instructorId) {
      setAlumnosAsignados([]);
      setLoadingAsig(false);
      return;
    }
    setLoadingAsig(true);
    const q = query(
      collection(db, ALUMNOS_COLLECTION),
      where("instructorId", "==", instructorId)
    );
    const unsub = onSnapshot(
      q,
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
        setAlumnosAsignados(rows);
        setLoadingAsig(false);
      },
      (err) => {
        console.error("useMiPago alumnos asignados:", err);
        setLoadingAsig(false);
      }
    );
    return () => unsub();
  }, [instructorId]);

  const pago = useMemo<PagoCalculado | null>(() => {
    if (!perfil) return null;
    const montoPrimero = config?.montoInstructorPrimerAlumno ?? 0;
    const montoAdicional = config?.montoInstructorAlumnoAdicional ?? 0;
    const setIds = new Set(alumnosAsignados.map((a) => a.id));
    return construirPagoCalculadoInstructorEscalado({
      instructorId: perfil.id,
      instructorNombre: perfil.nombreCompleto,
      sucursal: perfil.sucursalActual,
      mes,
      año,
      asistencias,
      alumnosDeEsteInstructor: setIds,
      montoPrimerAlumno: montoPrimero,
      montoAlumnoAdicional: montoAdicional,
    });
  }, [perfil, config, asistencias, alumnosAsignados, mes, año]);

  return {
    pago,
    isLoading: perfilLoading || configLoading || loadingAsist || loadingAsig,
    error,
  };
}
