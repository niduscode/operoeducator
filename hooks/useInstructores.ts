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
import type { Instructor, Sucursal } from "@/lib/types";
import {
  INSTRUCTORES_COLLECTION,
  InstructorInput,
  createInstructor as fsCreateInstructor,
  updateInstructor as fsUpdateInstructor,
  deactivateInstructor as fsDeactivateInstructor,
  reasignarSucursal as fsReasignarSucursal,
} from "@/lib/firestore";

interface UseInstructoresReturn {
  instructores: Instructor[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createInstructor: (data: InstructorInput) => Promise<string>;
  updateInstructor: (
    id: string,
    data: Partial<InstructorInput>
  ) => Promise<void>;
  deactivateInstructor: (id: string) => Promise<void>;
  reasignarSucursal: (
    instructorId: string,
    nuevaSucursal: Sucursal,
    cambiadoPor: string,
    razon?: string
  ) => Promise<void>;
}

// Si pasas `sucursal`, la suscripción se filtra server-side.
// Pensado para tarjetas/listados específicos por sucursal en el panel director.
export function useInstructores(
  sucursal?: Sucursal | null
): UseInstructoresReturn {
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const base = collection(db, INSTRUCTORES_COLLECTION);
    const q = sucursal
      ? query(base, where("sucursalActual", "==", sucursal))
      : base;

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: Instructor[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            username: data.username ?? "",
            email: data.email ?? "",
            nombreCompleto: data.nombreCompleto ?? "",
            telefono: data.telefono ?? "",
            sucursalActual: data.sucursalActual,
            activo: data.activo ?? true,
            fechaIngreso: data.fechaIngreso ?? "",
            fechaCreacion: data.fechaCreacion ?? "",
            creadoPor: data.creadoPor ?? "",
            authVerificado: data.authVerificado ?? false,
          };
        });
        setInstructores(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useInstructores onSnapshot:", err);
        setError("No se pudieron cargar los instructores en tiempo real.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [sucursal, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const createInstructor = useCallback(
    (data: InstructorInput) => fsCreateInstructor(data),
    []
  );
  const updateInstructor = useCallback(
    (id: string, data: Partial<InstructorInput>) =>
      fsUpdateInstructor(id, data),
    []
  );
  const deactivateInstructor = useCallback(
    (id: string) => fsDeactivateInstructor(id),
    []
  );
  const reasignarSucursal = useCallback(
    (
      instructorId: string,
      nuevaSucursal: Sucursal,
      cambiadoPor: string,
      razon?: string
    ) => fsReasignarSucursal(instructorId, nuevaSucursal, cambiadoPor, razon),
    []
  );

  return useMemo(
    () => ({
      instructores,
      isLoading,
      error,
      refetch,
      createInstructor,
      updateInstructor,
      deactivateInstructor,
      reasignarSucursal,
    }),
    [
      instructores,
      isLoading,
      error,
      refetch,
      createInstructor,
      updateInstructor,
      deactivateInstructor,
      reasignarSucursal,
    ]
  );
}
