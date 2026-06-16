// Migración one-shot: mueve los arrays embebidos `Alumno.asistencias[]` y
// `Alumno.evaluaciones[]` (modelo v1) a las colecciones raíz nuevas
// `asistenciasAlumnos` y `evaluacionesAlumnos` (modelo Fase C).
//
// Ejecutar UNA SOLA VEZ desde un entorno autenticado como director:
//   import { migrarAsistenciasLegacy } from "@/lib/migrate-legacy-attendance";
//   await migrarAsistenciasLegacy({ dryRun: true });   // simulación
//   await migrarAsistenciasLegacy();                   // ejecución real
//
// La función NO se invoca automáticamente desde la app. La idea es exponerla
// desde una consola (DevTools) o desde un componente protegido cuando el
// director quiera correrla.
//
// Tras migrar:
//  - Crea documentos en `asistenciasAlumnos` (uno por entrada del array).
//  - Crea documentos en `evaluacionesAlumnos` (uno por entrada del array).
//  - Hace update del alumno con `asistencias: deleteField()` y
//    `evaluaciones: deleteField()` para limpiar la forma vieja.
//
// Es idempotente solo en el sentido débil de "una vez borrados los arrays,
// no hay nada que migrar". No deduplica registros si volvés a correrlo
// después de re-importar datos viejos. Por eso: corre con `dryRun: true`
// la primera vez para ver qué tocaría.

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
  deleteField,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  ALUMNOS_COLLECTION,
  ASISTENCIAS_ALUMNOS_COLLECTION,
  EVALUACIONES_ALUMNOS_COLLECTION,
} from "./firestore";
import type { Curso, EstadoAsistencia, Sucursal, Turno } from "./types";

const BATCH_MAX = 450; // margen bajo el límite real de 500 ops por batch

interface LegacyAsistencia {
  fecha?: string;
  estado?: EstadoAsistencia;
  observacion?: string;
  profesor?: string;
}

interface LegacyEvaluacion {
  fecha?: string;
  nota?: number;
  observacion?: string;
  profesor?: string;
}

interface LegacyAlumnoDoc {
  nombre?: string;
  sucursal?: Sucursal;
  curso?: Curso;
  horario?: Turno;
  asistencias?: LegacyAsistencia[];
  evaluaciones?: LegacyEvaluacion[];
}

export interface MigracionResultado {
  alumnosVisitados: number;
  alumnosConLegacy: number;
  asistenciasMigradas: number;
  evaluacionesMigradas: number;
  alumnosLimpiados: number;
  saltados: { alumnoId: string; razon: string }[];
  dryRun: boolean;
}

interface MigracionOpts {
  dryRun?: boolean;
  // Quién está corriendo la migración (queda en `registradaPor` /
  // `evaluadoPor` cuando el registro legacy no trae `profesor`).
  ejecutadoPor?: string;
}

export async function migrarAsistenciasLegacy(
  opts: MigracionOpts = {}
): Promise<MigracionResultado> {
  const dryRun = opts.dryRun ?? false;
  const ejecutadoPor = opts.ejecutadoPor || "migracion-legacy";

  const resultado: MigracionResultado = {
    alumnosVisitados: 0,
    alumnosConLegacy: 0,
    asistenciasMigradas: 0,
    evaluacionesMigradas: 0,
    alumnosLimpiados: 0,
    saltados: [],
    dryRun,
  };

  const alumnosSnap = await getDocs(collection(db, ALUMNOS_COLLECTION));
  resultado.alumnosVisitados = alumnosSnap.size;

  let batch = writeBatch(db);
  let opsEnBatch = 0;
  const flush = async () => {
    if (opsEnBatch === 0) return;
    if (!dryRun) await batch.commit();
    batch = writeBatch(db);
    opsEnBatch = 0;
  };

  for (const alumnoDoc of alumnosSnap.docs) {
    const data = alumnoDoc.data() as DocumentData & LegacyAlumnoDoc;
    const asistenciasLegacy = Array.isArray(data.asistencias)
      ? data.asistencias
      : [];
    const evaluacionesLegacy = Array.isArray(data.evaluaciones)
      ? data.evaluaciones
      : [];

    if (asistenciasLegacy.length === 0 && evaluacionesLegacy.length === 0) {
      continue;
    }
    resultado.alumnosConLegacy += 1;

    // Necesitamos sucursal/curso/horario para llenar los nuevos docs. Si
    // alguno falta no podemos migrar de forma confiable; saltamos el alumno.
    if (!data.sucursal || !data.curso || !data.horario) {
      resultado.saltados.push({
        alumnoId: alumnoDoc.id,
        razon: "Faltan sucursal/curso/horario en el doc del alumno.",
      });
      continue;
    }

    // Asistencias.
    for (const a of asistenciasLegacy) {
      if (!a?.fecha || !a?.estado) {
        resultado.saltados.push({
          alumnoId: alumnoDoc.id,
          razon: "Asistencia legacy sin fecha o estado.",
        });
        continue;
      }
      const ref = doc(collection(db, ASISTENCIAS_ALUMNOS_COLLECTION));
      batch.set(ref, {
        alumnoId: alumnoDoc.id,
        fecha: a.fecha,
        estado: a.estado,
        observacion: a.observacion ?? "",
        registradaPor: a.profesor || ejecutadoPor,
        sucursal: data.sucursal,
        curso: data.curso,
        turno: data.horario,
        createdAt: serverTimestamp(),
        migradoDeLegacy: true,
      });
      opsEnBatch += 1;
      resultado.asistenciasMigradas += 1;
      if (opsEnBatch >= BATCH_MAX) await flush();
    }

    // Evaluaciones.
    for (const e of evaluacionesLegacy) {
      if (!e?.fecha || typeof e?.nota !== "number") {
        resultado.saltados.push({
          alumnoId: alumnoDoc.id,
          razon: "Evaluación legacy sin fecha o nota numérica.",
        });
        continue;
      }
      const ref = doc(collection(db, EVALUACIONES_ALUMNOS_COLLECTION));
      batch.set(ref, {
        alumnoId: alumnoDoc.id,
        fecha: e.fecha,
        nota: e.nota,
        observacion: e.observacion ?? "",
        evaluadoPor: e.profesor || ejecutadoPor,
        sucursal: data.sucursal,
        curso: data.curso,
        createdAt: serverTimestamp(),
        migradoDeLegacy: true,
      });
      opsEnBatch += 1;
      resultado.evaluacionesMigradas += 1;
      if (opsEnBatch >= BATCH_MAX) await flush();
    }

    // Borrado de los arrays legacy del doc del alumno.
    batch.update(doc(db, ALUMNOS_COLLECTION, alumnoDoc.id), {
      asistencias: deleteField(),
      evaluaciones: deleteField(),
      legacyMigradoEn: new Date().toISOString(),
    });
    opsEnBatch += 1;
    resultado.alumnosLimpiados += 1;
    if (opsEnBatch >= BATCH_MAX) await flush();
  }

  await flush();
  return resultado;
}
