// QA exhaustivo: valida la base de datos contra las reglas de negocio
// documentadas en OPEROEDUCATOR.md. No usa el navegador — golpea Firestore
// directamente con firebase-admin (bypass de reglas).
//
// Uso: npx tsx scripts/qa-test.ts

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

const SA = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), ".firebase-service-account.json"), "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore();

type Severity = "FAIL" | "WARN" | "PASS" | "INFO";
interface Finding {
  area: string;
  severity: Severity;
  message: string;
  details?: string;
}
const findings: Finding[] = [];

function record(area: string, severity: Severity, message: string, details?: string) {
  findings.push({ area, severity, message, details });
}

// ============================================================
// 1) Configuración base (precios + tarifas)
// ============================================================

async function checkConfiguracion() {
  const area = "Configuración";

  const config = await db.collection("configPagos").doc("default").get();
  if (!config.exists) {
    record(area, "FAIL", "configPagos/default no existe — pagos a profesionales devolverán 0");
  } else {
    const d = config.data()!;
    const ti = d.tarifasInstructor ?? {};
    const tp = d.tarifasProfeGuia ?? {};
    const ms = d.montosInstructorEscalados ?? d.tarifaEscaladaInstructor;
    record(area, "INFO", `tarifasInstructor: ${JSON.stringify(ti)}`);
    record(area, "INFO", `tarifasProfeGuia:  ${JSON.stringify(tp)}`);
    if (ms) record(area, "INFO", `monto escalado instructor: ${JSON.stringify(ms)}`);
    if (!ti.Junior || !ti.Senior) {
      record(area, "WARN", "Tarifas de instructor incompletas (Junior/Senior con valor 0)");
    }
    if (!tp.Junior || !tp.Senior) {
      record(area, "WARN", "Tarifas de profe guía incompletas (Junior/Senior con valor 0)");
    }
  }

  const precios = await db.collection("preciosAlumnos").doc("default").get();
  if (!precios.exists) {
    record(area, "FAIL", "preciosAlumnos/default no existe — todos los alumnos serán 'sin precio'");
  } else {
    const d = precios.data()!;
    record(area, "INFO", `preciosAlumnos: Junior=${d.Junior}, Senior=${d.Senior}, Master=${d.Master}`);
    if (!d.Junior || !d.Senior) {
      record(area, "WARN", "Precios incompletos para Junior o Senior");
    }
  }
}

// ============================================================
// 2) Alumnos
// ============================================================

interface Alumno {
  id: string; nombre: string; sucursal: string; curso: string; horario: string;
  fecha?: string; instructorId?: string; profeGuiaId?: string; activo: boolean;
}

async function loadAlumnos(): Promise<Alumno[]> {
  const snap = await db.collection("alumnos").get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      nombre: x.nombre ?? "",
      sucursal: x.sucursal,
      curso: x.curso,
      horario: x.horario,
      fecha: x.fecha,
      instructorId: x.instructorId,
      profeGuiaId: x.profeGuiaId,
      activo: x.activo ?? true,
    };
  });
}

const SUCURSALES = new Set(["Muermos", "Puerto Montt", "Osorno", "Valdivia", "Temuco"]);
const CURSOS = new Set(["Junior", "Senior", "Master"]);
const HORARIOS = new Set(["Mañana", "Tarde"]);

async function checkAlumnos(alumnos: Alumno[]) {
  const area = "Alumnos";
  record(area, "INFO", `Total alumnos: ${alumnos.length} (${alumnos.filter(a => a.activo).length} activos)`);

  const huerfanosCurso = alumnos.filter(a => !CURSOS.has(a.curso));
  const huerfanosSucursal = alumnos.filter(a => !SUCURSALES.has(a.sucursal));
  const huerfanosHorario = alumnos.filter(a => !HORARIOS.has(a.horario));
  if (huerfanosCurso.length) record(area, "FAIL", `${huerfanosCurso.length} alumnos con curso inválido`, huerfanosCurso.map(a => `${a.id}: ${a.curso}`).join(", "));
  if (huerfanosSucursal.length) record(area, "FAIL", `${huerfanosSucursal.length} alumnos con sucursal inválida`, huerfanosSucursal.map(a => `${a.id}: ${a.sucursal}`).join(", "));
  if (huerfanosHorario.length) record(area, "FAIL", `${huerfanosHorario.length} alumnos con horario inválido`, huerfanosHorario.map(a => `${a.id}: ${a.horario}`).join(", "));
  if (!huerfanosCurso.length && !huerfanosSucursal.length && !huerfanosHorario.length) {
    record(area, "PASS", "Todos los alumnos tienen curso/sucursal/horario válidos");
  }

  // Regla del doc: "Cada alumno tiene asignado UN profesional (instructor O profe guía, nunca ambos)"
  const conAmbos = alumnos.filter(a => a.activo && a.instructorId && a.profeGuiaId);
  const sinNinguno = alumnos.filter(a => a.activo && !a.instructorId && !a.profeGuiaId);
  if (conAmbos.length) {
    record(area, "FAIL", `${conAmbos.length} alumnos activos con instructorId Y profeGuiaId (debería ser uno u otro)`, conAmbos.slice(0, 5).map(a => `${a.id}: ${a.nombre}`).join(", "));
  } else {
    record(area, "PASS", "Ningún alumno activo tiene ambos profesionales asignados a la vez");
  }
  if (sinNinguno.length) {
    record(area, "WARN", `${sinNinguno.length} alumnos activos SIN profesional asignado — no generan pagos. Por doc: 'Alumnos sin instructorId/profeGuiaId no aparecen en cálculos de pago'`, sinNinguno.slice(0, 5).map(a => `${a.id}: ${a.nombre} (${a.sucursal})`).join(", "));
  } else {
    record(area, "PASS", "Todos los alumnos activos tienen profesional asignado");
  }

  // Distribución por sucursal/curso/horario
  const dist = new Map<string, number>();
  for (const a of alumnos) {
    if (!a.activo) continue;
    const key = `${a.sucursal} / ${a.curso} / ${a.horario}`;
    dist.set(key, (dist.get(key) ?? 0) + 1);
  }
  const distLines = [...dist.entries()].sort().map(([k, v]) => `  ${k}: ${v}`).join("\n");
  record(area, "INFO", "Distribución activos por sucursal/curso/horario", distLines);
}

// ============================================================
// 3) Instructores y Profes Guías
// ============================================================

interface Instructor {
  id: string; username: string; email: string; sucursalActual: string;
  activo: boolean; authVerificado: boolean; nombreCompleto: string;
}
interface ProfeGuia { id: string; nombre: string; sucursal: string; activo: boolean; }

async function loadInstructores(): Promise<Instructor[]> {
  const snap = await db.collection("instructores").get();
  return snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id, username: x.username ?? "", email: x.email ?? "",
      sucursalActual: x.sucursalActual, activo: x.activo ?? true,
      authVerificado: x.authVerificado ?? false, nombreCompleto: x.nombreCompleto ?? "",
    };
  });
}
async function loadProfesGuias(): Promise<ProfeGuia[]> {
  const snap = await db.collection("profesGuias").get();
  return snap.docs.map(d => {
    const x = d.data();
    return { id: d.id, nombre: x.nombre ?? "", sucursal: x.sucursal, activo: x.activo ?? true };
  });
}

async function checkProfesionales(
  alumnos: Alumno[], instructores: Instructor[], profes: ProfeGuia[]
) {
  const area = "Profesionales";
  record(area, "INFO", `Instructores: ${instructores.length} (${instructores.filter(i => i.activo).length} activos)`);
  record(area, "INFO", `Profes guías: ${profes.length} (${profes.filter(p => p.activo).length} activos)`);

  // Por doc, una sucursal podría tener varios instructores. No hay regla de unicidad.
  const porSucursal = new Map<string, string[]>();
  for (const i of instructores) {
    if (!i.activo) continue;
    const arr = porSucursal.get(i.sucursalActual) ?? [];
    arr.push(`${i.username} (${i.nombreCompleto})`);
    porSucursal.set(i.sucursalActual, arr);
  }
  for (const s of SUCURSALES) {
    const arr = porSucursal.get(s) ?? [];
    if (arr.length === 0) record(area, "WARN", `Sucursal ${s} sin instructor activo`);
    else if (arr.length > 1) record(area, "INFO", `${s}: ${arr.length} instructores activos: ${arr.join(", ")}`);
    else record(area, "INFO", `${s}: ${arr[0]}`);
  }

  // Instructor con authVerificado=false: el doc menciona "Camino C" — director crea cuenta manual
  const sinAuth = instructores.filter(i => i.activo && !i.authVerificado);
  if (sinAuth.length) {
    record(area, "WARN", `${sinAuth.length} instructores activos con authVerificado=false (cuenta Firebase Auth no marcada como creada)`, sinAuth.map(i => i.username).join(", "));
  }

  // Integridad referencial: instructorId / profeGuiaId apuntan a docs existentes
  const instrIds = new Set(instructores.map(i => i.id));
  const profeIds = new Set(profes.map(p => p.id));
  const alumnosInstrRoto = alumnos.filter(a => a.instructorId && !instrIds.has(a.instructorId));
  const alumnosProfeRoto = alumnos.filter(a => a.profeGuiaId && !profeIds.has(a.profeGuiaId));
  if (alumnosInstrRoto.length) record(area, "FAIL", `${alumnosInstrRoto.length} alumnos apuntan a instructorId inexistente`, alumnosInstrRoto.slice(0, 5).map(a => `${a.nombre} → ${a.instructorId}`).join(", "));
  if (alumnosProfeRoto.length) record(area, "FAIL", `${alumnosProfeRoto.length} alumnos apuntan a profeGuiaId inexistente`, alumnosProfeRoto.slice(0, 5).map(a => `${a.nombre} → ${a.profeGuiaId}`).join(", "));
  if (!alumnosInstrRoto.length && !alumnosProfeRoto.length) {
    record(area, "PASS", "Integridad referencial alumno→instructor/profe OK");
  }

  // Cross-sucursal: alumno asignado a un profesional de otra sucursal
  const instrPorId = new Map(instructores.map(i => [i.id, i]));
  const profePorId = new Map(profes.map(p => [p.id, p]));
  const cruzados: string[] = [];
  for (const a of alumnos) {
    if (!a.activo) continue;
    if (a.instructorId) {
      const i = instrPorId.get(a.instructorId);
      if (i && i.sucursalActual !== a.sucursal) {
        cruzados.push(`${a.nombre} (${a.sucursal}) → instructor ${i.username} (${i.sucursalActual})`);
      }
    }
    if (a.profeGuiaId) {
      const p = profePorId.get(a.profeGuiaId);
      if (p && p.sucursal !== a.sucursal) {
        cruzados.push(`${a.nombre} (${a.sucursal}) → profe ${p.nombre} (${p.sucursal})`);
      }
    }
  }
  if (cruzados.length) {
    record(area, "FAIL", `${cruzados.length} alumnos asignados a profesional de OTRA sucursal`, cruzados.slice(0, 10).join("\n  "));
  } else {
    record(area, "PASS", "Todos los alumnos están asignados a un profesional de su misma sucursal");
  }
}

// ============================================================
// 4) Asistencias
// ============================================================

interface Asistencia {
  id: string; alumnoId: string; fecha: string; estado: string;
  sucursal: string; curso: string; turno?: string;
  tarifaInstructorAplicada?: number; tarifaProfeGuiaAplicada?: number;
  profeGuiaIdSnapshot?: string; instructorIdSnapshot?: string;
}

async function loadAsistencias(): Promise<Asistencia[]> {
  const snap = await db.collection("asistenciasAlumnos").get();
  return snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id, alumnoId: x.alumnoId ?? "", fecha: x.fecha ?? "",
      estado: x.estado ?? "", sucursal: x.sucursal, curso: x.curso, turno: x.turno,
      tarifaInstructorAplicada: x.tarifaInstructorAplicada,
      tarifaProfeGuiaAplicada: x.tarifaProfeGuiaAplicada,
      profeGuiaIdSnapshot: x.profeGuiaIdSnapshot,
      instructorIdSnapshot: x.instructorIdSnapshot,
    };
  });
}

const ESTADOS = new Set(["Presente", "Ausente", "Tarde"]);

async function checkAsistencias(asistencias: Asistencia[], alumnos: Alumno[]) {
  const area = "Asistencias";
  record(area, "INFO", `Total asistencias: ${asistencias.length}`);

  const alumnoIds = new Set(alumnos.map(a => a.id));
  const huerfanas = asistencias.filter(a => !alumnoIds.has(a.alumnoId));
  if (huerfanas.length) record(area, "FAIL", `${huerfanas.length} asistencias apuntan a alumnoId inexistente`, huerfanas.slice(0, 5).map(a => `${a.id} → ${a.alumnoId}`).join(", "));

  const estadosInvalidos = asistencias.filter(a => !ESTADOS.has(a.estado));
  if (estadosInvalidos.length) record(area, "FAIL", `${estadosInvalidos.length} asistencias con estado inválido`, estadosInvalidos.slice(0,5).map(a => `${a.id}: ${a.estado}`).join(", "));

  // Regla doc: "Las clases son SIEMPRE los martes y miércoles."
  const fueraDeDia = asistencias.filter(a => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) return true;
    const d = new Date(a.fecha + "T12:00:00Z");
    const dow = d.getUTCDay();
    return dow !== 2 && dow !== 3;
  });
  if (fueraDeDia.length) {
    record(area, "FAIL", `${fueraDeDia.length} asistencias en día que NO es martes/miércoles`, fueraDeDia.slice(0,10).map(a => `${a.id}: ${a.fecha}`).join(", "));
  } else {
    record(area, "PASS", "Todas las asistencias caen en martes o miércoles");
  }

  // Duplicados (alumno, fecha)
  const porKey = new Map<string, Asistencia[]>();
  for (const a of asistencias) {
    const k = `${a.alumnoId}|${a.fecha}`;
    const arr = porKey.get(k) ?? [];
    arr.push(a);
    porKey.set(k, arr);
  }
  const duplicadas = [...porKey.entries()].filter(([_, arr]) => arr.length > 1);
  if (duplicadas.length) {
    record(area, "FAIL", `${duplicadas.length} pares (alumno, fecha) con asistencia duplicada`, duplicadas.slice(0,5).map(([k, arr]) => `${k}: ${arr.length} docs`).join("\n  "));
  } else {
    record(area, "PASS", "No hay asistencias duplicadas para mismo alumno+fecha");
  }

  // Snapshots completos: doc dice "Snapshot de tarifas y profesional asignado en cada asistencia"
  const sinTarifaInstr = asistencias.filter(a => typeof a.tarifaInstructorAplicada !== "number");
  const sinTarifaProfe = asistencias.filter(a => typeof a.tarifaProfeGuiaAplicada !== "number");
  const sinSnapProfe = asistencias.filter(a => typeof a.profeGuiaIdSnapshot !== "string");
  const sinSnapInstr = asistencias.filter(a => typeof a.instructorIdSnapshot !== "string");
  if (sinTarifaInstr.length) record(area, "WARN", `${sinTarifaInstr.length} asistencias sin tarifaInstructorAplicada (legacy v1; usan configPagos actual al calcular)`);
  if (sinTarifaProfe.length) record(area, "WARN", `${sinTarifaProfe.length} asistencias sin tarifaProfeGuiaAplicada (legacy v1)`);
  if (sinSnapProfe.length) record(area, "WARN", `${sinSnapProfe.length} asistencias sin profeGuiaIdSnapshot (legacy v1)`);
  if (sinSnapInstr.length) record(area, "WARN", `${sinSnapInstr.length} asistencias sin instructorIdSnapshot (legacy v1)`);
  if (!sinTarifaInstr.length && !sinTarifaProfe.length && !sinSnapProfe.length && !sinSnapInstr.length) {
    record(area, "PASS", "Todas las asistencias traen snapshots de tarifas y profesionales");
  }

  // Distribución estados (sanity: ~70/15/15)
  const counts: Record<string, number> = { Presente: 0, Tarde: 0, Ausente: 0 };
  for (const a of asistencias) if (a.estado in counts) counts[a.estado]++;
  const total = asistencias.length || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  record(area, "INFO", `Mix estados: Presente ${counts.Presente} (${pct(counts.Presente)}%), Tarde ${counts.Tarde} (${pct(counts.Tarde)}%), Ausente ${counts.Ausente} (${pct(counts.Ausente)}%)`);

  // Sucursal/curso/turno de la asistencia debe coincidir con el alumno
  const alumnoMap = new Map(alumnos.map(a => [a.id, a]));
  const desalineadas: string[] = [];
  for (const a of asistencias) {
    const alu = alumnoMap.get(a.alumnoId);
    if (!alu) continue;
    if (alu.sucursal !== a.sucursal) desalineadas.push(`${a.id}: sucursal ${a.sucursal} ≠ alumno ${alu.sucursal}`);
    if (alu.curso !== a.curso) desalineadas.push(`${a.id}: curso ${a.curso} ≠ alumno ${alu.curso}`);
    if (a.turno && alu.horario !== a.turno) desalineadas.push(`${a.id}: turno ${a.turno} ≠ alumno ${alu.horario}`);
  }
  if (desalineadas.length) {
    record(area, "FAIL", `${desalineadas.length} asistencias con sucursal/curso/turno distinto al del alumno`, desalineadas.slice(0,5).join("\n  "));
  } else {
    record(area, "PASS", "Sucursal/curso/turno de cada asistencia coincide con el alumno");
  }
}

// ============================================================
// 5) Evaluaciones
// ============================================================

interface Evaluacion { id: string; alumnoId: string; fecha: string; nota: number; sucursal: string; curso: string; }

async function loadEvaluaciones(): Promise<Evaluacion[]> {
  const snap = await db.collection("evaluacionesAlumnos").get();
  return snap.docs.map(d => {
    const x = d.data();
    return { id: d.id, alumnoId: x.alumnoId ?? "", fecha: x.fecha ?? "", nota: Number(x.nota), sucursal: x.sucursal, curso: x.curso };
  });
}

async function checkEvaluaciones(evals: Evaluacion[], asistencias: Asistencia[], alumnos: Alumno[]) {
  const area = "Evaluaciones";
  record(area, "INFO", `Total evaluaciones: ${evals.length}`);

  const fuera = evals.filter(e => !(e.nota >= 1 && e.nota <= 10));
  if (fuera.length) record(area, "FAIL", `${fuera.length} evaluaciones con nota fuera de 1–10`, fuera.slice(0,5).map(e => `${e.id}: ${e.nota}`).join(", "));
  else record(area, "PASS", "Todas las notas en rango 1–10");

  const alumnoIds = new Set(alumnos.map(a => a.id));
  const huerfanas = evals.filter(e => !alumnoIds.has(e.alumnoId));
  if (huerfanas.length) record(area, "FAIL", `${huerfanas.length} evaluaciones apuntan a alumno inexistente`);

  // Una evaluación implica que el alumno estuvo Presente o Tarde ese día
  const asistKey = new Map<string, string>();
  for (const a of asistencias) asistKey.set(`${a.alumnoId}|${a.fecha}`, a.estado);
  const inconsistentes: string[] = [];
  for (const e of evals) {
    const estado = asistKey.get(`${e.alumnoId}|${e.fecha}`);
    if (!estado) inconsistentes.push(`${e.id}: evalúa pero no hay asistencia (${e.alumnoId}|${e.fecha})`);
    else if (estado === "Ausente") inconsistentes.push(`${e.id}: evalúa pero estaba Ausente (${e.alumnoId}|${e.fecha})`);
  }
  if (inconsistentes.length) {
    record(area, "WARN", `${inconsistentes.length} evaluaciones sin asistencia Presente/Tarde correspondiente`, inconsistentes.slice(0,5).join("\n  "));
  } else {
    record(area, "PASS", "Todas las evaluaciones corresponden a asistencias Presente/Tarde");
  }
}

// ============================================================
// 6) Cálculo de pagos del mes — instructor escalado y profe guía
// ============================================================

async function checkPagos(
  asistencias: Asistencia[], alumnos: Alumno[],
  instructores: Instructor[], profes: ProfeGuia[]
) {
  const area = "Cálculo de pagos";
  // Tomar mes actual de las asistencias mayoritarias
  const counts = new Map<string, number>();
  for (const a of asistencias) counts.set(a.fecha.slice(0,7), (counts.get(a.fecha.slice(0,7)) ?? 0) + 1);
  const [mes] = [...counts.entries()].sort((a,b) => b[1]-a[1])[0] ?? ["", 0];
  if (!mes) { record(area, "WARN", "Sin asistencias para evaluar pagos"); return; }
  record(area, "INFO", `Calculando pagos para mes con más asistencias: ${mes}`);

  // Cargar configPagos para los montos escalados
  const config = (await db.collection("configPagos").doc("default").get()).data() ?? {};
  const montoEscalado = config.montosInstructorEscalados ?? config.tarifaEscaladaInstructor ?? null;
  const tarifasInstr = config.tarifasInstructor ?? {};
  const tarifasProfe = config.tarifasProfeGuia ?? {};

  // Filtrar asistencias del mes y solo Presente/Tarde
  const delMes = asistencias.filter(a => a.fecha.startsWith(mes) && (a.estado === "Presente" || a.estado === "Tarde"));

  // === Instructor: agrupar por (instructorId, fecha) y aplicar escalado ===
  const alumnoPorId = new Map(alumnos.map(a => [a.id, a]));
  const grupoInstr = new Map<string, Map<string, number>>(); // instructorId -> fecha -> count
  for (const a of delMes) {
    const alu = alumnoPorId.get(a.alumnoId);
    if (!alu) continue;
    const instrId = a.instructorIdSnapshot || alu.instructorId || "";
    if (!instrId) continue; // alumno asignado a profe guía, no a instructor
    const dias = grupoInstr.get(instrId) ?? new Map();
    dias.set(a.fecha, (dias.get(a.fecha) ?? 0) + 1);
    grupoInstr.set(instrId, dias);
  }

  if (montoEscalado && typeof montoEscalado === "object" && "primero" in montoEscalado && "adicional" in montoEscalado) {
    const { primero, adicional } = montoEscalado as { primero: number; adicional: number };
    record(area, "INFO", `Modelo escalado instructor: $${primero} (1° alumno) + $${adicional} (cada adicional)`);
    const instrPorId = new Map(instructores.map(i => [i.id, i]));
    let totalGeneral = 0;
    for (const [instrId, dias] of grupoInstr) {
      let total = 0;
      let alumnosTotal = 0;
      for (const [, count] of dias) {
        if (count <= 0) continue;
        total += primero + Math.max(0, count - 1) * adicional;
        alumnosTotal += count;
      }
      const i = instrPorId.get(instrId);
      record(area, "INFO", `${i?.username ?? instrId}: ${dias.size} días, ${alumnosTotal} alumnos-asistencias, $${total.toLocaleString("es-CL")}`);
      totalGeneral += total;
    }
    record(area, "INFO", `Total a pagar a instructores este mes: $${totalGeneral.toLocaleString("es-CL")}`);
  } else {
    // Fallback: usar tarifaInstructorAplicada si existe (modelo lineal)
    record(area, "WARN", `configPagos NO tiene 'montosInstructorEscalados' — el doc indica modelo escalado (1°+adicional). Encontradas tarifas planas: ${JSON.stringify(tarifasInstr)}`);
    let totalGeneral = 0;
    for (const a of delMes) {
      const alu = alumnoPorId.get(a.alumnoId);
      if (!alu) continue;
      const instrId = a.instructorIdSnapshot || alu.instructorId || "";
      if (!instrId) continue;
      const t = a.tarifaInstructorAplicada ?? tarifasInstr[a.curso] ?? 0;
      totalGeneral += t;
    }
    record(area, "INFO", `Total instructores (modelo lineal): $${totalGeneral.toLocaleString("es-CL")}`);
  }

  // === Profe guía: tarifa por curso ===
  const profePorId = new Map(profes.map(p => [p.id, p]));
  const totalesProfe = new Map<string, number>();
  for (const a of delMes) {
    const alu = alumnoPorId.get(a.alumnoId);
    if (!alu) continue;
    const profeId = a.profeGuiaIdSnapshot || alu.profeGuiaId || "";
    if (!profeId) continue;
    const tarifa = a.tarifaProfeGuiaAplicada ?? tarifasProfe[a.curso] ?? 0;
    totalesProfe.set(profeId, (totalesProfe.get(profeId) ?? 0) + tarifa);
  }
  let totalGeneralProfe = 0;
  for (const [pid, total] of totalesProfe) {
    const p = profePorId.get(pid);
    record(area, "INFO", `${p?.nombre ?? pid}: $${total.toLocaleString("es-CL")}`);
    totalGeneralProfe += total;
  }
  record(area, "INFO", `Total a pagar a profes guías este mes: $${totalGeneralProfe.toLocaleString("es-CL")}`);
}

// ============================================================
// 7) Pagos de alumnos del mes
// ============================================================

async function checkPagosAlumnos(alumnos: Alumno[]) {
  const area = "Pagos de alumnos";
  const snap = await db.collection("pagosAlumnos").get();
  record(area, "INFO", `Total pagos registrados (todo histórico): ${snap.size}`);
  const pagos = snap.docs.map(d => d.data());

  // Pagos sin comprobante (doc: "Comprobante OBLIGATORIO en todos los medios de pago")
  const sinComprobante = pagos.filter(p => !p.comprobanteUrl);
  if (sinComprobante.length) {
    record(area, "WARN", `${sinComprobante.length} pagos sin comprobanteUrl — el doc dice 'Comprobante OBLIGATORIO en todos los medios de pago'`);
  } else if (pagos.length > 0) {
    record(area, "PASS", "Todos los pagos tienen comprobanteUrl");
  }

  // Pagos sin tipoPago: doc dice fallback a "Total"
  const sinTipo = pagos.filter(p => !p.tipoPago);
  if (sinTipo.length) record(area, "INFO", `${sinTipo.length} pagos sin tipoPago (legacy: se asume 'Total')`);

  // Pagos huérfanos (alumno borrado físicamente)
  const alumnoIds = new Set(alumnos.map(a => a.id));
  const huerfanos = pagos.filter(p => p.alumnoId && !alumnoIds.has(p.alumnoId));
  if (huerfanos.length) record(area, "WARN", `${huerfanos.length} pagos a alumnoId que ya no existe (borrado físico, no soft-delete)`);
}

// ============================================================
// 8) Temario
// ============================================================

async function checkTemario() {
  const area = "Temario";
  const snap = await db.collection("temarios").get();
  record(area, "INFO", `Documentos en temarios: ${snap.size}`);
  const cursosCubiertos = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.curso) cursosCubiertos.add(data.curso);
  }
  for (const c of CURSOS) {
    if (!cursosCubiertos.has(c)) record(area, "WARN", `Curso ${c} sin temario configurado — el aula virtual no podrá mostrar 'Tema de hoy'`);
    else record(area, "PASS", `Curso ${c} tiene temario`);
  }
}

// ============================================================
// 9) Asistencias profes guías (doc: tarjeta separada en /aulas)
// ============================================================

async function checkAsistenciasProfes(profes: ProfeGuia[]) {
  const area = "Asistencias profes guías";
  const snap = await db.collection("asistenciasProfesGuias").get();
  record(area, "INFO", `Total asistencias profes guías: ${snap.size}`);
  const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));

  const profeIds = new Set(profes.map(p => p.id));
  const huerfanas = docs.filter(d => d.profeGuiaId && !profeIds.has(d.profeGuiaId as string));
  if (huerfanas.length) record(area, "FAIL", `${huerfanas.length} asistencias apuntan a profeGuiaId inexistente`);

  const fueraDeDia = docs.filter(d => {
    const f = d.fecha as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return true;
    const dt = new Date(f + "T12:00:00Z");
    return dt.getUTCDay() !== 2 && dt.getUTCDay() !== 3;
  });
  if (fueraDeDia.length) record(area, "FAIL", `${fueraDeDia.length} asistencias de profe guía fuera de martes/miércoles`);
  else record(area, "PASS", "Asistencias de profes guías solo en martes/miércoles");
}

// ============================================================
// Run
// ============================================================

async function main() {
  console.log("==========================================");
  console.log(" QA OperoEducator — verificación de datos");
  console.log("==========================================\n");

  await checkConfiguracion();
  const [alumnos, instructores, profes, asistencias, evals] = await Promise.all([
    loadAlumnos(), loadInstructores(), loadProfesGuias(),
    loadAsistencias(), loadEvaluaciones(),
  ]);
  await checkAlumnos(alumnos);
  await checkProfesionales(alumnos, instructores, profes);
  await checkAsistencias(asistencias, alumnos);
  await checkEvaluaciones(evals, asistencias, alumnos);
  await checkPagos(asistencias, alumnos, instructores, profes);
  await checkPagosAlumnos(alumnos);
  await checkTemario();
  await checkAsistenciasProfes(profes);

  // Output
  console.log("\n========== HALLAZGOS ==========\n");
  for (const f of findings) {
    const tag = f.severity.padEnd(4);
    console.log(`[${tag}] (${f.area}) ${f.message}`);
    if (f.details) console.log("       " + f.details.split("\n").join("\n       "));
  }

  // Resumen
  const counts: Record<Severity, number> = { FAIL: 0, WARN: 0, PASS: 0, INFO: 0 };
  for (const f of findings) counts[f.severity]++;
  console.log("\n========== RESUMEN ==========");
  console.log(`FAIL: ${counts.FAIL}  |  WARN: ${counts.WARN}  |  PASS: ${counts.PASS}  |  INFO: ${counts.INFO}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
