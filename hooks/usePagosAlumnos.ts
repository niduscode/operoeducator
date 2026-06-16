"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  QueryConstraint,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PagoAlumno, Sucursal } from "@/lib/types";
import {
  PAGOS_ALUMNOS_COLLECTION,
  PagoAlumnoInput,
  registrarPagoAlumno as fsRegistrar,
  actualizarPagoAlumno as fsActualizar,
  eliminarPagoAlumno as fsEliminar,
} from "@/lib/firestore";

interface UsePagosAlumnosReturn {
  pagos: PagoAlumno[];
  isLoading: boolean;
  error: string | null;
  registrarPago: (data: PagoAlumnoInput) => Promise<string>;
  actualizarPago: (id: string, data: Partial<PagoAlumnoInput>) => Promise<void>;
  eliminarPago: (id: string) => Promise<void>;
}

// Reactivo: filtra por mes/año (siempre) y opcionalmente por sucursal.
// Las queries con tres `where` igualdad no requieren índice compuesto en
// Firestore, así que esto se resuelve sin configuración adicional.
export function usePagosAlumnos(
  mes: number,
  año: number,
  sucursal?: Sucursal | null
): UsePagosAlumnosReturn {
  const [pagos, setPagos] = useState<PagoAlumno[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const constraints: QueryConstraint[] = [
      where("mes", "==", mes),
      where("año", "==", año),
    ];
    if (sucursal) constraints.push(where("sucursal", "==", sucursal));
    const q = query(collection(db, PAGOS_ALUMNOS_COLLECTION), ...constraints);
    setIsLoading(true);
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: PagoAlumno[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            alumnoId: data.alumnoId ?? "",
            alumnoNombre: data.alumnoNombre ?? "",
            curso: data.curso,
            sucursal: data.sucursal,
            mes: typeof data.mes === "number" ? data.mes : Number(data.mes) || 0,
            año: typeof data.año === "number" ? data.año : Number(data.año) || 0,
            monto: Number(data.monto) || 0,
            fechaPago: data.fechaPago ?? "",
            medioPago: data.medioPago ?? "Transferencia",
            tipoPago: data.tipoPago ?? "Total",
            comprobanteUrl: data.comprobanteUrl ?? "",
            comprobanteNombre: data.comprobanteNombre ?? "",
            observacion: data.observacion ?? "",
            registradoPor: data.registradoPor ?? "",
            registradoEn: data.registradoEn ?? "",
          };
        });
        setPagos(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("usePagosAlumnos onSnapshot:", err);
        setError("No se pudieron cargar los pagos del mes.");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [mes, año, sucursal]);

  const registrarPago = useCallback(
    (data: PagoAlumnoInput) => fsRegistrar(data),
    []
  );
  const actualizarPago = useCallback(
    (id: string, data: Partial<PagoAlumnoInput>) => fsActualizar(id, data),
    []
  );
  const eliminarPago = useCallback((id: string) => fsEliminar(id), []);

  return useMemo(
    () => ({
      pagos,
      isLoading,
      error,
      registrarPago,
      actualizarPago,
      eliminarPago,
    }),
    [pagos, isLoading, error, registrarPago, actualizarPago, eliminarPago]
  );
}
