// Seed masivo de datos de prueba para Temuco, Valdivia, Puerto Montt y Osorno.
//
// USO (manual, solo en desarrollo / testing):
//   1) Estar logueado como director (ej: director.christan).
//   2) En la consola del navegador:
//        const m = await import("/lib/seed-test-data");
//        await m.seedTestData("director.christan");
//      O bien, exponerlo desde un componente cliente:
//        import { seedTestData } from "@/lib/seed-test-data";
//        // en un onClick temporal: await seedTestData("director.christan")
//
// El script es idempotente:
//   - No crea instructor en una ciudad si ya hay uno activo.
//   - No duplica asistencia (alumno, fecha) ni evaluación (alumno, fecha).
//   - Sí crea profes guías y alumnos nuevos cada vez que corras (el script
//     no intenta reconocer "los mismos" creados antes). Si ya corriste el
//     seed, NO lo corras de nuevo a menos que quieras duplicar alumnos.
//
// Reglas de negocio respetadas:
//   - Tarifas y precios NO se tocan (configPagos / preciosAlumnos quedan igual).
//   - Master se ignora (no se crean alumnos/asistencias/evaluaciones Master).
//   - Asistencias y evaluaciones cubren las 6 últimas clases martes/miércoles.
//   - Mezcla aleatoria de Presente/Tarde/Ausente y de notas 1–10.
//   - 2 alumnos por ciudad asignados al instructor de la ciudad; el resto a
//     profes guías ficticios (round-robin 3–5 por profe).
//
// Tras correrlo, recarga las pantallas de /alumnos, /aulas, /pagos, /pagos-alumnos
// para ver los nuevos datos.
//
// Para limpiar todo, hay que borrar los docs manualmente desde Firestore Console.

import {
  createAlumno,
  createInstructor,
  createProfeGuia,
  getAsistenciasPorAlumno,
  getAsistenciasProfeGuiaPorMes,
  getEvaluacionesPorAlumno,
  getInstructoresPorSucursal,
  getProfesGuiasPorSucursal,
  registrarAsistenciaAlumno,
  registrarAsistenciaProfe,
  registrarEvaluacion,
} from "./firestore";
import {
  Curso,
  EstadoAsistencia,
  Horario,
  INTERNAL_DOMAIN,
  Instructor,
  ProfeGuia,
  Sucursal,
} from "./types";

// ============================================================
// Configuración del seed
// ============================================================

interface DistribucionCiudad {
  sucursal: Sucursal;
  // Cantidad de alumnos por (curso, horario)
  alumnosPorGrupo: number;
  // Cuántos profes guías ficticios crear en esa ciudad
  profesGuiasACrear: number;
}

const CIUDADES_TARGET: DistribucionCiudad[] = [
  { sucursal: "Temuco", alumnosPorGrupo: 3, profesGuiasACrear: 2 },
  { sucursal: "Valdivia", alumnosPorGrupo: 3, profesGuiasACrear: 2 },
  { sucursal: "Puerto Montt", alumnosPorGrupo: 6, profesGuiasACrear: 5 },
  { sucursal: "Osorno", alumnosPorGrupo: 6, profesGuiasACrear: 5 },
];

// Cursos donde sí se generan datos (Master excluido por pedido del usuario).
const CURSOS_TARGET: Curso[] = ["Junior", "Senior"];
const HORARIOS: Horario[] = ["Mañana", "Tarde"];

// 2 alumnos por ciudad van al instructor; el resto a profes guías.
const ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD = 2;

// ============================================================
// Bancos de nombres ficticios
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

// Devuelve las últimas N fechas martes/miércoles hasta `hasta` (inclusive si es M/W).
function ultimosDiasClase(hasta: Date, cantidad: number): string[] {
  const fechas: string[] = [];
  const cursor = new Date(hasta.getTime());
  cursor.setHours(12, 0, 0, 0); // evitar issues de DST
  while (fechas.length < cantidad) {
    const dow = cursor.getDay(); // 0=Dom, 2=Mar, 3=Mié
    if (dow === 2 || dow === 3) {
      fechas.push(isoDate(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return fechas.reverse(); // orden cronológico ascendente
}

function estadoAleatorio(): EstadoAsistencia {
  return pickWeighted<EstadoAsistencia>([
    { value: "Presente", weight: 70 },
    { value: "Tarde", weight: 15 },
    { value: "Ausente", weight: 15 },
  ]);
}

function notaAleatoria(): number {
  // Distribución realista: más densidad en 5–9, algo en 1–4 y 10.
  return pickWeighted<number>([
    { value: 1, weight: 1 }, { value: 2, weight: 1 }, { value: 3, weight: 2 },
    { value: 4, weight: 4 }, { value: 5, weight: 8 }, { value: 6, weight: 12 },
    { value: 7, weight: 15 }, { value: 8, weight: 15 }, { value: 9, weight: 10 },
    { value: 10, weight: 6 },
  ]);
}

// Round-robin: asigna `n` items a `buckets` y retorna lista de buckets.
function roundRobin<T>(buckets: T[], n: number): T[] {
  if (buckets.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(buckets[i % buckets.length]);
  return out;
}

// ============================================================
// Pasos del seed
// ============================================================

interface InstructorPorCiudad {
  sucursal: Sucursal;
  instructor: Instructor;
  fueCreado: boolean;
}

async function asegurarInstructorEnSucursal(
  sucursal: Sucursal,
  creadoPor: string
): Promise<InstructorPorCiudad> {
  const existentes = await getInstructoresPorSucursal(sucursal);
  const activos = existentes.filter((i) => i.activo !== false);
  if (activos.length > 0) {
    return { sucursal, instructor: activos[0], fueCreado: false };
  }
  const cfg = NOMBRES_INSTRUCTORES_FICTICIOS[sucursal];
  const fechaIngreso = isoDate(new Date());
  const id = await createInstructor({
    username: cfg.username,
    email: `${cfg.username}${INTERNAL_DOMAIN}`,
    nombreCompleto: cfg.nombre,
    telefono: telefonoFalso(),
    sucursalActual: sucursal,
    activo: true,
    fechaIngreso,
    // fechaCreacion: la maneja Postgres (created_at).
    userId: null,
    creadoPor,
    authVerificado: false,
  });
  const instructor: Instructor = {
    id,
    username: cfg.username,
    email: `${cfg.username}${INTERNAL_DOMAIN}`,
    nombreCompleto: cfg.nombre,
    telefono: telefonoFalso(),
    sucursalActual: sucursal,
    activo: true,
    fechaIngreso,
    fechaCreacion: isoDateTime(new Date()),
    creadoPor,
    authVerificado: false,
  };
  return { sucursal, instructor, fueCreado: true };
}

async function crearProfesGuiasFicticios(
  sucursal: Sucursal,
  cantidad: number,
  bancoNombres: string[]
): Promise<ProfeGuia[]> {
  const creados: ProfeGuia[] = [];
  const fechaIngreso = isoDate(new Date());
  for (let i = 0; i < cantidad; i++) {
    if (bancoNombres.length === 0) break;
    const nombre = bancoNombres.shift()!;
    const id = await createProfeGuia({
      nombre,
      telefono: telefonoFalso(),
      sucursal,
      activo: true,
      fechaIngreso,
    });
    creados.push({
      id,
      nombre,
      telefono: telefonoFalso(),
      sucursal,
      activo: true,
      fechaIngreso,
    });
  }
  return creados;
}

interface AlumnoCreado {
  id: string;
  sucursal: Sucursal;
  curso: Curso;
  horario: Horario;
}

async function crearAlumnosCiudad(
  cfg: DistribucionCiudad,
  instructor: Instructor,
  profesGuiasNuevos: ProfeGuia[],
  bancoNombres: string[]
): Promise<AlumnoCreado[]> {
  const creados: AlumnoCreado[] = [];
  const totalCiudad =
    CURSOS_TARGET.length * HORARIOS.length * cfg.alumnosPorGrupo;

  // Buckets: primero N al instructor (asignamos los primeros 2 alumnos creados),
  // resto repartido round-robin entre profes guías nuevos + existentes.
  const profesGuiasExistentes = await getProfesGuiasPorSucursal(cfg.sucursal);
  const profesGuiasActivos = [
    ...profesGuiasNuevos,
    ...profesGuiasExistentes.filter(
      (p) => p.activo !== false && !profesGuiasNuevos.find((np) => np.id === p.id)
    ),
  ];

  // Construir lista plana de "slots" por (curso, horario)
  const slots: { curso: Curso; horario: Horario }[] = [];
  for (const curso of CURSOS_TARGET) {
    for (const horario of HORARIOS) {
      for (let i = 0; i < cfg.alumnosPorGrupo; i++) {
        slots.push({ curso, horario });
      }
    }
  }
  if (slots.length !== totalCiudad) {
    throw new Error(
      `Slots calculados (${slots.length}) ≠ totalCiudad (${totalCiudad})`
    );
  }

  // Asignación: primeros 2 → instructor, resto → profes guías round-robin
  const asignacionPGRest = roundRobin(
    profesGuiasActivos,
    Math.max(0, totalCiudad - ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD)
  );

  const fechaIngreso = isoDate(new Date());

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (bancoNombres.length === 0) {
      throw new Error("Banco de nombres de alumnos agotado");
    }
    const nombre = bancoNombres.shift()!;
    const aInstructor = i < ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD;
    const profeGuia =
      !aInstructor && asignacionPGRest.length > 0
        ? asignacionPGRest[i - ALUMNOS_AL_INSTRUCTOR_POR_CIUDAD]
        : null;

    const id = await createAlumno({
      nombre,
      telefono: telefonoFalso(),
      sucursal: cfg.sucursal,
      curso: slot.curso,
      horario: slot.horario,
      fecha: fechaIngreso,
      instructorId: aInstructor ? instructor.id : undefined,
      profeGuiaId: !aInstructor && profeGuia ? profeGuia.id : undefined,
      activo: true,
    });
    creados.push({
      id,
      sucursal: cfg.sucursal,
      curso: slot.curso,
      horario: slot.horario,
    });
  }

  return creados;
}

async function crearAsistenciasAlumnos(
  alumnoId: string,
  sucursal: Sucursal,
  curso: Curso,
  horario: Horario,
  fechas: string[],
  registradaPor: string
): Promise<{ creadas: number; saltadas: number }> {
  // Lee asistencias existentes del alumno para no duplicar.
  const existentes = await getAsistenciasPorAlumno(alumnoId);
  const fechasYaRegistradas = new Set(existentes.map((a) => a.fecha));

  let creadas = 0;
  let saltadas = 0;
  for (const fecha of fechas) {
    if (fechasYaRegistradas.has(fecha)) {
      saltadas++;
      continue;
    }
    await registrarAsistenciaAlumno({
      alumnoId,
      fecha,
      estado: estadoAleatorio(),
      registradaPor,
      sucursal,
      curso,
      turno: horario,
    });
    creadas++;
  }
  return { creadas, saltadas };
}

async function crearEvaluaciones(
  alumnoId: string,
  sucursal: Sucursal,
  curso: Curso,
  fechas: string[],
  evaluadoPor: string
): Promise<{ creadas: number; saltadas: number }> {
  const existentes = await getEvaluacionesPorAlumno(alumnoId);
  const fechasYaEvaluadas = new Set(existentes.map((e) => e.fecha));

  // Para evaluaciones también necesitamos saber si el alumno asistió ese día
  // (Presente/Tarde). Solo evaluamos si asistió.
  const asistencias = await getAsistenciasPorAlumno(alumnoId);
  const asistenciasPorFecha = new Map(asistencias.map((a) => [a.fecha, a.estado]));

  let creadas = 0;
  let saltadas = 0;
  for (const fecha of fechas) {
    if (fechasYaEvaluadas.has(fecha)) {
      saltadas++;
      continue;
    }
    const estado = asistenciasPorFecha.get(fecha);
    if (estado !== "Presente" && estado !== "Tarde") {
      saltadas++;
      continue;
    }
    await registrarEvaluacion({
      alumnoId,
      fecha,
      nota: notaAleatoria(),
      evaluadoPor,
      sucursal,
      curso,
    });
    creadas++;
  }
  return { creadas, saltadas };
}

async function crearAsistenciasProfeGuia(
  profe: ProfeGuia,
  fechas: string[],
  registradaPor: string
): Promise<{ creadas: number; saltadas: number }> {
  // El helper getAsistenciasProfeGuiaPorMes filtra por mes. Como las 6 fechas
  // pueden cruzar 1–2 meses, cargamos los meses involucrados y unificamos.
  const mesesUnicos = new Set<string>();
  for (const f of fechas) mesesUnicos.add(f.slice(0, 7));
  const fechasYaRegistradas = new Set<string>();
  for (const ym of mesesUnicos) {
    const [añoStr, mesStr] = ym.split("-");
    const año = Number(añoStr);
    const mes = Number(mesStr);
    const lista = await getAsistenciasProfeGuiaPorMes(profe.id, mes, año);
    for (const a of lista) fechasYaRegistradas.add(a.fecha);
  }

  let creadas = 0;
  let saltadas = 0;
  for (const fecha of fechas) {
    if (fechasYaRegistradas.has(fecha)) {
      saltadas++;
      continue;
    }
    await registrarAsistenciaProfe({
      profeGuiaId: profe.id,
      fecha,
      estado: estadoAleatorio(),
      registradaPor,
      sucursal: profe.sucursal,
    });
    creadas++;
  }
  return { creadas, saltadas };
}

// ============================================================
// Entry point
// ============================================================

export interface SeedResumen {
  instructoresCreados: string[];
  profesGuiasCreados: string[];
  alumnosCreados: number;
  asistenciasAlumnoCreadas: number;
  asistenciasAlumnoSaltadas: number;
  asistenciasProfeCreadas: number;
  asistenciasProfeSaltadas: number;
  evaluacionesCreadas: number;
  evaluacionesSaltadas: number;
  errores: string[];
}

export async function seedTestData(
  creadoPor: string = "director.semilla"
): Promise<SeedResumen> {
  const resumen: SeedResumen = {
    instructoresCreados: [],
    profesGuiasCreados: [],
    alumnosCreados: 0,
    asistenciasAlumnoCreadas: 0,
    asistenciasAlumnoSaltadas: 0,
    asistenciasProfeCreadas: 0,
    asistenciasProfeSaltadas: 0,
    evaluacionesCreadas: 0,
    evaluacionesSaltadas: 0,
    errores: [],
  };

  console.log("[seed] Iniciando seed de datos de prueba…");

  const fechasClase = ultimosDiasClase(new Date(), 6);
  console.log("[seed] Fechas de las últimas 6 clases:", fechasClase);

  const bancoNombresAlumnos = [...NOMBRES_ALUMNOS];
  const bancoNombresProfes = [...NOMBRES_PROFES_GUIAS];

  // 1) Asegurar instructor por ciudad y crear profes guías
  const ciudadCtx: {
    cfg: DistribucionCiudad;
    instructor: Instructor;
    profesGuiasNuevos: ProfeGuia[];
  }[] = [];

  for (const cfg of CIUDADES_TARGET) {
    try {
      const inst = await asegurarInstructorEnSucursal(cfg.sucursal, creadoPor);
      if (inst.fueCreado) {
        resumen.instructoresCreados.push(
          `${inst.instructor.username} → ${cfg.sucursal}`
        );
        console.log(
          `[seed] ✅ Instructor creado en ${cfg.sucursal}: ${inst.instructor.username}`
        );
      } else {
        console.log(
          `[seed] ⏭  Instructor ya existía en ${cfg.sucursal}: ${inst.instructor.username}`
        );
      }
      const pgs = await crearProfesGuiasFicticios(
        cfg.sucursal,
        cfg.profesGuiasACrear,
        bancoNombresProfes
      );
      for (const pg of pgs) {
        resumen.profesGuiasCreados.push(`${pg.nombre} → ${cfg.sucursal}`);
      }
      console.log(`[seed] ✅ ${pgs.length} profes guías creados en ${cfg.sucursal}`);
      ciudadCtx.push({ cfg, instructor: inst.instructor, profesGuiasNuevos: pgs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumen.errores.push(`Setup ${cfg.sucursal}: ${msg}`);
      console.error(`[seed] ❌ Setup ${cfg.sucursal}:`, msg);
    }
  }

  // 2) Crear alumnos por ciudad
  const alumnosCreados: AlumnoCreado[] = [];
  for (const ctx of ciudadCtx) {
    try {
      const creados = await crearAlumnosCiudad(
        ctx.cfg,
        ctx.instructor,
        ctx.profesGuiasNuevos,
        bancoNombresAlumnos
      );
      alumnosCreados.push(...creados);
      resumen.alumnosCreados += creados.length;
      console.log(
        `[seed] ✅ ${creados.length} alumnos creados en ${ctx.cfg.sucursal}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumen.errores.push(`Alumnos ${ctx.cfg.sucursal}: ${msg}`);
      console.error(`[seed] ❌ Alumnos ${ctx.cfg.sucursal}:`, msg);
    }
  }

  // 3) Asistencias para TODOS los alumnos (Junior/Senior) de las 4 ciudades
  //    Nota: incluye alumnos pre-existentes en esas ciudades.
  for (const ctx of ciudadCtx) {
    // Carga todos los alumnos activos de la ciudad (existentes + nuevos)
    let alumnosCiudad: { id: string; curso: Curso; horario: Horario }[] = [];
    try {
      const { getAlumnosPorSucursal } = await import("./firestore");
      const lista = await getAlumnosPorSucursal(ctx.cfg.sucursal);
      alumnosCiudad = lista
        .filter((a) => (a.activo ?? true) && CURSOS_TARGET.includes(a.curso))
        .map((a) => ({ id: a.id, curso: a.curso, horario: a.horario }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumen.errores.push(`Listar alumnos ${ctx.cfg.sucursal}: ${msg}`);
      continue;
    }

    for (const al of alumnosCiudad) {
      try {
        const r = await crearAsistenciasAlumnos(
          al.id,
          ctx.cfg.sucursal,
          al.curso,
          al.horario,
          fechasClase,
          ctx.instructor.username
        );
        resumen.asistenciasAlumnoCreadas += r.creadas;
        resumen.asistenciasAlumnoSaltadas += r.saltadas;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resumen.errores.push(`Asistencia alumno ${al.id}: ${msg}`);
      }
    }
    console.log(
      `[seed] ✅ Asistencias procesadas en ${ctx.cfg.sucursal} (${alumnosCiudad.length} alumnos)`
    );
  }

  // 4) Evaluaciones para alumnos que estuvieron Presente/Tarde
  for (const ctx of ciudadCtx) {
    let alumnosCiudad: { id: string; curso: Curso }[] = [];
    try {
      const { getAlumnosPorSucursal } = await import("./firestore");
      const lista = await getAlumnosPorSucursal(ctx.cfg.sucursal);
      alumnosCiudad = lista
        .filter((a) => (a.activo ?? true) && CURSOS_TARGET.includes(a.curso))
        .map((a) => ({ id: a.id, curso: a.curso }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumen.errores.push(`Listar alumnos eval ${ctx.cfg.sucursal}: ${msg}`);
      continue;
    }

    for (const al of alumnosCiudad) {
      try {
        const r = await crearEvaluaciones(
          al.id,
          ctx.cfg.sucursal,
          al.curso,
          fechasClase,
          ctx.instructor.username
        );
        resumen.evaluacionesCreadas += r.creadas;
        resumen.evaluacionesSaltadas += r.saltadas;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resumen.errores.push(`Eval alumno ${al.id}: ${msg}`);
      }
    }
    console.log(
      `[seed] ✅ Evaluaciones procesadas en ${ctx.cfg.sucursal}`
    );
  }

  // 5) Asistencias para profes guías (todos los activos en las 4 ciudades)
  for (const ctx of ciudadCtx) {
    let profesCiudad: ProfeGuia[] = [];
    try {
      profesCiudad = (await getProfesGuiasPorSucursal(ctx.cfg.sucursal)).filter(
        (p) => p.activo !== false
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumen.errores.push(`Listar profes guías ${ctx.cfg.sucursal}: ${msg}`);
      continue;
    }

    for (const pg of profesCiudad) {
      try {
        const r = await crearAsistenciasProfeGuia(
          pg,
          fechasClase,
          ctx.instructor.username
        );
        resumen.asistenciasProfeCreadas += r.creadas;
        resumen.asistenciasProfeSaltadas += r.saltadas;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resumen.errores.push(`Asistencia profe guía ${pg.id}: ${msg}`);
      }
    }
    console.log(
      `[seed] ✅ Asistencias profes guías procesadas en ${ctx.cfg.sucursal} (${profesCiudad.length} profes)`
    );
  }

  console.log("[seed] Resumen final:", resumen);
  return resumen;
}
