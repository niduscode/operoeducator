// Seed runner para Node usando firebase-admin (bypass de reglas).
//
// USO:
//   npx tsx scripts/seed-test-data.ts
//
// Requiere: .firebase-service-account.json en la raíz del repo.
// Lee la misma configuración de "ciudades target", bancos de nombres y
// distribuciones que lib/seed-test-data.ts (script gemelo para browser).
// Idempotente en asistencias y evaluaciones; NO en alumnos / profes guías.

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
import type { firestore as FB } from "firebase-admin";

// ============================================================
// Bootstrap admin SDK
// ============================================================

const SA_PATH = path.resolve(process.cwd(), ".firebase-service-account.json");
if (!fs.existsSync(SA_PATH)) {
  console.error(`No encontré ${SA_PATH}. Coloca el JSON de service account ahí.`);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(SA_PATH, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// ============================================================
// Tipos (subset de lib/types.ts)
// ============================================================

type Sucursal = "Muermos" | "Puerto Montt" | "Osorno" | "Valdivia" | "Temuco";
type Curso = "Junior" | "Senior" | "Master";
type Horario = "Mañana" | "Tarde";
type EstadoAsistencia = "Presente" | "Tarde" | "Ausente";

const INTERNAL_DOMAIN = "@operoeducator.internal";

interface DistribucionCiudad {
  sucursal: Sucursal;
  alumnosPorGrupo: number;
  profesGuiasACrear: number;
}

const CIUDADES_TARGET: DistribucionCiudad[] = [
  { sucursal: "Temuco", alumnosPorGrupo: 3, profesGuiasACrear: 2 },
  { sucursal: "Valdivia", alumnosPorGrupo: 3, profesGuiasACrear: 2 },
  { sucursal: "Puerto Montt", alumnosPorGrupo: 6, profesGuiasACrear: 5 },
  { sucursal: "Osorno", alumnosPorGrupo: 6, profesGuiasACrear: 5 },
];

const CURSOS_TARGET: Curso[] = ["Junior", "Senior"];
const HORARIOS: Horario[] = ["Mañana", "Tarde"];
const ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD = 2;
const CREADO_POR = "director.christan";

// ============================================================
// Bancos de nombres
// ============================================================

const NOMBRES_ALUMNOS = [
  "Sofía Pérez", "Mateo González", "Valentina Rojas", "Benjamín Soto",
  "Florencia Muñoz", "Tomás Vargas", "Antonia Silva", "Joaquín Castro",
  "Isidora Fuentes", "Vicente Espinoza", "Catalina Reyes", "Maximiliano Núñez",
  "Emilia Tapia", "Agustín Bravo", "Renata Sandoval", "Diego Carrasco",
  "Trinidad Salas", "Cristóbal Pinto", "Amanda Vega", "Lucas Maldonado",
  "Javiera Riquelme", "Martín Olivares", "Constanza Henríquez", "Felipe Pizarro",
  "Camila Aravena", "Sebastián Toro", "Magdalena Cáceres", "Gabriel Cortés",
  "Rafaela Lagos", "Vicente Araya", "Antonella Saavedra", "Bruno Cabrera",
  "Pascale Miranda", "Fernanda Vergara", "Alonso Escobar", "Maite Quiroz",
  "Cristián Gallardo", "Belén Acuña", "Ignacio Donoso", "Martina Rivera",
  "Lautaro Pavez", "Anaís Yáñez", "Gaspar Leiva", "Esperanza Sepúlveda",
  "Bastián Salinas", "Catalina Astudillo", "Nicolás Burgos", "Julieta Vidal",
  "Pedro Mella", "Olivia Rivas", "Eduardo Cifuentes", "Aurora Plaza",
  "Damián Garrido", "Luna Becerra", "Hernán Carvajal", "Paula Valenzuela",
  "Lukas Inostroza", "Renata Hidalgo", "Claudio Vásquez", "Trinidad Ortiz",
  "Sergio Mardones", "Alessia Quintana", "Jorge Cifuentes", "Macarena Lobos",
  "Esteban Riveros", "Gloria Concha", "Ricardo Naranjo", "Antonia Faúndez",
  "Ariel Bustamante", "Constanza Yévenes", "Rodrigo Pizarro", "Marisol Soto",
  "Pablo Albornoz", "Ignacia Veliz", "Cristhian Mansilla", "Ámbar Reyes",
  "Hans Stange", "Karla Núñez", "Iván Astorga", "Kiara Beltrán",
];

const NOMBRES_PROFES_GUIAS = [
  "Carolina Martínez", "Andrés Pizarro", "Daniela Lobos", "Rodrigo Saavedra",
  "Paula Catalán", "Mauricio Allende", "Javiera Toledo", "Gonzalo Bustos",
  "Isidora Bermejo", "Patricio Olivos", "Solange Tapia", "Marcelo Vidal",
  "Karen Pino", "Esteban Larraín", "Bárbara Salinas",
];

const NOMBRES_INSTRUCTORES_FICTICIOS: Record<Sucursal, { username: string; nombre: string }> = {
  Muermos: { username: "instructor.test.muermos", nombre: "Camilo Bahamondes" },
  "Puerto Montt": { username: "instructor.test.puertomontt", nombre: "Daniela Oyarzún" },
  Osorno: { username: "instructor.test.osorno", nombre: "Rodrigo Pailalef" },
  Valdivia: { username: "instructor.test.valdivia", nombre: "Francisca Schneider" },
  Temuco: { username: "instructor.test.temuco", nombre: "Matías Curihuentro" },
};

// ============================================================
// Helpers
// ============================================================

function pickWeighted<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

function telefonoFalso(): string {
  const n = Math.floor(10_000_000 + Math.random() * 89_999_999);
  return `+56 9 ${String(n).slice(0, 4)} ${String(n).slice(4, 8)}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isoDateTime(d: Date): string {
  return d.toISOString();
}

function ultimosDiasClase(hasta: Date, cantidad: number): string[] {
  const fechas: string[] = [];
  const cursor = new Date(hasta.getTime());
  cursor.setHours(12, 0, 0, 0);
  while (fechas.length < cantidad) {
    const dow = cursor.getDay();
    if (dow === 2 || dow === 3) fechas.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return fechas.reverse();
}

function estadoAleatorio(): EstadoAsistencia {
  return pickWeighted<EstadoAsistencia>([
    { value: "Presente", weight: 70 },
    { value: "Tarde", weight: 15 },
    { value: "Ausente", weight: 15 },
  ]);
}

function notaAleatoria(): number {
  return pickWeighted<number>([
    { value: 1, weight: 1 }, { value: 2, weight: 1 }, { value: 3, weight: 2 },
    { value: 4, weight: 4 }, { value: 5, weight: 8 }, { value: 6, weight: 12 },
    { value: 7, weight: 15 }, { value: 8, weight: 15 }, { value: 9, weight: 10 },
    { value: 10, weight: 6 },
  ]);
}

function roundRobin<T>(buckets: T[], n: number): T[] {
  if (buckets.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(buckets[i % buckets.length]);
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out as T;
}

// ============================================================
// Lecturas
// ============================================================

interface ConfigPagosLite {
  tarifasInstructor: { Junior: number; Senior: number; Master: number };
  tarifasProfeGuia: { Junior: number; Senior: number; Master: number };
}

let configCache: ConfigPagosLite | null = null;
async function getConfigPagos(): Promise<ConfigPagosLite> {
  if (configCache) return configCache;
  const snap = await db.collection("configPagos").doc("default").get();
  const data = snap.data() ?? {};
  configCache = {
    tarifasInstructor: data.tarifasInstructor ?? { Junior: 0, Senior: 0, Master: 0 },
    tarifasProfeGuia: data.tarifasProfeGuia ?? { Junior: 0, Senior: 0, Master: 0 },
  };
  return configCache;
}

interface InstructorLite {
  id: string;
  username: string;
  sucursalActual: Sucursal;
  activo: boolean;
}

async function getInstructoresPorSucursal(sucursal: Sucursal): Promise<InstructorLite[]> {
  const snap = await db.collection("instructores")
    .where("sucursalActual", "==", sucursal).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      username: data.username ?? "",
      sucursalActual: data.sucursalActual,
      activo: data.activo ?? true,
    };
  });
}

interface ProfeGuiaLite {
  id: string;
  nombre: string;
  sucursal: Sucursal;
  activo: boolean;
}

async function getProfesGuiasPorSucursal(sucursal: Sucursal): Promise<ProfeGuiaLite[]> {
  const snap = await db.collection("profesGuias")
    .where("sucursal", "==", sucursal).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      nombre: data.nombre ?? "",
      sucursal: data.sucursal,
      activo: data.activo ?? true,
    };
  });
}

interface AlumnoLite {
  id: string;
  curso: Curso;
  horario: Horario;
  sucursal: Sucursal;
  instructorId?: string;
  profeGuiaId?: string;
  activo: boolean;
}

async function getAlumnosPorSucursal(sucursal: Sucursal): Promise<AlumnoLite[]> {
  const snap = await db.collection("alumnos")
    .where("sucursal", "==", sucursal).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      curso: data.curso,
      horario: data.horario,
      sucursal: data.sucursal,
      instructorId: data.instructorId,
      profeGuiaId: data.profeGuiaId,
      activo: data.activo ?? true,
    };
  });
}

async function fechasAsistenciasYaRegistradas(alumnoId: string): Promise<Set<string>> {
  const snap = await db.collection("asistenciasAlumnos")
    .where("alumnoId", "==", alumnoId).get();
  return new Set(snap.docs.map((d) => d.data().fecha as string));
}

async function fechasEvaluacionesYaRegistradas(alumnoId: string): Promise<Set<string>> {
  const snap = await db.collection("evaluacionesAlumnos")
    .where("alumnoId", "==", alumnoId).get();
  return new Set(snap.docs.map((d) => d.data().fecha as string));
}

async function fechasAsistenciasProfeGuiaYaRegistradas(profeGuiaId: string): Promise<Set<string>> {
  const snap = await db.collection("asistenciasProfesGuias")
    .where("profeGuiaId", "==", profeGuiaId).get();
  return new Set(snap.docs.map((d) => d.data().fecha as string));
}

// ============================================================
// Escrituras
// ============================================================

const ts = () => admin.firestore.FieldValue.serverTimestamp();

async function ensureInstructorEnSucursal(
  sucursal: Sucursal
): Promise<{ instructor: InstructorLite; fueCreado: boolean }> {
  const existentes = await getInstructoresPorSucursal(sucursal);
  const activos = existentes.filter((i) => i.activo);
  if (activos.length > 0) return { instructor: activos[0], fueCreado: false };

  const cfg = NOMBRES_INSTRUCTORES_FICTICIOS[sucursal];
  const fechaIngreso = isoDate(new Date());
  const fechaCreacion = isoDateTime(new Date());

  const batch = db.batch();
  const instructorRef = db.collection("instructores").doc();
  batch.set(instructorRef, stripUndefined({
    username: cfg.username,
    email: `${cfg.username}${INTERNAL_DOMAIN}`,
    nombreCompleto: cfg.nombre,
    telefono: telefonoFalso(),
    sucursalActual: sucursal,
    activo: true,
    fechaIngreso,
    fechaCreacion: ts(),
    creadoPor: CREADO_POR,
    authVerificado: false,
    createdAt: ts(),
  }));
  const historialRef = db.collection("historialAsignaciones").doc();
  batch.set(historialRef, {
    instructorId: instructorRef.id,
    sucursal,
    fechaInicio: fechaIngreso,
    fechaFin: null,
    razonCambio: "Asignación inicial",
    cambiadoPor: CREADO_POR,
    createdAt: ts(),
  });
  await batch.commit();

  return {
    instructor: { id: instructorRef.id, username: cfg.username, sucursalActual: sucursal, activo: true },
    fueCreado: true,
  };
}

async function crearProfesGuiasFicticios(
  sucursal: Sucursal,
  cantidad: number,
  banco: string[]
): Promise<ProfeGuiaLite[]> {
  const out: ProfeGuiaLite[] = [];
  const fechaIngreso = isoDate(new Date());
  for (let i = 0; i < cantidad; i++) {
    if (banco.length === 0) break;
    const nombre = banco.shift()!;
    const ref = await db.collection("profesGuias").add(stripUndefined({
      nombre,
      telefono: telefonoFalso(),
      sucursal,
      activo: true,
      fechaIngreso,
      createdAt: ts(),
    }));
    out.push({ id: ref.id, nombre, sucursal, activo: true });
  }
  return out;
}

interface AlumnoCreado { id: string; curso: Curso; horario: Horario; sucursal: Sucursal; }

async function crearAlumnosCiudad(
  cfg: DistribucionCiudad,
  instructor: InstructorLite,
  profesGuiasNuevos: ProfeGuiaLite[],
  banco: string[]
): Promise<AlumnoCreado[]> {
  const slots: { curso: Curso; horario: Horario }[] = [];
  for (const curso of CURSOS_TARGET) {
    for (const horario of HORARIOS) {
      for (let i = 0; i < cfg.alumnosPorGrupo; i++) slots.push({ curso, horario });
    }
  }

  const profesGuiasExistentes = await getProfesGuiasPorSucursal(cfg.sucursal);
  const profesGuiasActivos = [
    ...profesGuiasNuevos,
    ...profesGuiasExistentes.filter(
      (p) => p.activo && !profesGuiasNuevos.find((np) => np.id === p.id)
    ),
  ];

  const asignacionRest = roundRobin(
    profesGuiasActivos,
    Math.max(0, slots.length - ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD)
  );

  const fechaIngreso = isoDate(new Date());
  const out: AlumnoCreado[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (banco.length === 0) throw new Error("Banco de nombres de alumnos agotado");
    const nombre = banco.shift()!;
    const aInstructor = i < ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD;
    const profe =
      !aInstructor && asignacionRest.length > 0
        ? asignacionRest[i - ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD]
        : null;

    const ref = await db.collection("alumnos").add(stripUndefined({
      nombre,
      telefono: telefonoFalso(),
      sucursal: cfg.sucursal,
      curso: slot.curso,
      horario: slot.horario,
      fecha: fechaIngreso,
      instructorId: aInstructor ? instructor.id : undefined,
      profeGuiaId: !aInstructor && profe ? profe.id : undefined,
      activo: true,
      createdAt: ts(),
    }));
    out.push({ id: ref.id, curso: slot.curso, horario: slot.horario, sucursal: cfg.sucursal });
  }
  return out;
}

async function crearAsistenciasAlumno(
  alumno: AlumnoLite,
  fechas: string[],
  registradaPor: string,
  config: ConfigPagosLite
): Promise<{ creadas: number; saltadas: number }> {
  const yaReg = await fechasAsistenciasYaRegistradas(alumno.id);
  let creadas = 0, saltadas = 0;
  const batch = db.batch();
  let opsEnBatch = 0;
  for (const fecha of fechas) {
    if (yaReg.has(fecha)) { saltadas++; continue; }
    const ref = db.collection("asistenciasAlumnos").doc();
    batch.set(ref, stripUndefined({
      alumnoId: alumno.id,
      fecha,
      estado: estadoAleatorio(),
      registradaPor,
      sucursal: alumno.sucursal,
      curso: alumno.curso,
      turno: alumno.horario,
      tarifaInstructorAplicada: config.tarifasInstructor[alumno.curso] ?? 0,
      tarifaProfeGuiaAplicada: config.tarifasProfeGuia[alumno.curso] ?? 0,
      profeGuiaIdSnapshot: alumno.profeGuiaId ?? "",
      instructorIdSnapshot: alumno.instructorId ?? "",
      createdAt: ts(),
    }));
    opsEnBatch++;
    creadas++;
  }
  if (opsEnBatch > 0) await batch.commit();
  return { creadas, saltadas };
}

async function crearEvaluacionesAlumno(
  alumno: AlumnoLite,
  fechas: string[],
  evaluadoPor: string
): Promise<{ creadas: number; saltadas: number }> {
  const yaEval = await fechasEvaluacionesYaRegistradas(alumno.id);
  // Cargar asistencias para saber el estado por fecha
  const asistSnap = await db.collection("asistenciasAlumnos")
    .where("alumnoId", "==", alumno.id).get();
  const estadoPorFecha = new Map<string, EstadoAsistencia>();
  for (const d of asistSnap.docs) {
    const data = d.data();
    estadoPorFecha.set(data.fecha as string, data.estado as EstadoAsistencia);
  }

  let creadas = 0, saltadas = 0;
  const batch = db.batch();
  let opsEnBatch = 0;
  for (const fecha of fechas) {
    if (yaEval.has(fecha)) { saltadas++; continue; }
    const estado = estadoPorFecha.get(fecha);
    if (estado !== "Presente" && estado !== "Tarde") { saltadas++; continue; }
    const ref = db.collection("evaluacionesAlumnos").doc();
    batch.set(ref, stripUndefined({
      alumnoId: alumno.id,
      fecha,
      nota: notaAleatoria(),
      evaluadoPor,
      sucursal: alumno.sucursal,
      curso: alumno.curso,
      createdAt: ts(),
    }));
    opsEnBatch++;
    creadas++;
  }
  if (opsEnBatch > 0) await batch.commit();
  return { creadas, saltadas };
}

async function crearAsistenciasProfeGuia(
  profe: ProfeGuiaLite,
  fechas: string[],
  registradaPor: string
): Promise<{ creadas: number; saltadas: number }> {
  const yaReg = await fechasAsistenciasProfeGuiaYaRegistradas(profe.id);
  let creadas = 0, saltadas = 0;
  const batch = db.batch();
  let ops = 0;
  for (const fecha of fechas) {
    if (yaReg.has(fecha)) { saltadas++; continue; }
    const ref = db.collection("asistenciasProfesGuias").doc();
    batch.set(ref, stripUndefined({
      profeGuiaId: profe.id,
      fecha,
      estado: estadoAleatorio(),
      registradaPor,
      sucursal: profe.sucursal,
      createdAt: ts(),
    }));
    ops++;
    creadas++;
  }
  if (ops > 0) await batch.commit();
  return { creadas, saltadas };
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`[seed] proyecto=${serviceAccount.project_id}`);
  const fechasClase = ultimosDiasClase(new Date(), 6);
  console.log("[seed] fechas:", fechasClase);

  const config = await getConfigPagos();
  console.log("[seed] tarifas instructor:", config.tarifasInstructor);
  console.log("[seed] tarifas profeGuía:", config.tarifasProfeGuia);

  const bancoAlumnos = [...NOMBRES_ALUMNOS];
  const bancoProfes = [...NOMBRES_PROFES_GUIAS];

  const ctxs: {
    cfg: DistribucionCiudad;
    instructor: InstructorLite;
    profesGuiasNuevos: ProfeGuiaLite[];
  }[] = [];

  // 1) Instructores + profes guías
  for (const cfg of CIUDADES_TARGET) {
    const inst = await ensureInstructorEnSucursal(cfg.sucursal);
    console.log(
      `[seed] ${inst.fueCreado ? "✅ creado" : "⏭  ya había"} instructor ${cfg.sucursal}: ${inst.instructor.username}`
    );
    const pgs = await crearProfesGuiasFicticios(cfg.sucursal, cfg.profesGuiasACrear, bancoProfes);
    console.log(`[seed] ✅ ${pgs.length} profes guías creados en ${cfg.sucursal}`);
    ctxs.push({ cfg, instructor: inst.instructor, profesGuiasNuevos: pgs });
  }

  // 2) Alumnos
  let totalAlumnosCreados = 0;
  for (const ctx of ctxs) {
    const creados = await crearAlumnosCiudad(ctx.cfg, ctx.instructor, ctx.profesGuiasNuevos, bancoAlumnos);
    totalAlumnosCreados += creados.length;
    console.log(`[seed] ✅ ${creados.length} alumnos creados en ${ctx.cfg.sucursal}`);
  }

  // 3) Asistencias alumnos (todos los Junior/Senior de las 4 ciudades)
  let totAsistC = 0, totAsistS = 0;
  for (const ctx of ctxs) {
    const alumnos = (await getAlumnosPorSucursal(ctx.cfg.sucursal))
      .filter((a) => a.activo && CURSOS_TARGET.includes(a.curso));
    for (const a of alumnos) {
      const r = await crearAsistenciasAlumno(a, fechasClase, ctx.instructor.username, config);
      totAsistC += r.creadas; totAsistS += r.saltadas;
    }
    console.log(`[seed] ✅ Asistencias alumnos ${ctx.cfg.sucursal} (${alumnos.length} alumnos)`);
  }

  // 4) Evaluaciones (Presente/Tarde)
  let totEvalC = 0, totEvalS = 0;
  for (const ctx of ctxs) {
    const alumnos = (await getAlumnosPorSucursal(ctx.cfg.sucursal))
      .filter((a) => a.activo && CURSOS_TARGET.includes(a.curso));
    for (const a of alumnos) {
      const r = await crearEvaluacionesAlumno(a, fechasClase, ctx.instructor.username);
      totEvalC += r.creadas; totEvalS += r.saltadas;
    }
    console.log(`[seed] ✅ Evaluaciones ${ctx.cfg.sucursal}`);
  }

  // 5) Asistencias profes guías
  let totPgC = 0, totPgS = 0;
  for (const ctx of ctxs) {
    const profes = (await getProfesGuiasPorSucursal(ctx.cfg.sucursal)).filter((p) => p.activo);
    for (const pg of profes) {
      const r = await crearAsistenciasProfeGuia(pg, fechasClase, ctx.instructor.username);
      totPgC += r.creadas; totPgS += r.saltadas;
    }
    console.log(`[seed] ✅ Asistencias profes guías ${ctx.cfg.sucursal} (${profes.length} profes)`);
  }

  console.log("\n========== RESUMEN ==========");
  console.log("Alumnos creados:", totalAlumnosCreados);
  console.log(`Asistencias alumnos: ${totAsistC} creadas, ${totAsistS} saltadas`);
  console.log(`Evaluaciones: ${totEvalC} creadas, ${totEvalS} saltadas`);
  console.log(`Asistencias profes guías: ${totPgC} creadas, ${totPgS} saltadas`);
  console.log("=============================\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] ❌ ERROR:", e);
    process.exit(1);
  });
