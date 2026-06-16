// Migración manual: limpia campos legacy en docs de "alumnos".
//
// La v1 guardaba el estado de pago directamente en cada alumno con los
// campos `pago` (EstadoPago) y `pagosDetalle` (Pago[]). En la v2 la
// fuente de verdad es la colección "pagosAlumnos", por lo que esos
// campos quedan huérfanos. Esta función los elimina con deleteField()
// para no dejarlos llenando los documentos.
//
// Uso (manual, NO se invoca solo):
//
//   import { migrarPagosLegacy } from "@/lib/migrate-pagos-legacy";
//   const r = await migrarPagosLegacy();
//   console.log(r);
//   // → { revisados: 42, limpiados: 17, errores: 0 }
//
// La operación es idempotente: si un doc ya no tiene los campos, se ignora.

import {
  collection,
  deleteField,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { ALUMNOS_COLLECTION } from "./firestore";

const BATCH_MAX = 500;

interface MigrationResult {
  revisados: number;
  limpiados: number;
  errores: number;
}

export async function migrarPagosLegacy(): Promise<MigrationResult> {
  const result: MigrationResult = { revisados: 0, limpiados: 0, errores: 0 };

  let snap;
  try {
    snap = await getDocs(collection(db, ALUMNOS_COLLECTION));
  } catch (err) {
    console.error("migrarPagosLegacy: no se pudo leer alumnos", err);
    throw new Error("No se pudieron cargar los alumnos para migrar.");
  }

  // Filtramos los docs que aún tengan alguno de los campos legacy.
  const targets = snap.docs.filter((d) => {
    const data = d.data();
    return "pago" in data || "pagosDetalle" in data;
  });
  result.revisados = snap.size;

  // Procesamos en lotes de hasta 500 (límite de writeBatch).
  for (let i = 0; i < targets.length; i += BATCH_MAX) {
    const chunk = targets.slice(i, i + BATCH_MAX);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.update(d.ref, {
        pago: deleteField(),
        pagosDetalle: deleteField(),
      });
    }
    try {
      await batch.commit();
      result.limpiados += chunk.length;
    } catch (err) {
      console.error(
        `migrarPagosLegacy: falló commit del lote ${i}-${i + chunk.length}`,
        err
      );
      result.errores += chunk.length;
    }
  }

  return result;
}
