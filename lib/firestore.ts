// Capa de acceso a Firestore para OperoEducator.
//
// Decisión de diseño: colecciones raíz "alumnos" y "profesGuias".
// Motivo: la academia es single-tenant, las queries son más simples
// y las rules de seguridad no necesitan paths anidados. Si en el futuro
// se agrega multi-tenant, envolver en /tenants/{id}/... en una migración.

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Alumno,
  AsistenciaAlumno,
  AsistenciaProfeGuia,
  ConfigPagos,
  Curso,
  EvaluacionAlumno,
  HistorialAsignacion,
  Instructor,
  PagoAlumno,
  PagoCalculado,
  PagoRealizado,
  PreciosAlumnos,
  ProfeGuia,
  Sucursal,
  TarifasPorCurso,
  TemaSemana,
  TemarioCurso,
  Turno,
} from "./types";
import { CURSOS, DURACION_DEFAULT_CLASES } from "./types";

const ALUMNOS = "alumnos";
const PROFES_GUIAS = "profesGuias";
const INSTRUCTORES = "instructores";
const HISTORIAL_ASIGNACIONES = "historialAsignaciones";
const ASISTENCIAS_ALUMNOS = "asistenciasAlumnos";
const EVALUACIONES_ALUMNOS = "evaluacionesAlumnos";
const ASISTENCIAS_PROFES_GUIAS = "asistenciasProfesGuias";
const TEMARIOS = "temarios";
const CONFIG_PAGOS = "configPagos";
const PRECIOS_ALUMNOS = "preciosAlumnos";
const PAGOS_ALUMNOS = "pagosAlumnos";
const BATCH_MAX = 500;

// Tarifas por defecto si el director aún no las configuró.
// Cero implica "no calcula" — la UI debe mostrar un aviso si no hay config.
const TARIFAS_VACIAS: TarifasPorCurso = { Junior: 0, Senior: 0, Master: 0 };

const PAGOS_REALIZADOS = "pagosRealizados";

// Firestore rechaza valores `undefined` en addDoc/updateDoc/setDoc. Cuando un
// campo opcional viene vacío del form, llega como undefined y revienta el
// write. stripUndefined limpia el objeto antes de mandarlo al SDK.
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

// Normaliza un valor que pudo haberse guardado como ISO string (legado v1)
// o como Firestore Timestamp (vía serverTimestamp en v2). Devuelve string ISO
// para que las pantallas existentes sigan funcionando sin cambios.
function tsToISO(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  // Algunos shapes raros (FieldValue pendiente de commit, mock SDK).
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fallthrough
    }
  }
  return String(value);
}

// ----- helpers -----

type AlumnoInput = Omit<Alumno, "id">;
type ProfeGuiaInput = Omit<ProfeGuia, "id">;
// Al crear un instructor, fechaCreacion y creadoPor se completan en la capa
// de UI (la web no tiene noción del director excepto vía useAuth). El primer
// snapshot del historial se genera dentro de createInstructor() — no se debe
// crear a mano desde fuera.
type InstructorInput = Omit<Instructor, "id">;

function mapAlumnoDoc(snap: QueryDocumentSnapshot<DocumentData>): Alumno {
  const data = snap.data();
  return {
    id: snap.id,
    nombre: data.nombre ?? "",
    telefono: data.telefono ?? "",
    sucursal: data.sucursal,
    curso: data.curso,
    horario: data.horario,
    fecha: data.fecha ?? "",
    profeGuiaId: data.profeGuiaId ?? "",
    instructorId: data.instructorId ?? "",
    activo: data.activo ?? true,
  };
}

function mapInstructorDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): Instructor {
  const data = snap.data();
  return {
    id: snap.id,
    username: data.username ?? "",
    email: data.email ?? "",
    nombreCompleto: data.nombreCompleto ?? "",
    telefono: data.telefono ?? "",
    sucursalActual: data.sucursalActual,
    activo: data.activo ?? true,
    fechaIngreso: data.fechaIngreso ?? "",
    // fechaCreacion ahora se persiste vía serverTimestamp() — leer como ISO.
    fechaCreacion: tsToISO(data.fechaCreacion),
    creadoPor: data.creadoPor ?? "",
    authVerificado: data.authVerificado ?? false,
  };
}

function mapHistorialDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): HistorialAsignacion {
  const data = snap.data();
  return {
    id: snap.id,
    instructorId: data.instructorId ?? "",
    sucursal: data.sucursal,
    fechaInicio: data.fechaInicio ?? "",
    fechaFin: data.fechaFin ?? null,
    razonCambio: data.razonCambio ?? "",
    cambiadoPor: data.cambiadoPor ?? "",
  };
}

function mapProfeGuiaDoc(snap: QueryDocumentSnapshot<DocumentData>): ProfeGuia {
  const data = snap.data();
  return {
    id: snap.id,
    nombre: data.nombre ?? "",
    telefono: data.telefono ?? "",
    sucursal: data.sucursal,
    activo: data.activo ?? true,
    fechaIngreso: tsToISO(data.fechaIngreso) || (data.fechaIngreso ?? ""),
  };
}

// ============================================================
// ALUMNOS
// ============================================================

export async function getAlumnos(): Promise<Alumno[]> {
  try {
    const snap = await getDocs(collection(db, ALUMNOS));
    return snap.docs.map(mapAlumnoDoc);
  } catch (err) {
    console.error("getAlumnos:", err);
    throw new Error("No se pudieron cargar los alumnos.");
  }
}

export async function getAlumnosPorSucursal(
  sucursal: Sucursal
): Promise<Alumno[]> {
  try {
    const q = query(
      collection(db, ALUMNOS),
      where("sucursal", "==", sucursal)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapAlumnoDoc);
  } catch (err) {
    console.error("getAlumnosPorSucursal:", err);
    throw new Error(`No se pudieron cargar los alumnos de ${sucursal}.`);
  }
}

export async function createAlumno(data: AlumnoInput): Promise<string> {
  try {
    const ref = await addDoc(
      collection(db, ALUMNOS),
      stripUndefined({
        ...data,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("createAlumno:", err);
    throw new Error("No se pudo crear el alumno.");
  }
}

export async function updateAlumno(
  id: string,
  data: Partial<AlumnoInput>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, ALUMNOS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateAlumno:", err);
    throw new Error("No se pudo actualizar el alumno.");
  }
}

// Soft delete: marca activo=false. Conservamos pagos y asistencias.
// Para borrado físico, hacerlo desde Firestore Console (intencional).
export async function deleteAlumno(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, ALUMNOS, id), {
      activo: false,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("deleteAlumno:", err);
    throw new Error("No se pudo desactivar el alumno.");
  }
}

export async function deactivateAlumno(id: string): Promise<void> {
  return deleteAlumno(id);
}

export async function reactivateAlumno(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, ALUMNOS, id), {
      activo: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("reactivateAlumno:", err);
    throw new Error("No se pudo reactivar el alumno.");
  }
}

// Asigna un instructor al alumno y, en el mismo write, limpia su profeGuiaId.
// La regla del negocio: un alumno NO puede tener instructor y profe guía al
// mismo tiempo. Si `instructorId` es vacío, equivale a desasignarlo.
export async function asignarInstructorAAlumno(
  alumnoId: string,
  instructorId: string
): Promise<void> {
  try {
    await updateDoc(
      doc(db, ALUMNOS, alumnoId),
      stripUndefined({
        instructorId: instructorId || "",
        profeGuiaId: "",
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("asignarInstructorAAlumno:", err);
    throw new Error("No se pudo asignar el instructor al alumno.");
  }
}

// Asigna un profe guía al alumno y limpia su instructorId. Si `profeGuiaId`
// es vacío, equivale a desasignarlo.
export async function asignarProfeGuiaAAlumno(
  alumnoId: string,
  profeGuiaId: string
): Promise<void> {
  try {
    await updateDoc(
      doc(db, ALUMNOS, alumnoId),
      stripUndefined({
        profeGuiaId: profeGuiaId || "",
        instructorId: "",
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("asignarProfeGuiaAAlumno:", err);
    throw new Error("No se pudo asignar el profe guía al alumno.");
  }
}

// Sincroniza el set de alumnos asignados a UN instructor en una sola pasada.
// `idsActuales` = los alumnos que el form dejó como tildados.
// Para cada alumno que dejó de estar tildado y aún apunta a este instructor,
// limpiamos su instructorId. Para cada alumno tildado que no apunta aún,
// lo apuntamos (limpiando profeGuiaId si lo tenía).
export async function sincronizarAlumnosDeInstructor(
  instructorId: string,
  idsActuales: string[]
): Promise<void> {
  try {
    const setActuales = new Set(idsActuales);
    // Cargamos sólo los alumnos que ya están apuntando a este instructor;
    // así sabemos a quién hay que desasignar.
    const yaAsignados = await getDocs(
      query(
        collection(db, ALUMNOS),
        where("instructorId", "==", instructorId)
      )
    );
    const setYaAsignados = new Set(yaAsignados.docs.map((d) => d.id));

    const aDesasignar: string[] = [];
    for (const id of setYaAsignados) {
      if (!setActuales.has(id)) aDesasignar.push(id);
    }
    const aAsignar: string[] = [];
    for (const id of setActuales) {
      if (!setYaAsignados.has(id)) aAsignar.push(id);
    }
    if (aDesasignar.length === 0 && aAsignar.length === 0) return;

    const total = aDesasignar.length + aAsignar.length;
    for (let i = 0; i < total; i += BATCH_MAX) {
      const batch = writeBatch(db);
      const slice: { id: string; assign: boolean }[] = [
        ...aDesasignar.map((id) => ({ id, assign: false })),
        ...aAsignar.map((id) => ({ id, assign: true })),
      ].slice(i, i + BATCH_MAX);
      for (const { id, assign } of slice) {
        batch.update(
          doc(db, ALUMNOS, id),
          stripUndefined({
            instructorId: assign ? instructorId : "",
            // Si lo asignamos a este instructor, garantizamos exclusión.
            profeGuiaId: assign ? "" : undefined,
            updatedAt: serverTimestamp(),
          })
        );
      }
      await batch.commit();
    }
  } catch (err) {
    console.error("sincronizarAlumnosDeInstructor:", err);
    throw new Error("No se pudo sincronizar la lista de alumnos asignados.");
  }
}

// Importación masiva. Firestore limita writeBatch a 500 ops por commit:
// si hay más, partimos en chunks y esperamos todos los commits.
// Retornamos los IDs generados en el mismo orden que la entrada.
export async function createAlumnosMasivo(
  data: AlumnoInput[]
): Promise<string[]> {
  if (data.length === 0) return [];
  try {
    const ids: string[] = [];
    for (let i = 0; i < data.length; i += BATCH_MAX) {
      const chunk = data.slice(i, i + BATCH_MAX);
      const batch = writeBatch(db);
      const chunkIds: string[] = [];
      for (const row of chunk) {
        const ref = doc(collection(db, ALUMNOS));
        batch.set(
          ref,
          stripUndefined({ ...row, createdAt: serverTimestamp() })
        );
        chunkIds.push(ref.id);
      }
      await batch.commit();
      ids.push(...chunkIds);
    }
    return ids;
  } catch (err) {
    console.error("createAlumnosMasivo:", err);
    throw new Error("No se pudo completar la importación masiva.");
  }
}

// ============================================================
// PROFES GUÍAS
// ============================================================

export async function getProfesGuias(): Promise<ProfeGuia[]> {
  try {
    const snap = await getDocs(collection(db, PROFES_GUIAS));
    return snap.docs.map(mapProfeGuiaDoc);
  } catch (err) {
    console.error("getProfesGuias:", err);
    throw new Error("No se pudieron cargar los profes guías.");
  }
}

export async function getProfesGuiasPorSucursal(
  sucursal: Sucursal
): Promise<ProfeGuia[]> {
  try {
    const q = query(
      collection(db, PROFES_GUIAS),
      where("sucursal", "==", sucursal)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapProfeGuiaDoc);
  } catch (err) {
    console.error("getProfesGuiasPorSucursal:", err);
    throw new Error(`No se pudieron cargar los profes guías de ${sucursal}.`);
  }
}

export async function createProfeGuia(data: ProfeGuiaInput): Promise<string> {
  try {
    const ref = await addDoc(
      collection(db, PROFES_GUIAS),
      stripUndefined({
        ...data,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("createProfeGuia:", err);
    throw new Error("No se pudo crear el profe guía.");
  }
}

export async function updateProfeGuia(
  id: string,
  data: Partial<ProfeGuiaInput>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, PROFES_GUIAS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateProfeGuia:", err);
    throw new Error("No se pudo actualizar el profe guía.");
  }
}

// Soft delete: marca activo=false (mismos motivos que deleteAlumno).
export async function deleteProfeGuia(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, PROFES_GUIAS, id), {
      activo: false,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("deleteProfeGuia:", err);
    throw new Error("No se pudo desactivar el profe guía.");
  }
}

export async function deactivateProfeGuia(id: string): Promise<void> {
  return deleteProfeGuia(id);
}

export async function reactivateProfeGuia(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, PROFES_GUIAS, id), {
      activo: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("reactivateProfeGuia:", err);
    throw new Error("No se pudo reactivar el profe guía.");
  }
}

// Importación masiva de profes guías. Mismo patrón que createAlumnosMasivo:
// chunking 500 ops por commit (límite Firestore). Devuelve los IDs creados.
export async function createProfesGuiasMasivo(
  data: ProfeGuiaInput[]
): Promise<string[]> {
  if (data.length === 0) return [];
  try {
    const ids: string[] = [];
    for (let i = 0; i < data.length; i += BATCH_MAX) {
      const chunk = data.slice(i, i + BATCH_MAX);
      const batch = writeBatch(db);
      const chunkIds: string[] = [];
      for (const row of chunk) {
        const ref = doc(collection(db, PROFES_GUIAS));
        batch.set(
          ref,
          stripUndefined({ ...row, createdAt: serverTimestamp() })
        );
        chunkIds.push(ref.id);
      }
      await batch.commit();
      ids.push(...chunkIds);
    }
    return ids;
  } catch (err) {
    console.error("createProfesGuiasMasivo:", err);
    throw new Error(
      "No se pudo completar la importación masiva de profes guías."
    );
  }
}

// ============================================================
// INSTRUCTORES
// ============================================================

export async function getInstructores(): Promise<Instructor[]> {
  try {
    const snap = await getDocs(collection(db, INSTRUCTORES));
    return snap.docs.map(mapInstructorDoc);
  } catch (err) {
    console.error("getInstructores:", err);
    throw new Error("No se pudieron cargar los instructores.");
  }
}

export async function getInstructoresPorSucursal(
  sucursal: Sucursal
): Promise<Instructor[]> {
  try {
    const q = query(
      collection(db, INSTRUCTORES),
      where("sucursalActual", "==", sucursal)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapInstructorDoc);
  } catch (err) {
    console.error("getInstructoresPorSucursal:", err);
    throw new Error(
      `No se pudieron cargar los instructores de ${sucursal}.`
    );
  }
}

export async function getInstructorPorEmail(
  email: string
): Promise<Instructor | null> {
  try {
    const q = query(
      collection(db, INSTRUCTORES),
      where("email", "==", email),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapInstructorDoc(snap.docs[0]);
  } catch (err) {
    console.error("getInstructorPorEmail:", err);
    throw new Error("No se pudo cargar el perfil del instructor.");
  }
}

export async function getInstructorPorUsername(
  username: string
): Promise<Instructor | null> {
  try {
    const q = query(
      collection(db, INSTRUCTORES),
      where("username", "==", username),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapInstructorDoc(snap.docs[0]);
  } catch (err) {
    console.error("getInstructorPorUsername:", err);
    throw new Error("No se pudo buscar el instructor por username.");
  }
}

// Crea el perfil del instructor Y la primera entrada del historial en una
// sola transacción atómica (writeBatch). Si falla, no queda perfil huérfano
// sin asignación inicial.
export async function createInstructor(
  data: InstructorInput
): Promise<string> {
  try {
    const batch = writeBatch(db);

    const instructorRef = doc(collection(db, INSTRUCTORES));
    // fechaCreacion: source-of-truth = servidor. Ignoramos lo que venga en data.
    const { fechaCreacion: _fcIgnored, ...rest } = data;
    void _fcIgnored;
    batch.set(
      instructorRef,
      stripUndefined({
        ...rest,
        // Default explícito: el director debe marcarlo a mano cuando cree
        // la cuenta en Firebase Auth. Si el form ya viene con true, respetamos.
        authVerificado: data.authVerificado ?? false,
        fechaCreacion: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    );

    // Primera entrada del historial: la asignación inicial es "activa"
    // (fechaFin = null) y arranca el día de creación.
    const historialRef = doc(collection(db, HISTORIAL_ASIGNACIONES));
    batch.set(
      historialRef,
      stripUndefined({
        instructorId: instructorRef.id,
        sucursal: data.sucursalActual,
        // fechaInicio se mantiene como ISO (es queryable como rango). Si el
        // director no fija fechaIngreso, usamos hoy en zona local.
        fechaInicio: data.fechaIngreso || todayISODate(),
        fechaFin: null,
        razonCambio: "Asignación inicial",
        cambiadoPor: data.creadoPor,
        createdAt: serverTimestamp(),
      })
    );

    await batch.commit();
    return instructorRef.id;
  } catch (err) {
    console.error("createInstructor:", err);
    throw new Error("No se pudo crear el instructor.");
  }
}

export async function updateInstructor(
  id: string,
  data: Partial<InstructorInput>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, INSTRUCTORES, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateInstructor:", err);
    throw new Error("No se pudo actualizar el instructor.");
  }
}

// Soft delete: el instructor sigue en la base, pero `activo: false` impide
// que el dashboard le muestre datos. La cuenta de Firebase Auth se desactiva
// manualmente desde la consola por el director (mismo flujo Camino C).
export async function deactivateInstructor(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, INSTRUCTORES, id), {
      activo: false,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("deactivateInstructor:", err);
    throw new Error("No se pudo desactivar el instructor.");
  }
}

// Reasigna la sucursal del instructor en una transacción atómica:
//   1) Cierra la asignación activa actual (fechaFin = hoy).
//   2) Actualiza instructor.sucursalActual.
//   3) Crea una nueva entrada de historial con fechaFin = null.
// Si la nueva sucursal coincide con la actual, NO se hace nada (no-op).
export async function reasignarSucursal(
  instructorId: string,
  nuevaSucursal: Sucursal,
  cambiadoPor: string,
  razon?: string
): Promise<void> {
  try {
    const instructorSnap = await getDoc(doc(db, INSTRUCTORES, instructorId));
    if (!instructorSnap.exists()) {
      throw new Error("El instructor no existe.");
    }
    const sucursalActual = instructorSnap.data()?.sucursalActual as
      | Sucursal
      | undefined;
    if (sucursalActual === nuevaSucursal) {
      // No hay cambio real; evitamos contaminar el historial con duplicados.
      return;
    }

    const today = todayISODate();
    const batch = writeBatch(db);

    // Cerrar la(s) asignación(es) activa(s). Debería haber UNA, pero por
    // seguridad cerramos todas las que aparezcan abiertas para este instructor.
    const activasQuery = query(
      collection(db, HISTORIAL_ASIGNACIONES),
      where("instructorId", "==", instructorId),
      where("fechaFin", "==", null)
    );
    const activasSnap = await getDocs(activasQuery);
    activasSnap.docs.forEach((d) => {
      batch.update(d.ref, { fechaFin: today });
    });

    // Actualizar el instructor.
    batch.update(doc(db, INSTRUCTORES, instructorId), {
      sucursalActual: nuevaSucursal,
      updatedAt: serverTimestamp(),
    });

    // Nueva entrada activa.
    const nuevaRef = doc(collection(db, HISTORIAL_ASIGNACIONES));
    batch.set(
      nuevaRef,
      stripUndefined({
        instructorId,
        sucursal: nuevaSucursal,
        fechaInicio: today,
        fechaFin: null,
        razonCambio: razon?.trim() || "",
        cambiadoPor,
        createdAt: serverTimestamp(),
      })
    );

    await batch.commit();
  } catch (err) {
    console.error("reasignarSucursal:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo reasignar la sucursal.");
  }
}

// ============================================================
// HISTORIAL DE ASIGNACIONES
// ============================================================

export async function getHistorialPorInstructor(
  instructorId: string
): Promise<HistorialAsignacion[]> {
  try {
    const q = query(
      collection(db, HISTORIAL_ASIGNACIONES),
      where("instructorId", "==", instructorId),
      orderBy("fechaInicio", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapHistorialDoc);
  } catch (err) {
    console.error("getHistorialPorInstructor:", err);
    throw new Error("No se pudo cargar el historial de asignaciones.");
  }
}

// Helper local: ISO yyyy-mm-dd del día actual (zona local del navegador).
function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

// Guardrail server-side: las clases SOLO ocurren los martes y miércoles.
// Tira si la fecha (yyyy-mm-dd) cae en cualquier otro día. Cubre los huecos
// que la UI no ataja (consola, scripts, modales editados a mano).
function assertFechaEsDiaDeClase(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`Fecha inválida: "${fecha}". Esperado yyyy-mm-dd.`);
  }
  // UTC noon evita drift por DST/timezone en zona local.
  const dow = new Date(fecha + "T12:00:00Z").getUTCDay();
  if (dow !== 2 && dow !== 3) {
    throw new Error(
      `Solo se pueden registrar asistencias/evaluaciones los martes y miércoles. ` +
        `La fecha ${fecha} cae en ${["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][dow]}.`
    );
  }
}

// ============================================================
// ASISTENCIAS DE ALUMNOS
// ============================================================

type AsistenciaAlumnoInput = Omit<AsistenciaAlumno, "id">;

function mapAsistenciaAlumnoDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): AsistenciaAlumno {
  const data = snap.data();
  return {
    id: snap.id,
    alumnoId: data.alumnoId ?? "",
    fecha: data.fecha ?? "",
    estado: data.estado ?? "Presente",
    observacion: data.observacion ?? "",
    registradaPor: data.registradaPor ?? "",
    sucursal: data.sucursal,
    curso: data.curso,
    turno: data.turno,
    tarifaInstructorAplicada:
      typeof data.tarifaInstructorAplicada === "number"
        ? data.tarifaInstructorAplicada
        : undefined,
    tarifaProfeGuiaAplicada:
      typeof data.tarifaProfeGuiaAplicada === "number"
        ? data.tarifaProfeGuiaAplicada
        : undefined,
    profeGuiaIdSnapshot:
      typeof data.profeGuiaIdSnapshot === "string"
        ? data.profeGuiaIdSnapshot
        : undefined,
    instructorIdSnapshot:
      typeof data.instructorIdSnapshot === "string"
        ? data.instructorIdSnapshot
        : undefined,
  };
}

// Snapshot helper: si el caller no proveyó tarifas / profeGuiaIdSnapshot /
// instructorIdSnapshot, los leemos al momento de registrar para que el
// cálculo de pagos sea inmune a cambios posteriores de configPagos o de
// Alumno.profeGuiaId/instructorId.
async function resolverSnapshotAsistencia(
  data: AsistenciaAlumnoInput
): Promise<AsistenciaAlumnoInput> {
  const necesitaTarifa =
    data.tarifaInstructorAplicada === undefined ||
    data.tarifaProfeGuiaAplicada === undefined;
  const necesitaAsig =
    data.profeGuiaIdSnapshot === undefined ||
    data.instructorIdSnapshot === undefined;
  if (!necesitaTarifa && !necesitaAsig) return data;

  const [config, alumnoSnap] = await Promise.all([
    necesitaTarifa ? getConfigPagos() : Promise.resolve(null),
    necesitaAsig
      ? getDoc(doc(db, ALUMNOS, data.alumnoId))
      : Promise.resolve(null),
  ]);

  const out: AsistenciaAlumnoInput = { ...data };
  if (necesitaTarifa) {
    const ti = config?.tarifasInstructor ?? TARIFAS_VACIAS;
    const tp = config?.tarifasProfeGuia ?? TARIFAS_VACIAS;
    if (out.tarifaInstructorAplicada === undefined) {
      out.tarifaInstructorAplicada = ti[data.curso] ?? 0;
    }
    if (out.tarifaProfeGuiaAplicada === undefined) {
      out.tarifaProfeGuiaAplicada = tp[data.curso] ?? 0;
    }
  }
  if (necesitaAsig) {
    const datosAlumno = alumnoSnap?.exists() ? alumnoSnap.data() : null;
    if (out.profeGuiaIdSnapshot === undefined) {
      out.profeGuiaIdSnapshot =
        (datosAlumno?.profeGuiaId as string | undefined) ?? "";
    }
    if (out.instructorIdSnapshot === undefined) {
      out.instructorIdSnapshot =
        (datosAlumno?.instructorId as string | undefined) ?? "";
    }
  }
  return out;
}

export async function registrarAsistenciaAlumno(
  data: AsistenciaAlumnoInput
): Promise<string> {
  try {
    assertFechaEsDiaDeClase(data.fecha);
    const final = await resolverSnapshotAsistencia(data);
    const ref = await addDoc(
      collection(db, ASISTENCIAS_ALUMNOS),
      stripUndefined({
        ...final,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("registrarAsistenciaAlumno:", err);
    if (err instanceof Error && err.message.startsWith("Solo se pueden registrar")) throw err;
    throw new Error("No se pudo registrar la asistencia del alumno.");
  }
}

// Versión por lote para marcar muchas asistencias en un único writeBatch.
// `snapshotPorAlumno` opcionalmente provee tarifas + profeGuiaId pre-resueltos
// para evitar reads N+1 (los hooks ya tienen alumnos y configPagos en memoria).
export async function registrarAsistenciasAlumnosBatch(
  filas: AsistenciaAlumnoInput[],
  snapshotPorAlumno?: (
    a: AsistenciaAlumnoInput
  ) => Partial<
    Pick<
      AsistenciaAlumnoInput,
      "tarifaInstructorAplicada" | "tarifaProfeGuiaAplicada" | "profeGuiaIdSnapshot"
    >
  >
): Promise<string[]> {
  if (filas.length === 0) return [];
  try {
    for (const fila of filas) assertFechaEsDiaDeClase(fila.fecha);
    // Resolver snapshots faltantes a partir del helper provisto, o cayendo a
    // un read único de configPagos como fallback común.
    let configCache: { tarifasInstructor: TarifasPorCurso; tarifasProfeGuia: TarifasPorCurso } | null =
      null;
    const resueltas: AsistenciaAlumnoInput[] = [];
    for (const fila of filas) {
      const provisto = snapshotPorAlumno?.(fila) ?? {};
      const merged: AsistenciaAlumnoInput = { ...fila, ...provisto };
      if (
        merged.tarifaInstructorAplicada === undefined ||
        merged.tarifaProfeGuiaAplicada === undefined
      ) {
        if (!configCache) configCache = (await getConfigPagos()) ?? null;
        const ti = configCache?.tarifasInstructor ?? TARIFAS_VACIAS;
        const tp = configCache?.tarifasProfeGuia ?? TARIFAS_VACIAS;
        merged.tarifaInstructorAplicada =
          merged.tarifaInstructorAplicada ?? ti[fila.curso] ?? 0;
        merged.tarifaProfeGuiaAplicada =
          merged.tarifaProfeGuiaAplicada ?? tp[fila.curso] ?? 0;
      }
      if (merged.profeGuiaIdSnapshot === undefined) {
        merged.profeGuiaIdSnapshot = "";
      }
      if (merged.instructorIdSnapshot === undefined) {
        merged.instructorIdSnapshot = "";
      }
      resueltas.push(merged);
    }

    const ids: string[] = [];
    for (let i = 0; i < resueltas.length; i += BATCH_MAX) {
      const chunk = resueltas.slice(i, i + BATCH_MAX);
      const batch = writeBatch(db);
      const chunkIds: string[] = [];
      for (const row of chunk) {
        const ref = doc(collection(db, ASISTENCIAS_ALUMNOS));
        batch.set(
          ref,
          stripUndefined({ ...row, createdAt: serverTimestamp() })
        );
        chunkIds.push(ref.id);
      }
      await batch.commit();
      ids.push(...chunkIds);
    }
    return ids;
  } catch (err) {
    console.error("registrarAsistenciasAlumnosBatch:", err);
    throw new Error("No se pudo registrar el lote de asistencias.");
  }
}

export async function getAsistenciasPorAlumno(
  alumnoId: string,
  limite?: number
): Promise<AsistenciaAlumno[]> {
  try {
    const constraints = [
      where("alumnoId", "==", alumnoId),
      orderBy("fecha", "desc"),
    ];
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS),
      ...constraints,
      ...(limite ? [limit(limite)] : [])
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapAsistenciaAlumnoDoc);
  } catch (err) {
    console.error("getAsistenciasPorAlumno:", err);
    throw new Error("No se pudieron cargar las asistencias del alumno.");
  }
}

// Filtra por sucursal + fecha exacta. Si pasas turno, también filtra por
// turno. Útil para construir la pantalla del aula virtual del día.
export async function getAsistenciasDelDia(
  sucursal: Sucursal,
  fecha: string,
  turno?: Turno
): Promise<AsistenciaAlumno[]> {
  try {
    const base = [
      where("sucursal", "==", sucursal),
      where("fecha", "==", fecha),
    ];
    const q = turno
      ? query(
          collection(db, ASISTENCIAS_ALUMNOS),
          ...base,
          where("turno", "==", turno)
        )
      : query(collection(db, ASISTENCIAS_ALUMNOS), ...base);
    const snap = await getDocs(q);
    return snap.docs.map(mapAsistenciaAlumnoDoc);
  } catch (err) {
    console.error("getAsistenciasDelDia:", err);
    throw new Error("No se pudieron cargar las asistencias del día.");
  }
}

export async function updateAsistenciaAlumno(
  id: string,
  data: Partial<AsistenciaAlumnoInput>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, ASISTENCIAS_ALUMNOS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateAsistenciaAlumno:", err);
    throw new Error("No se pudo actualizar la asistencia.");
  }
}

export async function deleteAsistenciaAlumno(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ASISTENCIAS_ALUMNOS, id));
  } catch (err) {
    console.error("deleteAsistenciaAlumno:", err);
    throw new Error("No se pudo eliminar la asistencia.");
  }
}

// ============================================================
// EVALUACIONES DE ALUMNOS
// ============================================================

type EvaluacionAlumnoInput = Omit<EvaluacionAlumno, "id">;

function mapEvaluacionDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): EvaluacionAlumno {
  const data = snap.data();
  return {
    id: snap.id,
    alumnoId: data.alumnoId ?? "",
    fecha: data.fecha ?? "",
    nota: typeof data.nota === "number" ? data.nota : 0,
    observacion: data.observacion ?? "",
    evaluadoPor: data.evaluadoPor ?? "",
    sucursal: data.sucursal,
    curso: data.curso,
  };
}

export async function registrarEvaluacion(
  data: EvaluacionAlumnoInput
): Promise<string> {
  try {
    assertFechaEsDiaDeClase(data.fecha);
    if (data.nota < 1 || data.nota > 10) {
      throw new Error("La nota debe estar entre 1 y 10.");
    }
    const ref = await addDoc(
      collection(db, EVALUACIONES_ALUMNOS),
      stripUndefined({
        ...data,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("registrarEvaluacion:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo registrar la evaluación.");
  }
}

export async function getEvaluacionesPorAlumno(
  alumnoId: string,
  limite?: number
): Promise<EvaluacionAlumno[]> {
  try {
    const q = query(
      collection(db, EVALUACIONES_ALUMNOS),
      where("alumnoId", "==", alumnoId),
      orderBy("fecha", "desc"),
      ...(limite ? [limit(limite)] : [])
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapEvaluacionDoc);
  } catch (err) {
    console.error("getEvaluacionesPorAlumno:", err);
    throw new Error("No se pudieron cargar las evaluaciones del alumno.");
  }
}

export async function updateEvaluacion(
  id: string,
  data: Partial<EvaluacionAlumnoInput>
): Promise<void> {
  try {
    if (data.nota !== undefined && (data.nota < 1 || data.nota > 10)) {
      throw new Error("La nota debe estar entre 1 y 10.");
    }
    await updateDoc(
      doc(db, EVALUACIONES_ALUMNOS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateEvaluacion:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo actualizar la evaluación.");
  }
}

export async function deleteEvaluacion(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, EVALUACIONES_ALUMNOS, id));
  } catch (err) {
    console.error("deleteEvaluacion:", err);
    throw new Error("No se pudo eliminar la evaluación.");
  }
}

// ============================================================
// ASISTENCIAS DE PROFES GUÍAS
// ============================================================

type AsistenciaProfeGuiaInput = Omit<AsistenciaProfeGuia, "id">;

function mapAsistenciaProfeDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): AsistenciaProfeGuia {
  const data = snap.data();
  return {
    id: snap.id,
    profeGuiaId: data.profeGuiaId ?? "",
    fecha: data.fecha ?? "",
    estado: data.estado ?? "Presente",
    observacion: data.observacion ?? "",
    registradaPor: data.registradaPor ?? "",
    sucursal: data.sucursal,
  };
}

export async function registrarAsistenciaProfe(
  data: AsistenciaProfeGuiaInput
): Promise<string> {
  try {
    assertFechaEsDiaDeClase(data.fecha);
    const ref = await addDoc(
      collection(db, ASISTENCIAS_PROFES_GUIAS),
      stripUndefined({
        ...data,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("registrarAsistenciaProfe:", err);
    if (err instanceof Error && err.message.startsWith("Solo se pueden registrar")) throw err;
    throw new Error("No se pudo registrar la asistencia del profe guía.");
  }
}

// Devuelve todas las asistencias de un profe en un mes/año dados.
// `mes` es 1-12 (humano), no 0-11.
export async function getAsistenciasProfeGuiaPorMes(
  profeGuiaId: string,
  mes: number,
  año: number
): Promise<AsistenciaProfeGuia[]> {
  try {
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    // último día del mes (Date(año, mes, 0) en JS retorna último día del mes anterior cuando day=0)
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    const q = query(
      collection(db, ASISTENCIAS_PROFES_GUIAS),
      where("profeGuiaId", "==", profeGuiaId),
      where("fecha", ">=", desde),
      where("fecha", "<=", hasta),
      orderBy("fecha", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapAsistenciaProfeDoc);
  } catch (err) {
    console.error("getAsistenciasProfeGuiaPorMes:", err);
    throw new Error("No se pudieron cargar las asistencias del profe guía.");
  }
}

export async function getAsistenciasProfesDelDia(
  sucursal: Sucursal,
  fecha: string
): Promise<AsistenciaProfeGuia[]> {
  try {
    const q = query(
      collection(db, ASISTENCIAS_PROFES_GUIAS),
      where("sucursal", "==", sucursal),
      where("fecha", "==", fecha)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapAsistenciaProfeDoc);
  } catch (err) {
    console.error("getAsistenciasProfesDelDia:", err);
    throw new Error("No se pudieron cargar las asistencias de los profes guías.");
  }
}

export async function updateAsistenciaProfe(
  id: string,
  data: Partial<AsistenciaProfeGuiaInput>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, ASISTENCIAS_PROFES_GUIAS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("updateAsistenciaProfe:", err);
    throw new Error("No se pudo actualizar la asistencia del profe guía.");
  }
}

// ============================================================
// TEMARIOS POR CURSO
// ============================================================

type TemarioInput = {
  curso: Curso;
  semanas: TemaSemana[];
  fechaInicio: string;
  actualizadoPor: string;
};

function mapTemarioDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): TemarioCurso {
  const data = snap.data();
  return {
    id: snap.id,
    curso: data.curso ?? (snap.id as Curso),
    semanas: Array.isArray(data.semanas) ? (data.semanas as TemaSemana[]) : [],
    fechaInicio: data.fechaInicio ?? "",
    actualizadoPor: data.actualizadoPor ?? "",
    actualizadoEn: data.actualizadoEn ?? "",
  };
}

export async function getTemario(curso: Curso): Promise<TemarioCurso | null> {
  try {
    const ref = doc(db, TEMARIOS, curso);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapTemarioDoc(snap as QueryDocumentSnapshot<DocumentData>);
  } catch (err) {
    console.error("getTemario:", err);
    throw new Error("No se pudo cargar el temario.");
  }
}

// Upsert: usa el curso como doc id para que solo exista un temario por curso.
export async function saveTemario(
  curso: Curso,
  data: TemarioInput
): Promise<void> {
  try {
    const ref = doc(db, TEMARIOS, curso);
    await setDoc(
      ref,
      stripUndefined({
        ...data,
        curso,
        actualizadoEn: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.error("saveTemario:", err);
    throw new Error("No se pudo guardar el temario.");
  }
}

// Persiste solo los campos PDF de UNA semana sin pisar otros campos del server.
// Si el doc o la semana aún no existen server-side, usa `semanasFallback` y
// `fechaInicioFallback` (el estado local del editor) para crearlos. Esto evita
// que un PDF subido quede huérfano cuando el director aún no ha guardado el
// resto del temario.
export async function actualizarPdfSemana(args: {
  curso: Curso;
  semanaIdx: number;
  dia: "martes" | "miercoles";
  pdf: { url: string; nombre: string } | null; // null = eliminar
  actualizadoPor: string;
  semanasFallback: TemaSemana[];
  fechaInicioFallback: string;
}): Promise<void> {
  const ref = doc(db, TEMARIOS, args.curso);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      let semanas: TemaSemana[];
      let fechaInicio: string;
      if (snap.exists()) {
        const data = snap.data();
        semanas = Array.isArray(data?.semanas)
          ? (data.semanas as TemaSemana[]).map((s) => ({ ...s }))
          : [];
        fechaInicio =
          (data?.fechaInicio as string | undefined) ||
          args.fechaInicioFallback ||
          "";
      } else {
        semanas = args.semanasFallback.map((s) => ({ ...s }));
        fechaInicio = args.fechaInicioFallback || "";
      }

      // Si la semana objetivo no existe server, completamos con el fallback
      // (o stub vacío) hasta llegar al índice pedido.
      while (semanas.length <= args.semanaIdx) {
        const idx = semanas.length;
        const fb = args.semanasFallback[idx];
        semanas.push(
          fb
            ? { ...fb, semanaNumero: idx + 1 }
            : { semanaNumero: idx + 1, titulo: "" }
        );
      }

      const semana: TemaSemana = { ...semanas[args.semanaIdx] };
      if (args.dia === "martes") {
        semana.pdfMartesUrl = args.pdf?.url ?? "";
        semana.pdfMartesNombre = args.pdf?.nombre ?? "";
      } else {
        semana.pdfMiercolesUrl = args.pdf?.url ?? "";
        semana.pdfMiercolesNombre = args.pdf?.nombre ?? "";
      }
      semanas[args.semanaIdx] = semana;

      tx.set(
        ref,
        stripUndefined({
          curso: args.curso,
          semanas,
          fechaInicio,
          actualizadoPor: args.actualizadoPor,
          actualizadoEn: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    });
  } catch (err) {
    console.error("actualizarPdfSemana:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo persistir el PDF en el temario.");
  }
}

// Calcula la semana actual a partir de hoy y de fechaInicio (primer martes del curso).
// Retorna null si el curso no ha empezado, si no hay temario o si la semana
// calculada está fuera del rango cargado.
export async function getSemanaActual(
  curso: Curso
): Promise<TemaSemana | null> {
  const t = await getTemario(curso);
  if (!t || !t.fechaInicio || t.semanas.length === 0) return null;
  return calcularSemanaActual(t);
}

// Calculo puro y exportado: misma lógica usable en el cliente sin reconsultar.
export function calcularSemanaActual(
  temario: TemarioCurso,
  hoy: Date = new Date()
): TemaSemana | null {
  if (!temario.fechaInicio) return null;
  const inicio = parseISODateLocal(temario.fechaInicio);
  if (!inicio) return null;
  // Trabajamos a nivel "día" en zona local (descartamos horas).
  const hoyDay = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const inicioDay = new Date(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate()
  );
  const diffMs = hoyDay.getTime() - inicioDay.getTime();
  if (diffMs < 0) return null;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const idx = Math.floor(diffDays / 7); // 0-based
  return temario.semanas[idx] ?? null;
}

// Parser local que evita el shift de zona horaria de new Date("YYYY-MM-DD").
function parseISODateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, yStr, moStr, dStr] = m;
  return new Date(Number(yStr), Number(moStr) - 1, Number(dStr));
}

// ============================================================
// CONFIG PAGOS (singleton "default")
// ============================================================

function mapConfigPagos(data: DocumentData | undefined): ConfigPagos {
  return {
    id: "default",
    montoInstructorPrimerAlumno: Number(
      data?.montoInstructorPrimerAlumno ?? 0
    ),
    montoInstructorAlumnoAdicional: Number(
      data?.montoInstructorAlumnoAdicional ?? 0
    ),
    tarifasInstructor: {
      Junior: Number(data?.tarifasInstructor?.Junior ?? 0),
      Senior: Number(data?.tarifasInstructor?.Senior ?? 0),
      Master: Number(data?.tarifasInstructor?.Master ?? 0),
    },
    tarifasProfeGuia: {
      Junior: Number(data?.tarifasProfeGuia?.Junior ?? 0),
      Senior: Number(data?.tarifasProfeGuia?.Senior ?? 0),
      Master: Number(data?.tarifasProfeGuia?.Master ?? 0),
    },
    actualizadoPor: data?.actualizadoPor ?? "",
    actualizadoEn: data?.actualizadoEn ?? "",
  };
}

export async function getConfigPagos(): Promise<ConfigPagos | null> {
  try {
    const ref = doc(db, CONFIG_PAGOS, "default");
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapConfigPagos(snap.data());
  } catch (err) {
    console.error("getConfigPagos:", err);
    throw new Error("No se pudo cargar la configuración de pagos.");
  }
}

export async function saveConfigPagos(
  data: {
    tarifasInstructor: TarifasPorCurso;
    tarifasProfeGuia: TarifasPorCurso;
    montoInstructorPrimerAlumno?: number;
    montoInstructorAlumnoAdicional?: number;
  },
  actualizadoPor: string
): Promise<void> {
  try {
    const ref = doc(db, CONFIG_PAGOS, "default");
    await setDoc(
      ref,
      stripUndefined({
        ...data,
        actualizadoPor,
        actualizadoEn: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.error("saveConfigPagos:", err);
    throw new Error("No se pudo guardar la configuración de pagos.");
  }
}

// ============================================================
// CÁLCULO DE PAGOS
// ============================================================

// Helpers internos compartidos.

function rangoMes(mes: number, año: number): { desde: string; hasta: string } {
  const mm = String(mes).padStart(2, "0");
  const ultimoDia = new Date(año, mes, 0).getDate();
  return {
    desde: `${año}-${mm}-01`,
    hasta: `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

function tarifaEnCero(): {
  Junior: { alumnosAsistidos: number; tarifa: number; subtotal: number };
  Senior: { alumnosAsistidos: number; tarifa: number; subtotal: number };
  Master: { alumnosAsistidos: number; tarifa: number; subtotal: number };
} {
  return {
    Junior: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
    Senior: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
    Master: { alumnosAsistidos: 0, tarifa: 0, subtotal: 0 },
  };
}

// Lee todas las asistencias de alumnos del mes/año dados (una sola query).
// Sirve de base para todos los cálculos del mes.
async function getAsistenciasAlumnosDelMes(
  mes: number,
  año: number
): Promise<AsistenciaAlumno[]> {
  const { desde, hasta } = rangoMes(mes, año);
  const q = query(
    collection(db, ASISTENCIAS_ALUMNOS),
    where("fecha", ">=", desde),
    where("fecha", "<=", hasta)
  );
  const snap = await getDocs(q);
  return snap.docs.map(mapAsistenciaAlumnoDoc);
}

// Filtra asistencias "computables" para pago: solo Presente o Tarde (ausentes
// no se pagan). Encapsulado para que la regla viva en un solo sitio.
export function esAsistenciaPagable(a: AsistenciaAlumno): boolean {
  return a.estado === "Presente" || a.estado === "Tarde";
}

// Construye PagoCalculado a partir de asistencias ya filtradas.
// `tarifas` es la tabla aplicable (instructor o profe guía) y SOLO se usa como
// fallback cuando una asistencia legacy no tiene snapshot (campo ausente).
//
// La fuente de verdad por fila es a.tarifaInstructorAplicada / a.tarifaProfeGuiaAplicada
// — así una subida de tarifas a mitad de mes NO recalcula retroactivo lo viejo.
let __warnedLegacyTarifa = false;
export function construirPagoCalculado(args: {
  personaId: string;
  personaNombre: string;
  tipo: "instructor" | "profeGuia";
  sucursal: Sucursal;
  mes: number;
  año: number;
  asistencias: AsistenciaAlumno[];   // ya filtradas (registradaPor o profeGuia)
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
      tipo === "instructor"
        ? a.tarifaInstructorAplicada
        : a.tarifaProfeGuiaAplicada;
    let tarifaAplicada: number;
    if (typeof snapshot === "number") {
      tarifaAplicada = snapshot;
    } else {
      tarifaAplicada = tarifas[curso] ?? 0;
      if (!__warnedLegacyTarifa) {
        console.warn(
          "[pagos] Asistencia legacy sin tarifa snapshoteada — usando configPagos actual como fallback. Considere correr lib/migrate-legacy-attendance.",
        );
        __warnedLegacyTarifa = true;
      }
    }
    detalle[curso].subtotal += tarifaAplicada;
    diasMap.set(a.fecha, (diasMap.get(a.fecha) ?? 0) + 1);
  }

  // tarifa "representativa" para la UI: tarifa promedio efectiva. Si todas las
  // asistencias del curso comparten la misma tarifa, equivale a esa tarifa.
  // Si difieren (subida mid-month), refleja la mezcla y la suma sigue siendo
  // exacta. Cuando no hay asistencias, mostramos la tarifa actual de configPagos
  // como referencia visual.
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
    detalle.Junior.alumnosAsistidos +
    detalle.Senior.alumnosAsistidos +
    detalle.Master.alumnosAsistidos;

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

// Filtra asistencias para un profe guía aplicando el snapshot histórico:
//   - si tiene profeGuiaIdSnapshot ⇒ se compara con éste (verdad histórica)
//   - si NO lo tiene (legacy) ⇒ se cae al profeGuiaId actual del alumno.
// `alumnosPorProfeFallback`: Map<profeId, Set<alumnoId>> usando el profeGuiaId
// actual de cada alumno (necesario para legacy). Calcúlalo una vez por mes.
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
        console.warn(
          "[pagos] Asistencia legacy sin profeGuiaIdSnapshot — usando profeGuiaId actual del alumno como fallback.",
        );
        __warnedLegacyProfeSnap = true;
      }
      if (idsFallback.has(a.alumnoId)) out.push(a);
    }
  }
  return out;
}

// MODELO NUEVO de pago a instructores: por día, escalado.
//
// Reglas:
//   1) Filtramos asistencias del mes que el instructor registró Y que
//      corresponden a alumnos suyos (snapshot instructorIdSnapshot === su id;
//      legacy = alumnos que HOY están asignados a él).
//   2) Sólo cuentan asistencias pagables (Presente o Tarde).
//   3) Por cada día único: pago = primer + (alumnos − 1) × adicional.
//   4) Total mes = suma de pagos por día.
//
// `detallePorCurso` se llena por compatibilidad (la UI de profes lo sigue
// usando) — para instructores trae los alumnos contados por curso del mes.
let __warnedLegacyInstructorSnap = false;
export function construirPagoCalculadoInstructorEscalado(args: {
  instructorId: string;
  instructorNombre: string;
  sucursal: Sucursal;
  mes: number;
  año: number;
  asistencias: AsistenciaAlumno[];     // ya filtradas por registradaPor === username
  alumnosDeEsteInstructor: Set<string>; // fallback legacy
  montoPrimerAlumno: number;
  montoAlumnoAdicional: number;
}): PagoCalculado {
  const {
    instructorId,
    instructorNombre,
    sucursal,
    mes,
    año,
    asistencias,
    alumnosDeEsteInstructor,
    montoPrimerAlumno,
    montoAlumnoAdicional,
  } = args;

  // Filtramos asistencias por "alumnos del instructor", priorizando snapshot.
  const propias: AsistenciaAlumno[] = [];
  for (const a of asistencias) {
    if (!esAsistenciaPagable(a)) continue;
    const snap = a.instructorIdSnapshot;
    if (typeof snap === "string" && snap.length > 0) {
      if (snap === instructorId) propias.push(a);
    } else {
      if (!__warnedLegacyInstructorSnap) {
        console.warn(
          "[pagos] Asistencia legacy sin instructorIdSnapshot — usando instructorId actual del alumno como fallback."
        );
        __warnedLegacyInstructorSnap = true;
      }
      if (alumnosDeEsteInstructor.has(a.alumnoId)) propias.push(a);
    }
  }

  // Conteo por día (única vez por (alumnoId, fecha) para no contar 2x si
  // hubiera duplicados); para el desglose por curso también deduplicamos.
  const porDia = new Map<string, Set<string>>(); // fecha -> set de alumnoId
  const porCurso = { Junior: 0, Senior: 0, Master: 0 } as Record<Curso, number>;

  for (const a of propias) {
    const setDia = porDia.get(a.fecha) ?? new Set<string>();
    if (!setDia.has(a.alumnoId)) {
      setDia.add(a.alumnoId);
      if (a.curso && CURSOS.includes(a.curso)) {
        porCurso[a.curso] += 1;
      }
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
  const diasDetalle = desgloseDias.map((d) => ({
    fecha: d.fecha,
    alumnos: d.alumnos,
  }));

  // detallePorCurso: para instructores el "tarifa" representativa es el
  // promedio del día (no es por curso); igual la llenamos para no romper la
  // UI que la lee. Subtotal por curso = 0 (el cálculo no se hace por curso
  // en el modelo nuevo); el total real vive en totalCLP.
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

export async function calcularPagoInstructor(
  instructorId: string,
  mes: number,
  año: number
): Promise<PagoCalculado> {
  try {
    const [instSnap, config, asistencias, alumnos] = await Promise.all([
      getDoc(doc(db, INSTRUCTORES, instructorId)),
      getConfigPagos(),
      getAsistenciasAlumnosDelMes(mes, año),
      // Sólo necesitamos los alumnos asignados HOY a este instructor (fallback
      // legacy). Si en el futuro cambia el id, ajustar el query.
      getDocs(
        query(
          collection(db, ALUMNOS),
          where("instructorId", "==", instructorId)
        )
      ),
    ]);
    if (!instSnap.exists()) {
      throw new Error("El instructor no existe.");
    }
    const instructor = mapInstructorDoc(
      instSnap as QueryDocumentSnapshot<DocumentData>
    );
    const propias = asistencias.filter(
      (a) => a.registradaPor === instructor.username
    );
    const idsAlumnos = new Set(alumnos.docs.map((d) => d.id));

    return construirPagoCalculadoInstructorEscalado({
      instructorId: instructor.id,
      instructorNombre: instructor.nombreCompleto,
      sucursal: instructor.sucursalActual,
      mes,
      año,
      asistencias: propias,
      alumnosDeEsteInstructor: idsAlumnos,
      montoPrimerAlumno: config?.montoInstructorPrimerAlumno ?? 0,
      montoAlumnoAdicional: config?.montoInstructorAlumnoAdicional ?? 0,
    });
  } catch (err) {
    console.error("calcularPagoInstructor:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo calcular el pago del instructor.");
  }
}

export async function calcularPagoProfeGuia(
  profeGuiaId: string,
  mes: number,
  año: number
): Promise<PagoCalculado> {
  try {
    const [profeSnap, config, asistencias] = await Promise.all([
      getDoc(doc(db, PROFES_GUIAS, profeGuiaId)),
      getConfigPagos(),
      getAsistenciasAlumnosDelMes(mes, año),
    ]);
    if (!profeSnap.exists()) {
      throw new Error("El profe guía no existe.");
    }
    const profe = mapProfeGuiaDoc(
      profeSnap as QueryDocumentSnapshot<DocumentData>
    );
    const tarifas = config?.tarifasProfeGuia ?? TARIFAS_VACIAS;

    // Para asistencias LEGACY (sin profeGuiaIdSnapshot), necesitamos el set
    // de alumnos asignados HOY a este profe — lo usamos sólo como fallback.
    const alumnosSnap = await getDocs(
      query(collection(db, ALUMNOS), where("profeGuiaId", "==", profeGuiaId))
    );
    const alumnosPorProfe = new Map<string, Set<string>>();
    alumnosPorProfe.set(
      profeGuiaId,
      new Set(alumnosSnap.docs.map((d) => d.id))
    );
    const propias = filtrarAsistenciasParaProfe(
      asistencias,
      profeGuiaId,
      alumnosPorProfe
    );

    return construirPagoCalculado({
      personaId: profe.id,
      personaNombre: profe.nombre,
      tipo: "profeGuia",
      sucursal: profe.sucursal,
      mes,
      año,
      asistencias: propias,
      tarifas,
    });
  } catch (err) {
    console.error("calcularPagoProfeGuia:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo calcular el pago del profe guía.");
  }
}

export async function calcularPagosTodosInstructores(
  mes: number,
  año: number
): Promise<PagoCalculado[]> {
  try {
    const [instructores, config, asistencias, alumnos] = await Promise.all([
      getInstructores(),
      getConfigPagos(),
      getAsistenciasAlumnosDelMes(mes, año),
      getAlumnos(),
    ]);
    // Pre-indexamos alumnos por instructorId para fallback legacy.
    const alumnosPorInst = new Map<string, Set<string>>();
    for (const al of alumnos) {
      if (!al.instructorId) continue;
      const set = alumnosPorInst.get(al.instructorId) ?? new Set<string>();
      set.add(al.id);
      alumnosPorInst.set(al.instructorId, set);
    }
    const montoPrimero = config?.montoInstructorPrimerAlumno ?? 0;
    const montoAdicional = config?.montoInstructorAlumnoAdicional ?? 0;

    return instructores
      .filter((i) => i.activo)
      .map((i) =>
        construirPagoCalculadoInstructorEscalado({
          instructorId: i.id,
          instructorNombre: i.nombreCompleto,
          sucursal: i.sucursalActual,
          mes,
          año,
          asistencias: asistencias.filter(
            (a) => a.registradaPor === i.username
          ),
          alumnosDeEsteInstructor:
            alumnosPorInst.get(i.id) ?? new Set<string>(),
          montoPrimerAlumno: montoPrimero,
          montoAlumnoAdicional: montoAdicional,
        })
      )
      .sort((a, b) => b.totalCLP - a.totalCLP);
  } catch (err) {
    console.error("calcularPagosTodosInstructores:", err);
    throw new Error("No se pudieron calcular los pagos de instructores.");
  }
}

export async function calcularPagosTodosProfesGuias(
  mes: number,
  año: number
): Promise<PagoCalculado[]> {
  try {
    const [profes, alumnos, config, asistencias] = await Promise.all([
      getProfesGuias(),
      getAlumnos(),
      getConfigPagos(),
      getAsistenciasAlumnosDelMes(mes, año),
    ]);
    const tarifas = config?.tarifasProfeGuia ?? TARIFAS_VACIAS;

    // Pre-indexamos alumnos por profeGuiaId para que el filtrado sea O(n).
    const alumnosPorProfe = new Map<string, Set<string>>();
    for (const al of alumnos) {
      if (!al.profeGuiaId) continue;
      const set = alumnosPorProfe.get(al.profeGuiaId) ?? new Set<string>();
      set.add(al.id);
      alumnosPorProfe.set(al.profeGuiaId, set);
    }

    return profes
      .filter((p) => p.activo)
      .map((p) => {
        const propias = filtrarAsistenciasParaProfe(
          asistencias,
          p.id,
          alumnosPorProfe
        );
        return construirPagoCalculado({
          personaId: p.id,
          personaNombre: p.nombre,
          tipo: "profeGuia",
          sucursal: p.sucursal,
          mes,
          año,
          asistencias: propias,
          tarifas,
        });
      })
      .sort((a, b) => b.totalCLP - a.totalCLP);
  } catch (err) {
    console.error("calcularPagosTodosProfesGuias:", err);
    throw new Error("No se pudieron calcular los pagos de profes guías.");
  }
}

// Recaudación: suma los pagos registrados (colección pagosAlumnos) cuyo
// período coincide con el mes/año pedido. La fuente de verdad ahora es
// pagosAlumnos — el campo Alumno.pago ya no existe.
export async function calcularRecaudacionAlumnos(
  mes: number,
  año: number
): Promise<{ totalCLP: number; alumnosAlDia: number; alumnosConDeuda: number }> {
  try {
    const estado = await getEstadoMorosidadDelMes(mes, año);
    return {
      totalCLP: estado.totalRecaudado,
      alumnosAlDia: estado.alumnosAlDia.length,
      alumnosConDeuda: estado.alumnosConDeuda.length,
    };
  } catch (err) {
    console.error("calcularRecaudacionAlumnos:", err);
    throw new Error("No se pudo calcular la recaudación del mes.");
  }
}

// ============================================================
// PRECIOS DE ALUMNOS (singleton "default")
// ============================================================

function mapPreciosAlumnos(data: DocumentData | undefined): PreciosAlumnos {
  // duracion*Clases es opcional en datos legacy; el caller aplica defaults
  // (DURACION_DEFAULT_CLASES) cuando viene undefined.
  const dJ = Number(data?.duracionJuniorClases);
  const dS = Number(data?.duracionSeniorClases);
  const dM = Number(data?.duracionMasterClases);
  return {
    id: "default",
    Junior: Number(data?.Junior ?? 0),
    Senior: Number(data?.Senior ?? 0),
    Master: Number(data?.Master ?? 0),
    duracionJuniorClases: Number.isFinite(dJ) && dJ > 0 ? dJ : undefined,
    duracionSeniorClases: Number.isFinite(dS) && dS > 0 ? dS : undefined,
    duracionMasterClases: Number.isFinite(dM) && dM > 0 ? dM : undefined,
    actualizadoPor: data?.actualizadoPor ?? "",
    actualizadoEn: data?.actualizadoEn ?? "",
  };
}

export async function getPreciosAlumnos(): Promise<PreciosAlumnos | null> {
  try {
    const ref = doc(db, PRECIOS_ALUMNOS, "default");
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapPreciosAlumnos(snap.data());
  } catch (err) {
    console.error("getPreciosAlumnos:", err);
    throw new Error("No se pudieron cargar los precios de los cursos.");
  }
}

export async function savePreciosAlumnos(
  data: {
    Junior: number;
    Senior: number;
    Master: number;
    duracionJuniorClases?: number;
    duracionSeniorClases?: number;
    duracionMasterClases?: number;
  },
  actualizadoPor: string
): Promise<void> {
  try {
    const ref = doc(db, PRECIOS_ALUMNOS, "default");
    // Aceptamos duraciones opcionales; convertimos solo si son números válidos.
    // 0 o negativos se descartan para evitar dejar el doc inválido.
    const sanitizeDuracion = (n: number | undefined): number | undefined => {
      if (typeof n !== "number") return undefined;
      return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
    };
    await setDoc(
      ref,
      stripUndefined({
        Junior: Number(data.Junior) || 0,
        Senior: Number(data.Senior) || 0,
        Master: Number(data.Master) || 0,
        duracionJuniorClases: sanitizeDuracion(data.duracionJuniorClases),
        duracionSeniorClases: sanitizeDuracion(data.duracionSeniorClases),
        duracionMasterClases: sanitizeDuracion(data.duracionMasterClases),
        actualizadoPor,
        actualizadoEn: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.error("savePreciosAlumnos:", err);
    throw new Error("No se pudieron guardar los precios.");
  }
}

// Devuelve la duración (en clases) del curso del alumno. Si el director no la
// configuró, cae a DURACION_DEFAULT_CLASES (8 / 16 / 8).
export function duracionClasesDeCurso(
  curso: Curso,
  precios: PreciosAlumnos | null
): number {
  const fromConfig =
    curso === "Junior"
      ? precios?.duracionJuniorClases
      : curso === "Senior"
        ? precios?.duracionSeniorClases
        : precios?.duracionMasterClases;
  if (typeof fromConfig === "number" && fromConfig > 0) return fromConfig;
  // Import inline para evitar dep circular en ciertas builds.
  return DURACION_DEFAULT_CLASES[curso];
}

// Calcula la fecha de término del curso de un alumno.
//   fechaTermino = fechaIngreso + ⌈duracionClases / 2⌉ semanas
// Justificación: las clases se dictan martes y miércoles, por lo que cada
// semana cubre 2 clases. ⌈clases/2⌉ es el número de semanas naturales que
// abarca el curso. Devuelve null si el alumno no tiene fechaIngreso ni
// createdAt explotable (p.ej. registros legacy huérfanos).
export function calcularFechaTerminoCurso(
  alumno: Alumno,
  precios: PreciosAlumnos | null,
  // Fallback opcional para alumnos sin `fecha`: pasar createdAt si lo conoces.
  createdAtISO?: string
): Date | null {
  const desde = alumno.fecha || createdAtISO || "";
  if (!desde) return null;
  const base = new Date(desde);
  if (Number.isNaN(base.getTime())) return null;
  const clases = duracionClasesDeCurso(alumno.curso, precios);
  const semanas = Math.ceil(clases / 2);
  const dias = semanas * 7;
  const out = new Date(base);
  out.setDate(out.getDate() + dias);
  return out;
}

// ============================================================
// PAGOS DE ALUMNOS
// ============================================================

type PagoAlumnoInput = Omit<PagoAlumno, "id">;

function mapPagoAlumnoDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): PagoAlumno {
  const data = snap.data();
  return {
    id: snap.id,
    alumnoId: data.alumnoId ?? "",
    alumnoNombre: data.alumnoNombre ?? "",
    curso: data.curso,
    sucursal: data.sucursal,
    mes: typeof data.mes === "number" ? data.mes : Number(data.mes) || 0,
    año: typeof data.año === "number" ? data.año : Number(data.año) || 0,
    monto: Number(data.monto) || 0,
    fechaPago: data.fechaPago ?? "",
    medioPago: data.medioPago ?? "Transferencia",
    // Datos legacy (anteriores a v3) no tienen `tipoPago`. Asumimos "Total".
    tipoPago: data.tipoPago ?? "Total",
    comprobanteUrl: data.comprobanteUrl ?? "",
    comprobanteNombre: data.comprobanteNombre ?? "",
    observacion: data.observacion ?? "",
    registradoPor: data.registradoPor ?? "",
    // registradoEn ahora se persiste vía serverTimestamp().
    registradoEn: tsToISO(data.registradoEn),
  };
}

// Existe pago de tipo "Total" para el alumno en ese mes/año.
// La v3 permite múltiples pagos parciales coexistiendo, pero NO permite que
// haya más de un "Total" — eso indica un duplicado real.
async function existePagoTotalMes(
  alumnoId: string,
  mes: number,
  año: number,
  excludeId?: string
): Promise<boolean> {
  const q = query(
    collection(db, PAGOS_ALUMNOS),
    where("alumnoId", "==", alumnoId),
    where("mes", "==", mes),
    where("año", "==", año)
  );
  const snap = await getDocs(q);
  return snap.docs.some(
    (d) =>
      d.id !== excludeId &&
      ((d.data()?.tipoPago as string | undefined) ?? "Total") === "Total"
  );
}

export async function registrarPagoAlumno(
  data: PagoAlumnoInput
): Promise<string> {
  try {
    // Solo bloqueamos si el pago a registrar es "Total" y ya existe otro
    // "Total" para el mismo alumno/mes/año, o si vamos a registrar un parcial
    // pero ya hay un "Total" cerrando el mes.
    const tipo = data.tipoPago ?? "Total";
    const yaHayTotal = await existePagoTotalMes(
      data.alumnoId,
      data.mes,
      data.año
    );
    if (yaHayTotal) {
      throw new Error(
        "Ya existe un pago Total registrado para ese alumno en el mes seleccionado."
      );
    }
    if (tipo === "Total") {
      // Si vamos a marcar Total, también validamos que no haya parciales
      // sueltos: el usuario debe consolidar antes de cerrar.
      const q = query(
        collection(db, PAGOS_ALUMNOS),
        where("alumnoId", "==", data.alumnoId),
        where("mes", "==", data.mes),
        where("año", "==", data.año)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        throw new Error(
          "El alumno ya tiene pagos parciales en ese mes. Edita los existentes o elige un tipo Parcial."
        );
      }
    }
    // registradoEn: source of truth = servidor (serverTimestamp). El cliente
    // pudo haberlo seteado pero ignoramos para evitar relojes desfasados.
    const { registradoEn: _ignored, ...rest } = data;
    void _ignored;
    const ref = await addDoc(
      collection(db, PAGOS_ALUMNOS),
      stripUndefined({
        ...rest,
        registradoEn: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("registrarPagoAlumno:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo registrar el pago.");
  }
}

export async function actualizarPagoAlumno(
  id: string,
  data: Partial<PagoAlumnoInput>
): Promise<void> {
  try {
    // Solo validamos duplicado si el update está cambiando alumno/mes/año
    // a la combinación "Total" pisando otro Total existente (excluyendo el
    // propio doc que se edita).
    const tipo = data.tipoPago;
    if (
      data.alumnoId &&
      typeof data.mes === "number" &&
      typeof data.año === "number" &&
      tipo === "Total" &&
      (await existePagoTotalMes(data.alumnoId, data.mes, data.año, id))
    ) {
      throw new Error(
        "Ya existe otro pago Total para ese alumno en el mes seleccionado."
      );
    }
    await updateDoc(
      doc(db, PAGOS_ALUMNOS, id),
      stripUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    console.error("actualizarPagoAlumno:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo actualizar el pago.");
  }
}

// Eliminación: borra el doc en Firestore y, si tiene comprobante, intenta
// también borrarlo de Storage. Si Storage falla seguimos adelante para no
// dejar el doc huérfano.
export async function eliminarPagoAlumno(id: string): Promise<void> {
  try {
    const refDoc = doc(db, PAGOS_ALUMNOS, id);
    const snap = await getDoc(refDoc);
    const url = snap.exists()
      ? (snap.data()?.comprobanteUrl as string | undefined)
      : undefined;
    await deleteDoc(refDoc);
    if (url) {
      try {
        const { eliminarComprobantePago } = await import("./storage");
        await eliminarComprobantePago(url);
      } catch (storageErr) {
        console.warn("eliminarPagoAlumno: storage cleanup falló", storageErr);
      }
    }
  } catch (err) {
    console.error("eliminarPagoAlumno:", err);
    throw new Error("No se pudo eliminar el pago.");
  }
}

export async function getPagosPorAlumno(
  alumnoId: string
): Promise<PagoAlumno[]> {
  try {
    // Sin orderBy server-side para no exigir índice compuesto extra.
    const q = query(
      collection(db, PAGOS_ALUMNOS),
      where("alumnoId", "==", alumnoId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(mapPagoAlumnoDoc)
      .sort((a, b) =>
        a.año !== b.año ? b.año - a.año : b.mes - a.mes
      );
  } catch (err) {
    console.error("getPagosPorAlumno:", err);
    throw new Error("No se pudieron cargar los pagos del alumno.");
  }
}

export async function getPagosPorMes(
  mes: number,
  año: number,
  sucursal?: Sucursal
): Promise<PagoAlumno[]> {
  try {
    const constraints = [where("mes", "==", mes), where("año", "==", año)];
    const q = sucursal
      ? query(
          collection(db, PAGOS_ALUMNOS),
          ...constraints,
          where("sucursal", "==", sucursal)
        )
      : query(collection(db, PAGOS_ALUMNOS), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(mapPagoAlumnoDoc);
  } catch (err) {
    console.error("getPagosPorMes:", err);
    throw new Error("No se pudieron cargar los pagos del mes.");
  }
}

// v4: "Al día" = sum(pagos del mes del alumno) >= precio del curso.
// "Con deuda" = el resto (sin pagos o con parciales que aún no cubren).
// Sin precio configurado se mantiene la lógica legacy (cualquier pago = al día).
// totalEsperado = sum(precio_de_su_curso) por todos los alumnos.
// totalRecaudado = sum(monto) de los pagos del mes.
export async function getEstadoMorosidadDelMes(
  mes: number,
  año: number
): Promise<{
  alumnosAlDia: Alumno[];
  alumnosConDeuda: Alumno[];
  totalRecaudado: number;
  totalEsperado: number;
}> {
  try {
    const [alumnos, pagos, precios] = await Promise.all([
      getAlumnos(),
      getPagosPorMes(mes, año),
      getPreciosAlumnos(),
    ]);
    const totalRecaudado = pagos.reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalEsperado = alumnos.reduce((acc, a) => {
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      return acc + precio;
    }, 0);
    const montoPorAlumno = new Map<string, number>();
    for (const p of pagos) {
      montoPorAlumno.set(
        p.alumnoId,
        (montoPorAlumno.get(p.alumnoId) ?? 0) + (p.monto || 0)
      );
    }
    const alumnosAlDia: Alumno[] = [];
    const alumnosConDeuda: Alumno[] = [];
    for (const a of alumnos) {
      const pagado = montoPorAlumno.get(a.id) ?? 0;
      const precio = precios ? precios[a.curso] ?? 0 : 0;
      if (precio > 0) {
        if (pagado >= precio) alumnosAlDia.push(a);
        else alumnosConDeuda.push(a);
      } else {
        if (pagado > 0) alumnosAlDia.push(a);
        else alumnosConDeuda.push(a);
      }
    }
    return { alumnosAlDia, alumnosConDeuda, totalRecaudado, totalEsperado };
  } catch (err) {
    console.error("getEstadoMorosidadDelMes:", err);
    throw new Error("No se pudo calcular el estado de morosidad del mes.");
  }
}

// ============================================================
// PAGOS REALIZADOS A PERSONAL (instructores y profes guías)
// ============================================================
// Una entrada por persona/mes/año cuando el director/admin marca el pago
// como ejecutado. La unicidad se valida client-side (lo mismo que pagos
// alumnos): rules sólo controla read/write por rol.

type PagoRealizadoInput = Omit<PagoRealizado, "id" | "pagadoEn">;

function mapPagoRealizadoDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): PagoRealizado {
  const data = snap.data();
  return {
    id: snap.id,
    tipo: (data.tipo as PagoRealizado["tipo"]) ?? "instructor",
    personaId: data.personaId ?? "",
    personaNombre: data.personaNombre ?? "",
    sucursal: data.sucursal,
    mes: typeof data.mes === "number" ? data.mes : Number(data.mes) || 0,
    año: typeof data.año === "number" ? data.año : Number(data.año) || 0,
    monto: Number(data.monto) || 0,
    fechaPago: data.fechaPago ?? "",
    pagadoPor: data.pagadoPor ?? "",
    pagadoEn: tsToISO(data.pagadoEn),
  };
}

export async function getPagosRealizadosPorMes(
  mes: number,
  año: number
): Promise<PagoRealizado[]> {
  try {
    const q = query(
      collection(db, PAGOS_REALIZADOS),
      where("mes", "==", mes),
      where("año", "==", año)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapPagoRealizadoDoc);
  } catch (err) {
    console.error("getPagosRealizadosPorMes:", err);
    throw new Error("No se pudieron cargar los pagos realizados.");
  }
}

export async function marcarPagoRealizado(
  data: PagoRealizadoInput
): Promise<string> {
  try {
    // Unicidad: solo un pago por (tipo, personaId, mes, año).
    const dupQuery = query(
      collection(db, PAGOS_REALIZADOS),
      where("tipo", "==", data.tipo),
      where("personaId", "==", data.personaId),
      where("mes", "==", data.mes),
      where("año", "==", data.año)
    );
    const dupSnap = await getDocs(dupQuery);
    if (!dupSnap.empty) {
      throw new Error("Esta persona ya está marcada como pagada en ese mes.");
    }
    const ref = await addDoc(
      collection(db, PAGOS_REALIZADOS),
      stripUndefined({
        ...data,
        pagadoEn: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  } catch (err) {
    console.error("marcarPagoRealizado:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo marcar el pago como realizado.");
  }
}

export async function eliminarPagoRealizado(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PAGOS_REALIZADOS, id));
  } catch (err) {
    console.error("eliminarPagoRealizado:", err);
    throw new Error("No se pudo deshacer el pago realizado.");
  }
}

// Exportar helpers y tipos de entrada para uso en hooks/componentes.
export type {
  AlumnoInput,
  ProfeGuiaInput,
  InstructorInput,
  AsistenciaAlumnoInput,
  EvaluacionAlumnoInput,
  AsistenciaProfeGuiaInput,
  TemarioInput,
  PagoAlumnoInput,
  PagoRealizadoInput,
};
export {
  ALUMNOS as ALUMNOS_COLLECTION,
  PROFES_GUIAS as PROFES_GUIAS_COLLECTION,
  INSTRUCTORES as INSTRUCTORES_COLLECTION,
  HISTORIAL_ASIGNACIONES as HISTORIAL_ASIGNACIONES_COLLECTION,
  ASISTENCIAS_ALUMNOS as ASISTENCIAS_ALUMNOS_COLLECTION,
  EVALUACIONES_ALUMNOS as EVALUACIONES_ALUMNOS_COLLECTION,
  ASISTENCIAS_PROFES_GUIAS as ASISTENCIAS_PROFES_GUIAS_COLLECTION,
  TEMARIOS as TEMARIOS_COLLECTION,
  CONFIG_PAGOS as CONFIG_PAGOS_COLLECTION,
  PRECIOS_ALUMNOS as PRECIOS_ALUMNOS_COLLECTION,
  PAGOS_ALUMNOS as PAGOS_ALUMNOS_COLLECTION,
  PAGOS_REALIZADOS as PAGOS_REALIZADOS_COLLECTION,
};
