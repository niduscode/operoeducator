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
import type { PagoRealizado } from "@/lib/types";
import {
  PAGOS_REALIZADOS_COLLECTION,
  type PagoRealizadoInput,
  marcarPagoRealizado,
  eliminarPagoRealizado,
} from "@/lib/firestore";

interface UsePagosRealizadosReturn {
  pagos: PagoRealizado[];
  isLoading: boolean;
  error: string | null;
  marcar: (data: PagoRealizadoInput) => Promise<string>;
  desmarcar: (id: string) => Promise<void>;
  // Lookup helper: dada una persona y tipo, devuelve el doc si está pagado.
  buscar: (
    tipo: "instructor" | "profeGuia",
    personaId: string
  ) => PagoRealizado | undefined;
}

// Suscripción reactiva a los pagos realizados de un mes/año.
export function usePagosRealizados(
  mes: number,
  año: number
): UsePagosRealizadosReturn {
  const [pagos, setPagos] = useState<PagoRealizado[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, PAGOS_REALIZADOS_COLLECTION),
      where("mes", "==", mes),
      where("año", "==", año)
    );
    setIsLoading(true);
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: PagoRealizado[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            tipo: (data.tipo as PagoRealizado["tipo"]) ?? "instructor",
            personaId: data.personaId ?? "",
            personaNombre: data.personaNombre ?? "",
            sucursal: data.sucursal,
            mes:
              typeof data.mes === "number" ? data.mes : Number(data.mes) || 0,
            año:
              typeof data.año === "number" ? data.año : Number(data.año) || 0,
            monto: Number(data.monto) || 0,
            fechaPago: data.fechaPago ?? "",
            pagadoPor: data.pagadoPor ?? "",
            // pagadoEn puede ser Timestamp; lo dejamos como llegue para que la
            // UI lo formatee con `new Date(p.pagadoEn)`.
            pagadoEn: typeof data.pagadoEn === "string" ? data.pagadoEn : "",
          };
        });
        setPagos(rows);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("usePagosRealizados onSnapshot:", err);
        setError("No se pudieron cargar los pagos realizados.");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [mes, año]);

  const marcar = useCallback(
    (data: PagoRealizadoInput) => marcarPagoRealizado(data),
    []
  );
  const desmarcar = useCallback(
    (id: string) => eliminarPagoRealizado(id),
    []
  );
  const buscar = useCallback(
    (tipo: "instructor" | "profeGuia", personaId: string) =>
      pagos.find((p) => p.tipo === tipo && p.personaId === personaId),
    [pagos]
  );

  return useMemo(
    () => ({ pagos, isLoading, error, marcar, desmarcar, buscar }),
    [pagos, isLoading, error, marcar, desmarcar, buscar]
  );
}
