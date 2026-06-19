"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getAlumnos,
  getPagosDelMes,
  getPreciosAlumnos,
} from "@/lib/queries";
import type { Alumno, PagoAlumno, PreciosAlumnos } from "@/lib/database.types";

interface UseEstadoMorosidadReturn {
  alumnosAlDia: Alumno[];
  alumnosConDeuda: Alumno[];
  totalRecaudado: number;
  totalEsperado: number;
  parcialIds: Set<string>;
  montoPagadoPorAlumno: Map<string, number>;
  isLoading: boolean;
  error: string | null;
}

export function useEstadoMorosidad(
  mes: number,
  año: number
): UseEstadoMorosidadReturn {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [pagos, setPagos] = useState<PagoAlumno[]>([]);
  const [precios, setPrecios] = useState<PreciosAlumnos | null>(null);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [loadingPrecios, setLoadingPrecios] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ID único por instancia para que los canales Realtime no choquen si el
  // hook se monta múltiples veces en la misma página (Supabase reutiliza
  // canales por nombre y rechaza .on() después de .subscribe()).
  const instanceId = useId();

  const fetchAlumnos = useCallback(async () => {
    try {
      const rows = await getAlumnos();
      setAlumnos(rows.filter((a) => a.activo !== false));
    } catch (err) {
      console.error("useEstadoMorosidad alumnos:", err);
      setError("No se pudieron cargar los alumnos.");
    } finally {
      setLoadingAlumnos(false);
    }
  }, []);

  const fetchPagos = useCallback(async () => {
    try {
      const rows = await getPagosDelMes(año, mes);
      setPagos(rows);
    } catch (err) {
      console.error("useEstadoMorosidad pagos:", err);
      setError("No se pudieron cargar los pagos del mes.");
    } finally {
      setLoadingPagos(false);
    }
  }, [mes, año]);

  const fetchPrecios = useCallback(async () => {
    try {
      const data = await getPreciosAlumnos();
      setPrecios(data);
    } catch (err) {
      console.error("useEstadoMorosidad precios:", err);
      setError("No se pudieron cargar los precios.");
      setPrecios(null);
    } finally {
      setLoadingPrecios(false);
    }
  }, []);

  useEffect(() => {
    setLoadingAlumnos(true);
    fetchAlumnos();
    const channel = supabase
      .channel(`estado-morosidad-alumnos-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alumnos" },
        () => {
          fetchAlumnos();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlumnos, instanceId]);

  useEffect(() => {
    setLoadingPagos(true);
    fetchPagos();
    const channel = supabase
      .channel(`estado-morosidad-pagos-${año}-${mes}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pagos_alumnos",
          filter: `anio=eq.${año}`,
        },
        () => {
          fetchPagos();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPagos, mes, año, instanceId]);

  useEffect(() => {
    setLoadingPrecios(true);
    fetchPrecios();
    const channel = supabase
      .channel(`estado-morosidad-precios-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "precios_alumnos" },
        () => {
          fetchPrecios();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPrecios, instanceId]);

  return useMemo<UseEstadoMorosidadReturn>(() => {
    const totalRecaudado = pagos.reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalEsperado = alumnos.reduce((acc, a) => {
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      return acc + precio;
    }, 0);

    const montoPagadoPorAlumno = new Map<string, number>();
    for (const p of pagos) {
      montoPagadoPorAlumno.set(
        p.alumnoId,
        (montoPagadoPorAlumno.get(p.alumnoId) ?? 0) + (p.monto || 0)
      );
    }

    const alumnosAlDia: Alumno[] = [];
    const alumnosConDeuda: Alumno[] = [];
    const parcialIds = new Set<string>();
    for (const a of alumnos) {
      const pagado = montoPagadoPorAlumno.get(a.id) ?? 0;
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      if (precio > 0) {
        if (pagado >= precio) {
          alumnosAlDia.push(a);
        } else {
          alumnosConDeuda.push(a);
          if (pagado > 0) parcialIds.add(a.id);
        }
      } else {
        if (pagado > 0) alumnosAlDia.push(a);
        else alumnosConDeuda.push(a);
      }
    }
    return {
      alumnosAlDia,
      alumnosConDeuda,
      totalRecaudado,
      totalEsperado,
      parcialIds,
      montoPagadoPorAlumno,
      isLoading: loadingAlumnos || loadingPagos || loadingPrecios,
      error,
    };
  }, [alumnos, pagos, precios, loadingAlumnos, loadingPagos, loadingPrecios, error]);
}
