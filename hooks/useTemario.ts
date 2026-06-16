"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Curso, TemaSemana, TemarioCurso } from "@/lib/types";
import {
  TEMARIOS_COLLECTION,
  TemarioInput,
  calcularSemanaActual,
  saveTemario as fsSave,
} from "@/lib/firestore";

interface UseTemarioReturn {
  temario: TemarioCurso | null;
  semanaActual: TemaSemana | null;
  isLoading: boolean;
  error: string | null;
  save: (data: TemarioInput) => Promise<void>;
}

// Suscripción reactiva al temario de un curso. Calcula también la semana
// actual a partir de hoy y de fechaInicio del temario.
export function useTemario(curso: Curso | null | undefined): UseTemarioReturn {
  const [temario, setTemario] = useState<TemarioCurso | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curso) {
      setTemario(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ref = doc(db, TEMARIOS_COLLECTION, curso);
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot<DocumentData>) => {
        if (!snap.exists()) {
          setTemario(null);
        } else {
          const data = snap.data();
          setTemario({
            id: snap.id,
            curso: (data?.curso ?? curso) as Curso,
            semanas: Array.isArray(data?.semanas)
              ? (data.semanas as TemaSemana[])
              : [],
            fechaInicio: data?.fechaInicio ?? "",
            actualizadoPor: data?.actualizadoPor ?? "",
            actualizadoEn: data?.actualizadoEn ?? "",
          });
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useTemario onSnapshot:", err);
        setError("No se pudo cargar el temario del curso.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [curso]);

  const semanaActual = useMemo<TemaSemana | null>(() => {
    if (!temario) return null;
    return calcularSemanaActual(temario);
  }, [temario]);

  const save = useCallback(
    async (data: TemarioInput) => {
      if (!curso) throw new Error("Curso no especificado.");
      await fsSave(curso, data);
    },
    [curso]
  );

  return useMemo(
    () => ({ temario, semanaActual, isLoading, error, save }),
    [temario, semanaActual, isLoading, error, save]
  );
}
