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
import type { ProfeGuia, Sucursal } from "@/lib/types";
import {
  PROFES_GUIAS_COLLECTION,
  ProfeGuiaInput,
  createProfeGuia as fsCreateProfeGuia,
  updateProfeGuia as fsUpdateProfeGuia,
  deleteProfeGuia as fsDeleteProfeGuia,
  reactivateProfeGuia as fsReactivateProfeGuia,
  createProfesGuiasMasivo as fsImportMasivo,
} from "@/lib/firestore";

interface UseProfesGuiasReturn {
  profesGuias: ProfeGuia[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createProfeGuia: (data: ProfeGuiaInput) => Promise<string>;
  updateProfeGuia: (id: string, data: Partial<ProfeGuiaInput>) => Promise<void>;
  deleteProfeGuia: (id: string) => Promise<void>;
  reactivateProfeGuia: (id: string) => Promise<void>;
  importMasivo: (data: ProfeGuiaInput[]) => Promise<string[]>;
}

interface UseProfesGuiasOptions {
  // Por defecto sólo devuelve activos. Pasa true para mostrar desactivados.
  incluirInactivos?: boolean;
}

export function useProfesGuias(
  sucursal?: Sucursal | null,
  options?: UseProfesGuiasOptions
): UseProfesGuiasReturn {
  const incluirInactivos = options?.incluirInactivos ?? false;
  const [profesGuias, setProfesGuias] = useState<ProfeGuia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const base = collection(db, PROFES_GUIAS_COLLECTION);
    const q = sucursal ? query(base, where("sucursal", "==", sucursal)) : base;

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: ProfeGuia[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              nombre: data.nombre ?? "",
              telefono: data.telefono ?? "",
              sucursal: data.sucursal,
              activo: data.activo ?? true,
              fechaIngreso: data.fechaIngreso ?? "",
            } as ProfeGuia;
          })
          .filter((p) => incluirInactivos || p.activo !== false);
        setProfesGuias(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useProfesGuias onSnapshot:", err);
        setError("No se pudieron cargar los profes guías en tiempo real.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [sucursal, nonce, incluirInactivos]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const createProfeGuia = useCallback(
    (data: ProfeGuiaInput) => fsCreateProfeGuia(data),
    []
  );
  const updateProfeGuia = useCallback(
    (id: string, data: Partial<ProfeGuiaInput>) => fsUpdateProfeGuia(id, data),
    []
  );
  const deleteProfeGuia = useCallback(
    (id: string) => fsDeleteProfeGuia(id),
    []
  );
  const reactivateProfeGuia = useCallback(
    (id: string) => fsReactivateProfeGuia(id),
    []
  );
  const importMasivo = useCallback(
    (data: ProfeGuiaInput[]) => fsImportMasivo(data),
    []
  );

  return useMemo(
    () => ({
      profesGuias,
      isLoading,
      error,
      refetch,
      createProfeGuia,
      updateProfeGuia,
      deleteProfeGuia,
      reactivateProfeGuia,
      importMasivo,
    }),
    [
      profesGuias,
      isLoading,
      error,
      refetch,
      createProfeGuia,
      updateProfeGuia,
      deleteProfeGuia,
      reactivateProfeGuia,
      importMasivo,
    ]
  );
}
