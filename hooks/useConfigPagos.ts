"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  DocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ConfigPagos, TarifasPorCurso } from "@/lib/types";
import {
  CONFIG_PAGOS_COLLECTION,
  saveConfigPagos as fsSave,
} from "@/lib/firestore";

interface SaveInput {
  tarifasInstructor: TarifasPorCurso;
  tarifasProfeGuia: TarifasPorCurso;
  montoInstructorPrimerAlumno?: number;
  montoInstructorAlumnoAdicional?: number;
}

interface UseConfigPagosReturn {
  config: ConfigPagos | null;
  isLoading: boolean;
  error: string | null;
  save: (data: SaveInput, actualizadoPor: string) => Promise<void>;
}

// Suscripción reactiva al singleton "configPagos/default".
export function useConfigPagos(): UseConfigPagosReturn {
  const [config, setConfig] = useState<ConfigPagos | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, CONFIG_PAGOS_COLLECTION, "default");
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot<DocumentData>) => {
        if (!snap.exists()) {
          setConfig(null);
        } else {
          const data = snap.data();
          setConfig({
            id: "default",
            montoInstructorPrimerAlumno: Number(
              data?.montoInstructorPrimerAlumno ?? 0
            ),
            montoInstructorAlumnoAdicional: Number(
              data?.montoInstructorAlumnoAdicional ?? 0
            ),
            tarifasInstructor: {
              Junior: Number(data?.tarifasInstructor?.Junior ?? 0),
              Senior: Number(data?.tarifasInstructor?.Senior ?? 0),
              Master: Number(data?.tarifasInstructor?.Master ?? 0),
            },
            tarifasProfeGuia: {
              Junior: Number(data?.tarifasProfeGuia?.Junior ?? 0),
              Senior: Number(data?.tarifasProfeGuia?.Senior ?? 0),
              Master: Number(data?.tarifasProfeGuia?.Master ?? 0),
            },
            actualizadoPor: data?.actualizadoPor ?? "",
            actualizadoEn: data?.actualizadoEn ?? "",
          });
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useConfigPagos onSnapshot:", err);
        setError("No se pudo cargar la configuración de pagos.");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const save = useCallback(
    (data: SaveInput, actualizadoPor: string) => fsSave(data, actualizadoPor),
    []
  );

  return useMemo(
    () => ({ config, isLoading, error, save }),
    [config, isLoading, error, save]
  );
}
