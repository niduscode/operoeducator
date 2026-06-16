"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Alumno, PagoAlumno, PreciosAlumnos } from "@/lib/types";
import {
  ALUMNOS_COLLECTION,
  PAGOS_ALUMNOS_COLLECTION,
  PRECIOS_ALUMNOS_COLLECTION,
} from "@/lib/firestore";

interface UseEstadoMorosidadReturn {
  alumnosAlDia: Alumno[];
  alumnosConDeuda: Alumno[];
  totalRecaudado: number;
  totalEsperado: number;
  // IDs de alumnos que tienen al menos un pago parcial pero la suma del mes
  // todavía NO alcanza el precio del curso. v4: pertenecen a alumnosConDeuda
  // (no a alumnosAlDia). Sirven para mostrar badge "Parcial · saldo $X".
  parcialIds: Set<string>;
  // Suma de monto pagado por alumno en el mes/año (sumatoria de todos los
  // pagos: parciales + total). Permite calcular el saldo en la UI.
  montoPagadoPorAlumno: Map<string, number>;
  isLoading: boolean;
  error: string | null;
}

// Cálculo reactivo del estado de morosidad del mes/año dados.
// Combina tres suscripciones (alumnos + pagosAlumnos del mes + precios) y
// las recalcula en memoria. Para single-tenant (1 academia) el costo es bajo.
export function useEstadoMorosidad(
  mes: number,
  año: number
): UseEstadoMorosidadReturn {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [pagos, setPagos] = useState<PagoAlumno[]>([]);
  const [precios, setPrecios] = useState<PreciosAlumnos | null>(null);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [loadingPrecios, setLoadingPrecios] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, ALUMNOS_COLLECTION),
      (snap: QuerySnapshot<DocumentData>) => {
        // Solo alumnos activos: los desactivados no entran en "al día / con deuda"
        // ni en el total esperado del mes (ver tarea 1.4 / 3.4).
        const rows: Alumno[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              nombre: data.nombre ?? "",
              telefono: data.telefono ?? "",
              sucursal: data.sucursal,
              curso: data.curso,
              horario: data.horario,
              fecha: data.fecha ?? "",
              profeGuiaId: data.profeGuiaId ?? "",
              activo: data.activo ?? true,
            } as Alumno;
          })
          .filter((a) => a.activo !== false);
        setAlumnos(rows);
        setLoadingAlumnos(false);
      },
      (err) => {
        console.error("useEstadoMorosidad alumnos:", err);
        setError("No se pudieron cargar los alumnos.");
        setLoadingAlumnos(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, PAGOS_ALUMNOS_COLLECTION),
      where("mes", "==", mes),
      where("año", "==", año)
    );
    setLoadingPagos(true);
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
        setLoadingPagos(false);
      },
      (err) => {
        console.error("useEstadoMorosidad pagos:", err);
        setError("No se pudieron cargar los pagos del mes.");
        setLoadingPagos(false);
      }
    );
    return () => unsub();
  }, [mes, año]);

  useEffect(() => {
    const ref = doc(db, PRECIOS_ALUMNOS_COLLECTION, "default");
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot<DocumentData>) => {
        if (!snap.exists()) {
          setPrecios(null);
        } else {
          const data = snap.data();
          setPrecios({
            id: "default",
            Junior: Number(data?.Junior ?? 0),
            Senior: Number(data?.Senior ?? 0),
            Master: Number(data?.Master ?? 0),
            actualizadoPor: data?.actualizadoPor ?? "",
            actualizadoEn: data?.actualizadoEn ?? "",
          });
        }
        setLoadingPrecios(false);
      },
      (err) => {
        console.error("useEstadoMorosidad precios:", err);
        setError("No se pudieron cargar los precios.");
        setLoadingPrecios(false);
      }
    );
    return () => unsub();
  }, []);

  return useMemo<UseEstadoMorosidadReturn>(() => {
    const totalRecaudado = pagos.reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalEsperado = alumnos.reduce((acc, a) => {
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      return acc + precio;
    }, 0);

    // Sumatoria de pagos del mes por alumno (parciales acumulables).
    const montoPagadoPorAlumno = new Map<string, number>();
    for (const p of pagos) {
      montoPagadoPorAlumno.set(
        p.alumnoId,
        (montoPagadoPorAlumno.get(p.alumnoId) ?? 0) + (p.monto || 0)
      );
    }

    // v4 fix: "al día" exige que la SUMA cubra el precio del curso, no que
    // simplemente exista un pago. Un parcial deja al alumno en "con deuda"
    // hasta que sucesivos abonos sumen >= precio.
    const alumnosAlDia: Alumno[] = [];
    const alumnosConDeuda: Alumno[] = [];
    const parcialIds = new Set<string>();
    for (const a of alumnos) {
      const pagado = montoPagadoPorAlumno.get(a.id) ?? 0;
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      if (precio > 0) {
        if (pagado >= precio) {
          alumnosAlDia.push(a);
        } else {
          alumnosConDeuda.push(a);
          if (pagado > 0) parcialIds.add(a.id);
        }
      } else {
        // Sin precio configurado: fallback al criterio v3 (cualquier pago = al día)
        // para no romper el dashboard hasta que el director cargue precios.
        if (pagado > 0) alumnosAlDia.push(a);
        else alumnosConDeuda.push(a);
      }
    }
    return {
      alumnosAlDia,
      alumnosConDeuda,
      totalRecaudado,
      totalEsperado,
      parcialIds,
      montoPagadoPorAlumno,
      isLoading: loadingAlumnos || loadingPagos || loadingPrecios,
      error,
    };
  }, [alumnos, pagos, precios, loadingAlumnos, loadingPagos, loadingPrecios, error]);
}
