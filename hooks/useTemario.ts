"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Curso, TemaSemana, TemarioCurso } from "@/lib/database.types";
import {
  getTemarioCurso,
  upsertTemarioCurso,
  upsertSemanaTemario,
  deleteSemanaTemario,
} from "@/lib/queries";

interface UseTemarioReturn {
  temario: TemarioCurso | null;
  semanaActual: TemaSemana | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  upsertSemana: (semana: TemaSemana) => Promise<void>;
  upsertTemario: (fechaInicio: string, actualizadoPor: string) => Promise<void>;
  deleteSemana: (semanaNumero: number) => Promise<void>;
  // Compat con la API vieja: save reemplaza atómicamente el temario
  // completo (fechaInicio + lista de semanas) en una sola transacción
  // lógica. Usado por /temario. `actualizadoEn` se setea automáticamente.
  save: (data: Omit<TemarioCurso, "actualizadoEn">) => Promise<void>;
}

// Parser local que evita el shift de zona horaria de new Date("YYYY-MM-DD").
function parseISODateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, yStr, moStr, dStr] = m;
  return new Date(Number(yStr), Number(moStr) - 1, Number(dStr));
}

// Calcula la semana actual a partir de hoy y de fechaInicio (primer martes del curso).
// Retorna null si el curso no ha empezado, si no hay temario o si la semana
// calculada está fuera del rango cargado.
function calcularSemanaActual(
  temario: TemarioCurso,
  hoy: Date = new Date()
): TemaSemana | null {
  if (!temario.fechaInicio) return null;
  const inicio = parseISODateLocal(temario.fechaInicio);
  if (!inicio) return null;
  // Trabajamos a nivel "día" en zona local (descartamos horas).
  const hoyDay = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const inicioDay = new Date(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate()
  );
  const diffMs = hoyDay.getTime() - inicioDay.getTime();
  if (diffMs < 0) return null;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const idx = Math.floor(diffDays / 7); // 0-based
  return temario.semanas[idx] ?? null;
}

// Temario reactivo por curso. Fetch al montar + Realtime sobre temarios y
// semanas_temario filtrados por curso. semanaActual se deriva en cliente a
// partir de fechaInicio.
export function useTemario(curso: Curso): UseTemarioReturn {
  const [temario, setTemario] = useState<TemarioCurso | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Bump this to forzar refetch manual.
  const [nonce, setNonce] = useState(0);

  // Guardamos la última referencia a fetch para que el handler de realtime
  // siempre consuma el curso vigente sin recrear la suscripción.
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const doFetch = useCallback(async () => {
    try {
      const t = await getTemarioCurso(curso);
      setTemario(t);
      setError(null);
    } catch (err) {
      console.error("useTemario fetch:", err);
      setError("No se pudo cargar el temario del curso.");
    } finally {
      setIsLoading(false);
    }
  }, [curso]);

  useEffect(() => {
    fetchRef.current = doFetch;
  }, [doFetch]);

  useEffect(() => {
    setIsLoading(true);
    void doFetch();

    const channel = supabase
      .channel(`temario-${curso}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "temarios",
          filter: `curso=eq.${curso}`,
        },
        () => {
          void fetchRef.current();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "semanas_temario",
          filter: `curso=eq.${curso}`,
        },
        () => {
          void fetchRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [curso, nonce, doFetch]);

  const semanaActual = useMemo<TemaSemana | null>(() => {
    if (!temario) return null;
    return calcularSemanaActual(temario);
  }, [temario]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const upsertSemana = useCallback(
    (semana: TemaSemana) => upsertSemanaTemario(curso, semana),
    [curso]
  );

  const upsertTemario = useCallback(
    (fechaInicio: string, actualizadoPor: string) =>
      upsertTemarioCurso(curso, fechaInicio, actualizadoPor),
    [curso]
  );

  const deleteSemana = useCallback(
    (semanaNumero: number) => deleteSemanaTemario(curso, semanaNumero),
    [curso]
  );

  // Compat: guarda atómicamente fechaInicio + todas las semanas.
  // En Postgres no hay un equivalente directo al "save de TemarioCurso" del
  // viejo Firestore (que reemplazaba el doc completo). Acá hacemos:
  //   1) upsert del temario (fechaInicio)
  //   2) upsert de cada semana
  //   3) borrar semanas excedentes (si redujo el número total)
  const save = useCallback(
    async (data: Omit<TemarioCurso, "actualizadoEn">) => {
      await upsertTemarioCurso(data.curso, data.fechaInicio, data.actualizadoPor);
      for (const semana of data.semanas) {
        await upsertSemanaTemario(data.curso, semana);
      }
      // Limpiar semanas que ya no están en data.semanas.
      const existentesIds = new Set(data.semanas.map((s) => s.semanaNumero));
      const actual = await getTemarioCurso(data.curso);
      if (actual) {
        for (const s of actual.semanas) {
          if (!existentesIds.has(s.semanaNumero)) {
            await deleteSemanaTemario(data.curso, s.semanaNumero);
          }
        }
      }
      setNonce((n) => n + 1);
    },
    []
  );

  return useMemo(
    () => ({
      temario,
      semanaActual,
      isLoading,
      error,
      refetch,
      upsertSemana,
      upsertTemario,
      deleteSemana,
      save,
    }),
    [
      temario,
      semanaActual,
      isLoading,
      error,
      refetch,
      upsertSemana,
      upsertTemario,
      deleteSemana,
      save,
    ]
  );
}
