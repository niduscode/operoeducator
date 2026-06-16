"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Alumno,
  AsistenciaAlumno,
  PagoCalculado,
  ProfeGuia,
  Sucursal,
  TarifasPorCurso,
} from "@/lib/database.types";
import {
  getAlumnos,
  getProfesGuias,
  getAsistenciasEnRango,
} from "@/lib/queries";
import {
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

// Cálculo lineal del pago a profes guías del mes:
//   tarifa por curso × alumnos asistidos (Presente/Tarde), atribuidos por
//   profeGuiaIdSnapshot histórico — fallback al profeGuiaId actual del alumno
//   para asistencias legacy. Listas grandes → fetch al montar + refetch via
//   nonce, sin Realtime.
export function usePagosProfesGuias(
  mes: number,
  año: number,
  sucursal?: Sucursal
): UsePagosProfesGuiasReturn {
  const { config, isLoading: configLoading } = useConfigPagos();
  const [profes, setProfes] = useState<ProfeGuia[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaAlumno[]>([]);
  const [loadingProfes, setLoadingProfes] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingAsist, setLoadingAsist] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profes guías (todos; el filtro de activos se aplica al armar `pagos`).
  // Si se pidió una sucursal, filtra al fetch para reducir payload.
  useEffect(() => {
    let cancelled = false;
    setLoadingProfes(true);
    (async () => {
      try {
        const rows = await getProfesGuias();
        if (cancelled) return;
        setProfes(sucursal ? rows.filter((p) => p.sucursal === sucursal) : rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("usePagosProfesGuias profes:", err);
        setError("No se pudieron cargar los profes guías.");
      } finally {
        if (!cancelled) setLoadingProfes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sucursal]);

  // Alumnos (incluye inactivos para fallback de asistencias legacy sin
  // profeGuiaIdSnapshot).
  useEffect(() => {
    let cancelled = false;
    setLoadingAlumnos(true);
    (async () => {
      try {
        const rows = await getAlumnos();
        if (cancelled) return;
        setAlumnos(
          sucursal ? rows.filter((a) => a.sucursal === sucursal) : rows
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("usePagosProfesGuias alumnos:", err);
        setError("No se pudieron cargar los alumnos.");
      } finally {
        if (!cancelled) setLoadingAlumnos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sucursal]);

  // Asistencias del mes, opcionalmente filtradas por sucursal.
  useEffect(() => {
    let cancelled = false;
    setLoadingAsist(true);
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    (async () => {
      try {
        const rows = await getAsistenciasEnRango(sucursal ?? null, desde, hasta);
        if (cancelled) return;
        setAsistencias(rows);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("usePagosProfesGuias asistencias:", err);
        setError("No se pudieron cargar las asistencias del mes.");
      } finally {
        if (!cancelled) setLoadingAsist(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mes, año, sucursal]);

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
