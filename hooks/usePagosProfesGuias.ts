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
  ProfeGuia,
  TarifasPorCurso,
} from "@/lib/types";
import {
  ALUMNOS_COLLECTION,
  ASISTENCIAS_ALUMNOS_COLLECTION,
  PROFES_GUIAS_COLLECTION,
  construirPagoCalculado,
  filtrarAsistenciasParaProfe,
} from "@/lib/firestore";
import { useConfigPagos } from "@/hooks/useConfigPagos";

interface UsePagosProfesGuiasReturn {
  pagos: PagoCalculado[];
  isLoading: boolean;
  totalAPagar: number;
  error: string | null;
}

const TARIFAS_VACIAS: TarifasPorCurso = { Junior: 0, Senior: 0, Master: 0 };

export function usePagosProfesGuias(
  mes: number,
  año: number
): UsePagosProfesGuiasReturn {
  const { config, isLoading: configLoading } = useConfigPagos();
  const [profes, setProfes] = useState<ProfeGuia[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [loadingProfes, setLoadingProfes] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingAsist, setLoadingAsist] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, PROFES_GUIAS_COLLECTION),
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: ProfeGuia[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            nombre: data.nombre ?? "",
            telefono: data.telefono ?? "",
            sucursal: data.sucursal,
            activo: data.activo ?? true,
            fechaIngreso: data.fechaIngreso ?? "",
          };
        });
        setProfes(rows);
        setLoadingProfes(false);
      },
      (err) => {
        console.error("usePagosProfesGuias profes:", err);
        setError("No se pudieron cargar los profes guías.");
        setLoadingProfes(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, ALUMNOS_COLLECTION),
      (snap: QuerySnapshot<DocumentData>) => {
        // Incluimos también alumnos inactivos: para asistencias legacy sin
        // profeGuiaIdSnapshot necesitamos su profeGuiaId actual como fallback.
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
            activo: data.activo ?? true,
          };
        });
        setAlumnos(rows);
        setLoadingAlumnos(false);
      },
      (err) => {
        console.error("usePagosProfesGuias alumnos:", err);
        setError("No se pudieron cargar los alumnos.");
        setLoadingAlumnos(false);
      }
    );
    return () => unsub();
  }, []);

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
          };
        });
        setAsistencias(rows);
        setLoadingAsist(false);
      },
      (err) => {
        console.error("usePagosProfesGuias asistencias:", err);
        setError("No se pudieron cargar las asistencias del mes.");
        setLoadingAsist(false);
      }
    );
    return () => unsub();
  }, [mes, año]);

  const pagos = useMemo<PagoCalculado[]>(() => {
    const tarifas = config?.tarifasProfeGuia ?? TARIFAS_VACIAS;
    const alumnosPorProfe = new Map<string, Set<string>>();
    for (const al of alumnos) {
      if (!al.profeGuiaId) continue;
      const set = alumnosPorProfe.get(al.profeGuiaId) ?? new Set<string>();
      set.add(al.id);
      alumnosPorProfe.set(al.profeGuiaId, set);
    }
    return profes
      .filter((p) => p.activo)
      .map((p) => {
        const propias = filtrarAsistenciasParaProfe(
          asistencias,
          p.id,
          alumnosPorProfe
        );
        return construirPagoCalculado({
          personaId: p.id,
          personaNombre: p.nombre,
          tipo: "profeGuia",
          sucursal: p.sucursal,
          mes,
          año,
          asistencias: propias,
          tarifas,
        });
      })
      .sort((a, b) => b.totalCLP - a.totalCLP);
  }, [profes, alumnos, asistencias, config, mes, año]);

  const totalAPagar = useMemo(
    () => pagos.reduce((acc, p) => acc + p.totalCLP, 0),
    [pagos]
  );

  return {
    pagos,
    isLoading: configLoading || loadingProfes || loadingAlumnos || loadingAsist,
    totalAPagar,
    error,
  };
}
