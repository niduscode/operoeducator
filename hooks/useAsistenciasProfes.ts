"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AsistenciaProfeGuia, Sucursal } from "@/lib/types";
import {
  ASISTENCIAS_PROFES_GUIAS_COLLECTION,
  AsistenciaProfeGuiaInput,
  registrarAsistenciaProfe as fsRegistrar,
  updateAsistenciaProfe as fsUpdate,
} from "@/lib/firestore";

interface UseAsistenciasProfesReturn {
  asistencias: AsistenciaProfeGuia[];
  isLoading: boolean;
  error: string | null;
  registrar: (data: AsistenciaProfeGuiaInput) => Promise<string>;
  actualizar: (
    id: string,
    data: Partial<AsistenciaProfeGuiaInput>
  ) => Promise<void>;
}

// Suscripción reactiva a las asistencias de profes guías para una sucursal y
// fecha. La toma el instructor desde su aula virtual.
export function useAsistenciasProfes(
  sucursal: Sucursal | null | undefined,
  fecha: string
): UseAsistenciasProfesReturn {
  const [asistencias, setAsistencias] = useState<AsistenciaProfeGuia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursal || !fecha) {
      setAsistencias([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(
      collection(db, ASISTENCIAS_PROFES_GUIAS_COLLECTION),
      where("sucursal", "==", sucursal),
      where("fecha", "==", fecha)
    );

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: AsistenciaProfeGuia[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            profeGuiaId: data.profeGuiaId ?? "",
            fecha: data.fecha ?? "",
            estado: data.estado ?? "Presente",
            observacion: data.observacion ?? "",
            registradaPor: data.registradaPor ?? "",
            sucursal: data.sucursal,
          };
        });
        setAsistencias(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useAsistenciasProfes onSnapshot:", err);
        setError("No se pudieron cargar las asistencias de profes guías.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [sucursal, fecha]);

  const registrar = useCallback(
    (data: AsistenciaProfeGuiaInput) => fsRegistrar(data),
    []
  );
  const actualizar = useCallback(
    (id: string, data: Partial<AsistenciaProfeGuiaInput>) => fsUpdate(id, data),
    []
  );

  return useMemo(
    () => ({ asistencias, isLoading, error, registrar, actualizar }),
    [asistencias, isLoading, error, registrar, actualizar]
  );
}
