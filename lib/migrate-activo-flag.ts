// Migración one-shot: escribe `activo: true` en los docs de `alumnos` y
// `profesGuias` que NO tengan el campo (registros previos a la v2 que
// introdujo el soft delete).
//
// Ejecutar UNA SOLA VEZ desde un entorno autenticado como director:
//   import { migrarFlagActivo } from "@/lib/migrate-activo-flag";
//   await migrarFlagActivo({ dryRun: true });   // simulación
//   await migrarFlagActivo();                   // ejecución real
//
// La función NO se invoca automáticamente desde la app. Idea: pegar el
// import en DevTools con sesión director, o exponerla detrás de un botón
// protegido cuando convenga.
//
// Es idempotente: una vez que un doc tiene `activo` (true o false), no se
// vuelve a tocar.

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  ALUMNOS_COLLECTION,
  PROFES_GUIAS_COLLECTION,
} from "./firestore";

const BATCH_MAX = 450; // margen bajo el límite real de 500 ops por batch

interface MigracionOpts {
  dryRun?: boolean;
}

export interface MigracionFlagResultado {
  alumnosVisitados: number;
  alumnosActualizados: number;
  profesGuiasVisitados: number;
  profesGuiasActualizados: number;
  dryRun: boolean;
}

async function migrarColeccion(
  coleccion: string,
  dryRun: boolean
): Promise<{ visitados: number; actualizados: number }> {
  const snap = await getDocs(collection(db, coleccion));
  let actualizados = 0;
  let batch = writeBatch(db);
  let opsEnBatch = 0;

  const flush = async () => {
    if (opsEnBatch === 0) return;
    if (!dryRun) await batch.commit();
    batch = writeBatch(db);
    opsEnBatch = 0;
  };

  for (const d of snap.docs) {
    const data = d.data() as DocumentData;
    // Si el campo ya existe (true o false), no lo tocamos. Solo escribimos
    // cuando está ausente — exactamente "registros legacy".
    if (Object.prototype.hasOwnProperty.call(data, "activo")) continue;
    batch.update(doc(db, coleccion, d.id), {
      activo: true,
      updatedAt: serverTimestamp(),
    });
    opsEnBatch += 1;
    actualizados += 1;
    if (opsEnBatch >= BATCH_MAX) await flush();
  }

  await flush();
  return { visitados: snap.size, actualizados };
}

export async function migrarFlagActivo(
  opts: MigracionOpts = {}
): Promise<MigracionFlagResultado> {
  const dryRun = opts.dryRun ?? false;
  const alumnos = await migrarColeccion(ALUMNOS_COLLECTION, dryRun);
  const profes = await migrarColeccion(PROFES_GUIAS_COLLECTION, dryRun);
  return {
    alumnosVisitados: alumnos.visitados,
    alumnosActualizados: alumnos.actualizados,
    profesGuiasVisitados: profes.visitados,
    profesGuiasActualizados: profes.actualizados,
    dryRun,
  };
}
