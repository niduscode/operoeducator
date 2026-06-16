"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PreciosAlumnos } from "@/lib/types";
import {
  PRECIOS_ALUMNOS_COLLECTION,
  savePreciosAlumnos as fsSave,
} from "@/lib/firestore";

interface SavePreciosInput {
  Junior: number;
  Senior: number;
  Master: number;
  duracionJuniorClases?: number;
  duracionSeniorClases?: number;
  duracionMasterClases?: number;
}

interface UsePreciosAlumnosReturn {
  precios: PreciosAlumnos | null;
  isLoading: boolean;
  error: string | null;
  save: (data: SavePreciosInput, actualizadoPor: string) => Promise<void>;
}

export function usePreciosAlumnos(): UsePreciosAlumnosReturn {
  const [precios, setPrecios] = useState<PreciosAlumnos | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, PRECIOS_ALUMNOS_COLLECTION, "default");
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot<DocumentData>) => {
        if (!snap.exists()) {
          setPrecios(null);
        } else {
          const data = snap.data();
          // Solo aceptamos duraciones positivas; lo demás cae a undefined y la
          // UI usará DURACION_DEFAULT_CLASES.
          const dJ = Number(data?.duracionJuniorClases);
          const dS = Number(data?.duracionSeniorClases);
          const dM = Number(data?.duracionMasterClases);
          setPrecios({
            id: "default",
            Junior: Number(data?.Junior ?? 0),
            Senior: Number(data?.Senior ?? 0),
            Master: Number(data?.Master ?? 0),
            duracionJuniorClases:
              Number.isFinite(dJ) && dJ > 0 ? dJ : undefined,
            duracionSeniorClases:
              Number.isFinite(dS) && dS > 0 ? dS : undefined,
            duracionMasterClases:
              Number.isFinite(dM) && dM > 0 ? dM : undefined,
            actualizadoPor: data?.actualizadoPor ?? "",
            actualizadoEn: data?.actualizadoEn ?? "",
          });
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("usePreciosAlumnos onSnapshot:", err);
        setError("No se pudieron cargar los precios.");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const save = useCallback(
    (data: SavePreciosInput, actualizadoPor: string) =>
      fsSave(data, actualizadoPor),
    []
  );

  return useMemo(
    () => ({ precios, isLoading, error, save }),
    [precios, isLoading, error, save]
  );
}
