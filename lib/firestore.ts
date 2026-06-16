// =====================================================================
// SHIM de compatibilidad post-migración a Supabase.
//
// HISTORIA: este archivo era la capa de acceso a Firestore (2500+ líneas).
// Tras migrar a Supabase (lib/queries.ts) lo dejamos como "shim" para
// que los componentes existentes que importan de "@/lib/firestore" sigan
// funcionando sin tocar 80 archivos a la vez. Funciones nuevas: importar
// de "@/lib/queries" directamente. Este shim no agrega features nuevos.
//
// Lo que vive acá:
//  1) Re-exports de lib/queries.ts (la mayoría) y renames cuando los
//     nombres viejos diferían (eliminarPagoAlumno → deletePagoAlumno).
//  2) Type aliases que el código usaba (AlumnoInput, ProfeGuiaInput, ...).
//  3) Constantes de nombres de colección (ahora tablas Postgres).
//  4) Funciones de CÁLCULO puras (modelo escalado instructor, profe guía)
//     copiadas tal cual del archivo original — no tocan la BD.
//  5) Funciones que sí tocan la BD pero específicas (sincronizar alumnos
//     de un instructor, actualizar PDF de una semana del temario,
//     calcular recaudación del mes).
// =====================================================================

import { supabase } from "./supabase";
import {
  getEvaluacionesPorAlumno,
  getPagosDelMes,
  getPagosPorAlumno,
  deletePagoAlumno as qDeletePagoAlumno,
  getPreciosAlumnos,
  getTemarioCurso,
  upsertSemanaTemario,
  upsertTemarioCurso,
} from "./queries";
import type {
  Alumno,
  AsistenciaAlumno,
  Curso,
  Instructor,
  PagoAlumno,
  PagoCalculado,
  PreciosAlumnos,
  ProfeGuia,
  Sucursal,
  TarifasPorCurso,
  TemaSemana,
} from "./database.types";
import { CURSOS, DURACION_DEFAULT_CLASES } from "./types";

// =====================================================================
// Re-exports directos desde queries.ts (mismo nombre)
// =====================================================================

export {
  // Alumnos
  getAlumnos,
  getAlumnosPorSucursal,
  createAlumno,
  updateAlumno,
  deleteAlumno,
  reactivateAlumno,
  asignarInstructorAAlumno,
  asignarProfeGuiaAAlumno,
  createAlumnosMasivo,
  // Profes Guías
  getProfesGuias,
  getProfesGuiasPorSucursal,
  createProfeGuia,
  updateProfeGuia,
  deleteProfeGuia,
  reactivateProfeGuia,
  deactivateProfeGuia,
  createProfesGuiasMasivo,
  // Instructores
  getInstructores,
  getInstructoresPorSucursal,
  getInstructorPorEmail,
  createInstructor,
  updateInstructor,
  deactivateInstructor,
  reactivateInstructor,
  marcarAuthVerificado,
  reasignarSucursalInstructor as reasignarSucursal,
  getHistorialPorInstructor,
  // Asistencias alumnos
  registrarAsistenciaAlumno,
  registrarAsistenciasAlumnosBatch,
  getAsistenciasPorAlumno,
  getAsistenciasDelDia,
  getAsistenciasEnRango,
  updateAsistenciaAlumno,
  deleteAsistenciaAlumno,
  // Asistencias profes
  registrarAsistenciaProfe,
  getAsistenciasProfesDelDia,
  getAsistenciasProfeGuiaPorMes,
  updateAsistenciaProfe,
  deleteAsistenciaProfe,
  // Evaluaciones
  registrarEvaluacion,
  getEvaluacionesPorAlumno,
  updateEvaluacion,
  deleteEvaluacion,
  // Config + Precios
  getConfigPagos,
  updateConfigPagos as saveConfigPagos,
  getPreciosAlumnos,
  updatePreciosAlumnos as savePreciosAlumnos,
  // Pagos alumnos
  registrarPagoAlumno,
  updatePagoAlumno as actualizarPagoAlumno,
  getPagosPorAlumno,
  getPagosDelMes as getPagosPorMes,
  // Pagos realizados
  marcarPagoRealizado,
  getPagosRealizadosDelMes as getPagosRealizadosPorMes,
  deletePagoRealizado as eliminarPagoRealizado,
} from "./queries";

// Renombres con alias para compatibilidad con código viejo:
export const eliminarPagoAlumno = qDeletePagoAlumno;
export const deactivateAlumno = (id: string) =>
  import("./queries").then((q) => q.deleteAlumno(id));

// =====================================================================
// Type aliases (los Input types que el código usa)
// =====================================================================

export type AlumnoInput = Omit<Alumno, "id">;
export type ProfeGuiaInput = Omit<ProfeGuia, "id">;
export type InstructorInput = Omit<Instructor, "id" | "fechaCreacion">;
export type PagoAlumnoInput = Omit<PagoAlumno, "id" | "registradoEn">;

// =====================================================================
// Nombres de "colección" (ahora tablas) — usados por algunos componentes
// que arman queries inline. Apuntan al nombre de tabla Postgres.
// =====================================================================

export const ALUMNOS_COLLECTION = "alumnos";
export const PROFES_GUIAS_COLLECTION = "profes_guias";
export const INSTRUCTORES_COLLECTION = "instructores";
export const ASISTENCIAS_ALUMNOS_COLLECTION = "asistencias_alumnos";
export const ASISTENCIAS_PROFES_GUIAS_COLLECTION = "asistencias_profes_guias";
export const EVALUACIONES_ALUMNOS_COLLECTION = "evaluaciones_alumnos";
export const TEMARIOS_COLLECTION = "temarios";
export const SEMANAS_TEMARIO_COLLECTION = "semanas_temario";
export const CONFIG_PAGOS_COLLECTION = "config_pagos";
export const PRECIOS_ALUMNOS_COLLECTION = "precios_alumnos";
export const PAGOS_ALUMNOS_COLLECTION = "pagos_alumnos";
export const PAGOS_REALIZADOS_COLLECTION = "pagos_realizados";

// =====================================================================
// Funciones puras de cálculo de pagos (copiadas del original)
// =====================================================================

function tarifaEnCero() {
  return {
    Junior: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
    Senior: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
    Master: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
  };
}

export function esAsistenciaPagable(a: AsistenciaAlumno): boolean {
  return a.estado === "Presente" || a.estado === "Tarde";
}

// Cálculo profe guía (modelo lineal por curso).
let __warnedLegacyTarifa = false;
export function construirPagoCalculado(args: {
  personaId: string;
  personaNombre: string;
  tipo: "instructor" | "profeGuia";
  sucursal: Sucursal;
  mes: number;
  año: number;
  asistencias: AsistenciaAlumno[];
  tarifas: TarifasPorCurso;
}): PagoCalculado {
  const { personaId, personaNombre, tipo, sucursal, mes, año, asistencias, tarifas } = args;
  const detalle = tarifaEnCero();
  const pagables = asistencias.filter(esAsistenciaPagable);

  const diasMap = new Map<string, number>();
  for (const a of pagables) {
    const curso = a.curso as Curso | undefined;
    if (!curso || !CURSOS.includes(curso)) {
      diasMap.set(a.fecha, (diasMap.get(a.fecha) ?? 0) + 1);
      continue;
    }
    detalle[curso].alumnosAsistidos += 1;

    const snapshot =
      tipo === "instructor" ? a.tarifaInstructorAplicada : a.tarifaProfeGuiaAplicada;
    let tarifaAplicada: number;
    if (typeof snapshot === "number") {
      tarifaAplicada = snapshot;
    } else {
      tarifaAplicada = tarifas[curso] ?? 0;
      if (!__warnedLegacyTarifa) {
        console.warn("[pagos] Asistencia legacy sin tarifa snapshoteada — usando configPagos actual como fallback.");
        __warnedLegacyTarifa = true;
      }
    }
    detalle[curso].subtotal += tarifaAplicada;
    diasMap.set(a.fecha, (diasMap.get(a.fecha) ?? 0) + 1);
  }

  for (const c of CURSOS) {
    if (detalle[c].alumnosAsistidos > 0) {
      detalle[c].tarifa = detalle[c].subtotal / detalle[c].alumnosAsistidos;
    } else {
      detalle[c].tarifa = tarifas[c] ?? 0;
    }
  }

  const totalCLP =
    detalle.Junior.subtotal + detalle.Senior.subtotal + detalle.Master.subtotal;
  const alumnosAsistidos =
    detalle.Junior.alumnosAsistidos + detalle.Senior.alumnosAsistidos + detalle.Master.alumnosAsistidos;

  const diasDetalle = Array.from(diasMap.entries())
    .map(([fecha, alumnos]) => ({ fecha, alumnos }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    personaId,
    personaNombre,
    tipo,
    sucursal,
    mes,
    año,
    detallePorCurso: detalle,
    totalCLP,
    diasTrabajados: diasMap.size,
    alumnosAsistidos,
    diasDetalle,
  };
}

// Filtra asistencias para un profe guía respetando snapshot histórico.
let __warnedLegacyProfeSnap = false;
export function filtrarAsistenciasParaProfe(
  asistencias: AsistenciaAlumno[],
  profeId: string,
  alumnosPorProfeFallback: Map<string, Set<string>>
): AsistenciaAlumno[] {
  const idsFallback = alumnosPorProfeFallback.get(profeId) ?? new Set<string>();
  const out: AsistenciaAlumno[] = [];
  for (const a of asistencias) {
    if (typeof a.profeGuiaIdSnapshot === "string" && a.profeGuiaIdSnapshot.length > 0) {
      if (a.profeGuiaIdSnapshot === profeId) out.push(a);
    } else {
      if (!__warnedLegacyProfeSnap) {
        console.warn("[pagos] Asistencia legacy sin profeGuiaIdSnapshot — usando profeGuiaId actual del alumno como fallback.");
        __warnedLegacyProfeSnap = true;
      }
      if (idsFallback.has(a.alumnoId)) out.push(a);
    }
  }
  return out;
}

// Cálculo NUEVO escalado para instructor: 1er alumno + N-1 adicionales por día.
let __warnedLegacyInstructorSnap = false;
export function construirPagoCalculadoInstructorEscalado(args: {
  instructorId: string;
  instructorNombre: string;
  sucursal: Sucursal;
  mes: number;
  año: number;
  asistencias: AsistenciaAlumno[];
  alumnosDeEsteInstructor: Set<string>;
  montoPrimerAlumno: number;
  montoAlumnoAdicional: number;
}): PagoCalculado {
  const {
    instructorId, instructorNombre, sucursal, mes, año, asistencias,
    alumnosDeEsteInstructor, montoPrimerAlumno, montoAlumnoAdicional,
  } = args;

  const propias: AsistenciaAlumno[] = [];
  for (const a of asistencias) {
    if (!esAsistenciaPagable(a)) continue;
    const snap = a.instructorIdSnapshot;
    if (typeof snap === "string" && snap.length > 0) {
      if (snap === instructorId) propias.push(a);
    } else {
      if (!__warnedLegacyInstructorSnap) {
        console.warn("[pagos] Asistencia legacy sin instructorIdSnapshot — usando instructorId actual del alumno como fallback.");
        __warnedLegacyInstructorSnap = true;
      }
      if (alumnosDeEsteInstructor.has(a.alumnoId)) propias.push(a);
    }
  }

  const porDia = new Map<string, Set<string>>();
  const porCurso: Record<Curso, number> = { Junior: 0, Senior: 0, Master: 0 };

  for (const a of propias) {
    const setDia = porDia.get(a.fecha) ?? new Set<string>();
    if (!setDia.has(a.alumnoId)) {
      setDia.add(a.alumnoId);
      if (a.curso && CURSOS.includes(a.curso)) porCurso[a.curso] += 1;
    }
    porDia.set(a.fecha, setDia);
  }

  const desgloseDias = Array.from(porDia.entries())
    .map(([fecha, set]) => {
      const alumnos = set.size;
      const total =
        alumnos > 0
          ? montoPrimerAlumno + Math.max(0, alumnos - 1) * montoAlumnoAdicional
          : 0;
      return {
        fecha,
        alumnos,
        montoPrimero: alumnos > 0 ? montoPrimerAlumno : 0,
        montoAdicional: montoAlumnoAdicional,
        total,
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totalCLP = desgloseDias.reduce((acc, d) => acc + d.total, 0);
  const alumnosAsistidos = porCurso.Junior + porCurso.Senior + porCurso.Master;
  const diasDetalle = desgloseDias.map((d) => ({ fecha: d.fecha, alumnos: d.alumnos }));

  const detallePorCurso = {
    Junior: { alumnosAsistidos: porCurso.Junior, tarifa: 0, subtotal: 0 },
    Senior: { alumnosAsistidos: porCurso.Senior, tarifa: 0, subtotal: 0 },
    Master: { alumnosAsistidos: porCurso.Master, tarifa: 0, subtotal: 0 },
  };

  return {
    personaId: instructorId,
    personaNombre: instructorNombre,
    tipo: "instructor",
    sucursal,
    mes,
    año,
    detallePorCurso,
    totalCLP,
    diasTrabajados: porDia.size,
    alumnosAsistidos,
    diasDetalle,
    desgloseDias,
  };
}

// =====================================================================
// Funciones derivadas que tocan la BD (reescritas para Supabase)
// =====================================================================

// Sincroniza la lista de alumnos asignados a un instructor: desasigna
// los que ya no estén, asigna los que se agregaron.
export async function sincronizarAlumnosDeInstructor(
  instructorId: string,
  idsActuales: string[]
): Promise<void> {
  // 1. Cargar los alumnos que actualmente apuntan a este instructor.
  const { data: yaAsignados, error: errSel } = await supabase
    .from("alumnos")
    .select("id")
    .eq("instructor_id", instructorId);
  if (errSel) {
    console.error("sincronizarAlumnosDeInstructor select:", errSel);
    throw new Error("No se pudo sincronizar la lista de alumnos asignados.");
  }
  const setYa = new Set((yaAsignados ?? []).map((r) => r.id));
  const setNuevos = new Set(idsActuales);

  const aDesasignar = [...setYa].filter((id) => !setNuevos.has(id));
  const aAsignar = [...setNuevos].filter((id) => !setYa.has(id));

  if (aDesasignar.length === 0 && aAsignar.length === 0) return;

  if (aDesasignar.length > 0) {
    const { error } = await supabase
      .from("alumnos")
      .update({ instructor_id: null })
      .in("id", aDesasignar);
    if (error) {
      console.error("sincronizarAlumnos desasignar:", error);
      throw new Error("No se pudo desasignar alumnos.");
    }
  }
  if (aAsignar.length > 0) {
    // Al asignar a este instructor, garantizamos exclusión con profe guía.
    const { error } = await supabase
      .from("alumnos")
      .update({ instructor_id: instructorId, profe_guia_id: null })
      .in("id", aAsignar);
    if (error) {
      console.error("sincronizarAlumnos asignar:", error);
      throw new Error("No se pudo asignar alumnos.");
    }
  }
}

// Actualiza el PDF de una semana específica del temario. La diferencia con
// el original (que usaba un único doc con array `semanas`) es que ahora
// cada semana es una fila en `semanas_temario`. Si no existe la fila,
// la creamos a partir del fallback.
export async function actualizarPdfSemana(args: {
  curso: Curso;
  semanaIdx: number;
  dia: "martes" | "miercoles";
  pdf: { url: string; nombre: string } | null;
  actualizadoPor: string;
  semanasFallback: TemaSemana[];
  fechaInicioFallback: string;
}): Promise<void> {
  // Asegurar que el temario maestro existe para esta combinación de curso.
  await upsertTemarioCurso(args.curso, args.fechaInicioFallback, args.actualizadoPor);

  // Construir el contenido objetivo de la semana.
  const fallback = args.semanasFallback[args.semanaIdx];
  const base: TemaSemana = fallback ?? {
    semanaNumero: args.semanaIdx + 1,
    titulo: "",
  };
  const updated: TemaSemana = {
    ...base,
    semanaNumero: args.semanaIdx + 1,
  };
  if (args.dia === "martes") {
    updated.pdfMartesUrl = args.pdf?.url ?? undefined;
    updated.pdfMartesNombre = args.pdf?.nombre ?? undefined;
  } else {
    updated.pdfMiercolesUrl = args.pdf?.url ?? undefined;
    updated.pdfMiercolesNombre = args.pdf?.nombre ?? undefined;
  }
  await upsertSemanaTemario(args.curso, updated);
}

// Cálculo agregado de recaudación del mes. Reusa la lógica de estado
// de morosidad.
export async function calcularRecaudacionAlumnos(
  mes: number,
  año: number
): Promise<{ totalCLP: number; alumnosAlDia: number; alumnosConDeuda: number }> {
  const [pagos, alumnos, precios] = await Promise.all([
    getPagosDelMes(año, mes),
    supabase.from("alumnos").select("*").eq("activo", true).then((r) => r.data ?? []),
    getPreciosAlumnos().catch(() => null as PreciosAlumnos | null),
  ]);

  const totalCLP = pagos.reduce((acc, p) => acc + (p.monto || 0), 0);
  const pagadoPorAlumno = new Map<string, number>();
  for (const p of pagos) {
    pagadoPorAlumno.set(p.alumnoId, (pagadoPorAlumno.get(p.alumnoId) ?? 0) + (p.monto || 0));
  }
  let alDia = 0;
  let conDeuda = 0;
  for (const a of alumnos as { id: string; curso: Curso }[]) {
    const precio = precios ? precios[a.curso] ?? 0 : 0;
    const pagado = pagadoPorAlumno.get(a.id) ?? 0;
    if (precio > 0) {
      if (pagado >= precio) alDia++;
      else conDeuda++;
    } else {
      if (pagado > 0) alDia++;
      else conDeuda++;
    }
  }
  return { totalCLP, alumnosAlDia: alDia, alumnosConDeuda: conDeuda };
}

// Cálculo de fecha de término de un curso (puro, no toca BD).
export function duracionClasesDeCurso(
  curso: Curso,
  precios: PreciosAlumnos | null
): number {
  if (precios) {
    if (curso === "Junior" && precios.duracionJuniorClases) return precios.duracionJuniorClases;
    if (curso === "Senior" && precios.duracionSeniorClases) return precios.duracionSeniorClases;
    if (curso === "Master" && precios.duracionMasterClases) return precios.duracionMasterClases;
  }
  return DURACION_DEFAULT_CLASES[curso];
}

export function calcularFechaTerminoCurso(
  fechaInicio: string,
  curso: Curso,
  precios: PreciosAlumnos | null
): string {
  const clases = duracionClasesDeCurso(curso, precios);
  // 2 clases por semana (martes y miércoles); redondeo hacia arriba.
  const semanas = Math.ceil(clases / 2);
  const d = new Date(fechaInicio + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + (semanas - 1) * 7 + 1); // -1 porque la sem 1 ya incluye la fecha de inicio; +1 para landing en miércoles
  return d.toISOString().split("T")[0];
}

// =====================================================================
// Compat: cálculo de "semana actual" del temario (puro).
// =====================================================================

export function calcularSemanaActual(
  semanas: TemaSemana[],
  fechaInicio: string,
  hoy: Date = new Date()
): TemaSemana | null {
  if (!semanas || semanas.length === 0 || !fechaInicio) return null;
  const inicio = new Date(fechaInicio + "T12:00:00Z");
  const diff = hoy.getTime() - inicio.getTime();
  if (diff < 0) return null;
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  const semanaIdx = Math.floor(dias / 7);
  if (semanaIdx >= semanas.length) return null;
  return semanas[semanaIdx] ?? null;
}

export async function getSemanaActual(curso: Curso): Promise<TemaSemana | null> {
  const t = await getTemarioCurso(curso);
  if (!t) return null;
  return calcularSemanaActual(t.semanas, t.fechaInicio);
}

// =====================================================================
// Compat: alias de funciones renombradas
// =====================================================================

export { getTemarioCurso as getTemario };

// Para componentes que usan `import { db } from "@/lib/firebase"` y
// luego hacen onSnapshot — esos deben migrarse caso por caso. NO
// re-exportamos db de Firebase porque ese módulo ya no existe.
