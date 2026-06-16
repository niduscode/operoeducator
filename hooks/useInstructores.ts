"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  HistorialAsignacion,
  Instructor,
  Sucursal,
} from "@/lib/database.types";
import {
  createInstructor as qCreateInstructor,
  deactivateInstructor as qDeactivateInstructor,
  getHistorialPorInstructor as qGetHistorial,
  getInstructores as qGetInstructores,
  getInstructoresPorSucursal as qGetInstructoresPorSucursal,
  marcarAuthVerificado as qMarcarAuthVerificado,
  reactivateInstructor as qReactivateInstructor,
  reasignarSucursalInstructor as qReasignarSucursal,
  updateInstructor as qUpdateInstructor,
} from "@/lib/queries";

type InstructorInput = Omit<Instructor, "id" | "fechaCreacion">;

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
  reactivateInstructor: (id: string) => Promise<void>;
  reasignarSucursal: (
    instructorId: string,
    nueva: Sucursal,
    razon: string,
    cambiadoPor: string
  ) => Promise<void>;
  marcarAuthVerificado: (id: string) => Promise<void>;
  historialDe: (id: string) => Promise<HistorialAsignacion[]>;
}

export function useInstructores(
  sucursal?: Sucursal | null
): UseInstructoresReturn {
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const rows = sucursal
        ? await qGetInstructoresPorSucursal(sucursal)
        : await qGetInstructores();
      setInstructores(rows);
    } catch (err) {
      console.error("useInstructores fetch:", err);
      setError("No se pudieron cargar los instructores.");
    } finally {
      setIsLoading(false);
    }
  }, [sucursal]);

  useEffect(() => {
    setIsLoading(true);
    void fetchData();
  }, [fetchData, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const createInstructor = useCallback(
    async (data: InstructorInput) => {
      const id = await qCreateInstructor(data);
      setNonce((n) => n + 1);
      return id;
    },
    []
  );

  const updateInstructor = useCallback(
    async (id: string, data: Partial<InstructorInput>) => {
      await qUpdateInstructor(id, data);
      setNonce((n) => n + 1);
    },
    []
  );

  const deactivateInstructor = useCallback(async (id: string) => {
    await qDeactivateInstructor(id);
    setNonce((n) => n + 1);
  }, []);

  const reactivateInstructor = useCallback(async (id: string) => {
    await qReactivateInstructor(id);
    setNonce((n) => n + 1);
  }, []);

  const reasignarSucursal = useCallback(
    async (
      instructorId: string,
      nueva: Sucursal,
      razon: string,
      cambiadoPor: string
    ) => {
      await qReasignarSucursal(instructorId, nueva, razon, cambiadoPor);
      setNonce((n) => n + 1);
    },
    []
  );

  const marcarAuthVerificado = useCallback(async (id: string) => {
    await qMarcarAuthVerificado(id);
    setNonce((n) => n + 1);
  }, []);

  const historialDe = useCallback(
    (id: string) => qGetHistorial(id),
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
      reactivateInstructor,
      reasignarSucursal,
      marcarAuthVerificado,
      historialDe,
    }),
    [
      instructores,
      isLoading,
      error,
      refetch,
      createInstructor,
      updateInstructor,
      deactivateInstructor,
      reactivateInstructor,
      reasignarSucursal,
      marcarAuthVerificado,
      historialDe,
    ]
  );
}
