// Capa de acceso a datos sobre Supabase. Reemplaza lib/firestore.ts.
//
// Convención: cada función devuelve los tipos "domain" en camelCase
// (ej. Alumno, Instructor). El mapeo snake↔camel ocurre acá vía los
// helpers `to*` y `from*`. Los componentes/hooks consumen estos tipos
// sin saber que la BD usa snake_case.
//
// Errores: propagamos Error con mensaje legible al usuario. La capa
// supabase-js ya devuelve `{ data, error }` — chequeamos error y
// tiramos si hay algo.

import { supabase } from "./supabase";
import type {
  Alumno,
  AlumnoRow,
  AppUser,
  AppUserRow,
  AsistenciaAlumno,
  AsistenciaAlumnoRow,
  AsistenciaProfeGuia,
  AsistenciaProfeGuiaRow,
  ConfigPagos,
  ConfigPagosRow,
  Curso,
  EvaluacionAlumno,
  EvaluacionAlumnoRow,
  HistorialAsignacion,
  HistorialAsignacionRow,
  Instructor,
  InstructorRow,
  PagoAlumno,
  PagoAlumnoRow,
  PagoRealizado,
  PagoRealizadoRow,
  PreciosAlumnos,
  PreciosAlumnosRow,
  ProfeGuia,
  ProfeGuiaRow,
  SemanaTemarioRow,
  StaffRole,
  Sucursal,
  TarifasPorCurso,
  TemaSemana,
  TemarioCurso,
  TemarioRow,
} from "./database.types";

// =====================================================================
// Helpers genéricos
// =====================================================================

function nz<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

function rethrow(scope: string, error: unknown, userMessage: string): never {
  console.error(`[supabase] ${scope}:`, error);
  if (error instanceof Error) throw new Error(`${userMessage} (${error.message})`);
  throw new Error(userMessage);
}

// =====================================================================
// Adapters snake_case ↔ camelCase
// =====================================================================

function toAlumno(r: AlumnoRow): Alumno {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: nz(r.telefono),
    sucursal: r.sucursal,
    curso: r.curso,
    horario: r.horario,
    fecha: r.fecha,
    profeGuiaId: nz(r.profe_guia_id),
    instructorId: nz(r.instructor_id),
    activo: r.activo,
  };
}

function fromAlumnoInput(a: Omit<Alumno, "id">): Omit<AlumnoRow, "id" | "created_at" | "updated_at"> {
  return {
    nombre: a.nombre,
    telefono: a.telefono ?? null,
    sucursal: a.sucursal,
    curso: a.curso,
    horario: a.horario,
    fecha: a.fecha,
    // profe_guia_id e instructor_id son UUID con FK. Un string vacío "" no es
    // UUID válido y la BD rechaza el insert. Los formularios y el BulkImport
    // a veces mandan "" cuando no hay asignación — lo normalizamos a null.
    profe_guia_id: a.profeGuiaId && a.profeGuiaId.length > 0 ? a.profeGuiaId : null,
    instructor_id: a.instructorId && a.instructorId.length > 0 ? a.instructorId : null,
    activo: a.activo,
  };
}

function toProfeGuia(r: ProfeGuiaRow): ProfeGuia {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: nz(r.telefono),
    sucursal: r.sucursal,
    activo: r.activo,
    fechaIngreso: r.fecha_ingreso,
  };
}

function fromProfeGuiaInput(p: Omit<ProfeGuia, "id">): Omit<ProfeGuiaRow, "id" | "created_at" | "updated_at"> {
  return {
    nombre: p.nombre,
    telefono: p.telefono ?? null,
    sucursal: p.sucursal,
    activo: p.activo,
    fecha_ingreso: p.fechaIngreso,
  };
}

function toInstructor(r: InstructorRow): Instructor {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    email: r.email,
    nombreCompleto: r.nombre_completo,
    telefono: nz(r.telefono),
    sucursalActual: r.sucursal_actual,
    activo: r.activo,
    fechaIngreso: r.fecha_ingreso,
    fechaCreacion: r.created_at,
    creadoPor: r.creado_por,
    authVerificado: r.auth_verificado,
  };
}

function fromInstructorInput(
  i: Omit<Instructor, "id" | "fechaCreacion">
): Omit<InstructorRow, "id" | "created_at" | "updated_at"> {
  return {
    // user_id es UUID con FK a auth.users — "" no es UUID válido.
    user_id: i.userId && i.userId.length > 0 ? i.userId : null,
    username: i.username,
    email: i.email,
    nombre_completo: i.nombreCompleto,
    telefono: i.telefono ?? null,
    sucursal_actual: i.sucursalActual,
    activo: i.activo,
    fecha_ingreso: i.fechaIngreso,
    creado_por: i.creadoPor,
    auth_verificado: i.authVerificado,
  };
}

function toHistorial(r: HistorialAsignacionRow): HistorialAsignacion {
  return {
    id: r.id,
    instructorId: r.instructor_id,
    sucursal: r.sucursal,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin,
    razonCambio: nz(r.razon_cambio),
    cambiadoPor: r.cambiado_por,
  };
}

function toAsistencia(r: AsistenciaAlumnoRow): AsistenciaAlumno {
  return {
    id: r.id,
    alumnoId: r.alumno_id,
    fecha: r.fecha,
    estado: r.estado,
    observacion: nz(r.observacion),
    registradaPor: r.registrada_por,
    sucursal: r.sucursal,
    curso: r.curso,
    turno: r.turno,
    tarifaInstructorAplicada: nz(r.tarifa_instructor_aplicada),
    tarifaProfeGuiaAplicada: nz(r.tarifa_profe_guia_aplicada),
    profeGuiaIdSnapshot: nz(r.profe_guia_id_snapshot),
    instructorIdSnapshot: nz(r.instructor_id_snapshot),
  };
}

function fromAsistenciaInput(
  a: Omit<AsistenciaAlumno, "id">
): Omit<AsistenciaAlumnoRow, "id" | "created_at"> {
  return {
    alumno_id: a.alumnoId,
    fecha: a.fecha,
    estado: a.estado,
    observacion: a.observacion ?? null,
    registrada_por: a.registradaPor,
    sucursal: a.sucursal,
    curso: a.curso,
    turno: a.turno,
    tarifa_instructor_aplicada: a.tarifaInstructorAplicada ?? null,
    tarifa_profe_guia_aplicada: a.tarifaProfeGuiaAplicada ?? null,
    // Snapshots son UUID nullable en BD — "" no es UUID válido. resolverSnapshots
    // pone "" como default cuando el alumno no tiene asignación; lo normalizamos a null.
    profe_guia_id_snapshot:
      a.profeGuiaIdSnapshot && a.profeGuiaIdSnapshot.length > 0 ? a.profeGuiaIdSnapshot : null,
    instructor_id_snapshot:
      a.instructorIdSnapshot && a.instructorIdSnapshot.length > 0 ? a.instructorIdSnapshot : null,
  };
}

function toAsistenciaProfe(r: AsistenciaProfeGuiaRow): AsistenciaProfeGuia {
  return {
    id: r.id,
    profeGuiaId: r.profe_guia_id,
    fecha: r.fecha,
    estado: r.estado,
    observacion: nz(r.observacion),
    registradaPor: r.registrada_por,
    sucursal: r.sucursal,
  };
}

function fromAsistenciaProfeInput(
  a: Omit<AsistenciaProfeGuia, "id">
): Omit<AsistenciaProfeGuiaRow, "id" | "created_at"> {
  return {
    profe_guia_id: a.profeGuiaId,
    fecha: a.fecha,
    estado: a.estado,
    observacion: a.observacion ?? null,
    registrada_por: a.registradaPor,
    sucursal: a.sucursal,
  };
}

function toEvaluacion(r: EvaluacionAlumnoRow): EvaluacionAlumno {
  return {
    id: r.id,
    alumnoId: r.alumno_id,
    fecha: r.fecha,
    nota: Number(r.nota),
    observacion: nz(r.observacion),
    evaluadoPor: r.evaluado_por,
    sucursal: r.sucursal,
    curso: r.curso,
  };
}

function fromEvaluacionInput(
  e: Omit<EvaluacionAlumno, "id">
): Omit<EvaluacionAlumnoRow, "id" | "created_at"> {
  return {
    alumno_id: e.alumnoId,
    fecha: e.fecha,
    nota: e.nota,
    observacion: e.observacion ?? null,
    evaluado_por: e.evaluadoPor,
    sucursal: e.sucursal,
    curso: e.curso,
  };
}

function toConfigPagos(r: ConfigPagosRow): ConfigPagos {
  return {
    id: "default",
    montosInstructor: {
      Junior: {
        primero: r.monto_instructor_primer_alumno_junior,
        adicional: r.monto_instructor_alumno_adicional_junior,
      },
      Senior: {
        primero: r.monto_instructor_primer_alumno_senior,
        adicional: r.monto_instructor_alumno_adicional_senior,
      },
      Master: {
        primero: r.monto_instructor_primer_alumno_master,
        adicional: r.monto_instructor_alumno_adicional_master,
      },
    },
    tarifasInstructor: {
      Junior: r.tarifa_instructor_junior,
      Senior: r.tarifa_instructor_senior,
      Master: r.tarifa_instructor_master,
    },
    tarifasProfeGuia: {
      Junior: r.tarifa_profe_guia_junior,
      Senior: r.tarifa_profe_guia_senior,
      Master: r.tarifa_profe_guia_master,
    },
    actualizadoPor: r.actualizado_por,
    actualizadoEn: r.actualizado_en,
  };
}

function toPrecios(r: PreciosAlumnosRow): PreciosAlumnos {
  return {
    id: "default",
    Junior: r.precio_junior,
    Senior: r.precio_senior,
    Master: r.precio_master,
    duracionJuniorClases: r.duracion_junior_clases,
    duracionSeniorClases: r.duracion_senior_clases,
    duracionMasterClases: r.duracion_master_clases,
    inscripcionJunior: r.inscripcion_junior,
    inscripcionSenior: r.inscripcion_senior,
    inscripcionMaster: r.inscripcion_master,
    actualizadoPor: r.actualizado_por,
    actualizadoEn: r.actualizado_en,
  };
}

function toPagoAlumno(r: PagoAlumnoRow): PagoAlumno {
  return {
    id: r.id,
    alumnoId: r.alumno_id,
    alumnoNombre: r.alumno_nombre,
    curso: r.curso,
    sucursal: r.sucursal,
    mes: r.mes,
    año: r.anio,
    monto: r.monto,
    fechaPago: r.fecha_pago,
    medioPago: r.medio_pago,
    tipoPago: r.tipo_pago,
    pagaInscripcion: r.paga_inscripcion ?? false,
    comprobanteUrl: nz(r.comprobante_url),
    comprobanteNombre: nz(r.comprobante_nombre),
    observacion: nz(r.observacion),
    registradoPor: r.registrado_por,
    registradoEn: r.registrado_en,
  };
}

function fromPagoAlumnoInput(
  p: Omit<PagoAlumno, "id" | "registradoEn">
): Omit<PagoAlumnoRow, "id" | "created_at" | "updated_at" | "registrado_en"> {
  return {
    alumno_id: p.alumnoId,
    alumno_nombre: p.alumnoNombre,
    curso: p.curso,
    sucursal: p.sucursal,
    mes: p.mes,
    anio: p.año,
    monto: p.monto,
    fecha_pago: p.fechaPago,
    medio_pago: p.medioPago,
    tipo_pago: p.tipoPago,
    paga_inscripcion: p.pagaInscripcion ?? false,
    comprobante_url: p.comprobanteUrl ?? null,
    comprobante_nombre: p.comprobanteNombre ?? null,
    observacion: p.observacion ?? null,
    registrado_por: p.registradoPor,
  };
}

function toPagoRealizado(r: PagoRealizadoRow): PagoRealizado {
  return {
    id: r.id,
    tipo: r.tipo,
    personaId: r.persona_id,
    personaNombre: r.persona_nombre,
    sucursal: r.sucursal,
    mes: r.mes,
    año: r.anio,
    monto: r.monto,
    fechaPago: r.fecha_pago,
    pagadoPor: r.pagado_por,
    pagadoEn: r.pagado_en,
  };
}

// =====================================================================
// CRUD: Alumnos
// =====================================================================

export async function getAlumnos(): Promise<Alumno[]> {
  const { data, error } = await supabase
    .from("alumnos")
    .select("*")
    .order("nombre", { ascending: true });
  if (error) rethrow("getAlumnos", error, "No se pudieron cargar los alumnos.");
  return (data ?? []).map(toAlumno);
}

export async function getAlumnosPorSucursal(sucursal: Sucursal): Promise<Alumno[]> {
  const { data, error } = await supabase
    .from("alumnos")
    .select("*")
    .eq("sucursal", sucursal)
    .order("nombre", { ascending: true });
  if (error) rethrow("getAlumnosPorSucursal", error, `No se pudieron cargar los alumnos de ${sucursal}.`);
  return (data ?? []).map(toAlumno);
}

export async function createAlumno(a: Omit<Alumno, "id">): Promise<string> {
  const { data, error } = await supabase
    .from("alumnos")
    .insert(fromAlumnoInput(a))
    .select("id")
    .single();
  if (error) rethrow("createAlumno", error, "No se pudo crear el alumno.");
  return data!.id;
}

export async function createAlumnosMasivo(items: Omit<Alumno, "id">[]): Promise<string[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from("alumnos")
    .insert(items.map(fromAlumnoInput))
    .select("id");
  if (error) rethrow("createAlumnosMasivo", error, "No se pudieron importar los alumnos.");
  return (data ?? []).map((r) => r.id);
}

export async function updateAlumno(id: string, patch: Partial<Omit<Alumno, "id">>): Promise<void> {
  const fields: Partial<AlumnoRow> = {};
  if (patch.nombre !== undefined) fields.nombre = patch.nombre;
  if (patch.telefono !== undefined) fields.telefono = patch.telefono ?? null;
  if (patch.sucursal !== undefined) fields.sucursal = patch.sucursal;
  if (patch.curso !== undefined) fields.curso = patch.curso;
  if (patch.horario !== undefined) fields.horario = patch.horario;
  if (patch.fecha !== undefined) fields.fecha = patch.fecha;
  if (patch.profeGuiaId !== undefined) {
    fields.profe_guia_id = patch.profeGuiaId && patch.profeGuiaId.length > 0 ? patch.profeGuiaId : null;
  }
  if (patch.instructorId !== undefined) {
    fields.instructor_id = patch.instructorId && patch.instructorId.length > 0 ? patch.instructorId : null;
  }
  if (patch.activo !== undefined) fields.activo = patch.activo;
  const { error } = await supabase.from("alumnos").update(fields).eq("id", id);
  if (error) rethrow("updateAlumno", error, "No se pudo actualizar el alumno.");
}

export async function deleteAlumno(id: string): Promise<void> {
  // Soft delete: marca activo=false, preserva pagos/asistencias históricos.
  await updateAlumno(id, { activo: false });
}

export async function reactivateAlumno(id: string): Promise<void> {
  await updateAlumno(id, { activo: true });
}

// Asigna alumno a instructor; deja en NULL al profe guía (mutuamente excluyentes).
export async function asignarInstructorAAlumno(alumnoId: string, instructorId: string | null): Promise<void> {
  await updateAlumno(alumnoId, { instructorId: instructorId ?? undefined, profeGuiaId: undefined });
  // updateAlumno solo setea los campos pasados; necesitamos limpiar el OTRO explícitamente.
  const { error } = await supabase
    .from("alumnos")
    .update({ instructor_id: instructorId, profe_guia_id: null })
    .eq("id", alumnoId);
  if (error) rethrow("asignarInstructorAAlumno", error, "No se pudo asignar el instructor.");
}

export async function asignarProfeGuiaAAlumno(alumnoId: string, profeGuiaId: string | null): Promise<void> {
  const { error } = await supabase
    .from("alumnos")
    .update({ profe_guia_id: profeGuiaId, instructor_id: null })
    .eq("id", alumnoId);
  if (error) rethrow("asignarProfeGuiaAAlumno", error, "No se pudo asignar el profe guía.");
}

// =====================================================================
// CRUD: Profes Guías
// =====================================================================

export async function getProfesGuias(): Promise<ProfeGuia[]> {
  const { data, error } = await supabase.from("profes_guias").select("*").order("nombre");
  if (error) rethrow("getProfesGuias", error, "No se pudieron cargar los profes guías.");
  return (data ?? []).map(toProfeGuia);
}

export async function getProfesGuiasPorSucursal(sucursal: Sucursal): Promise<ProfeGuia[]> {
  const { data, error } = await supabase
    .from("profes_guias")
    .select("*")
    .eq("sucursal", sucursal)
    .order("nombre");
  if (error) rethrow("getProfesGuiasPorSucursal", error, `No se pudieron cargar los profes guías de ${sucursal}.`);
  return (data ?? []).map(toProfeGuia);
}

export async function createProfeGuia(p: Omit<ProfeGuia, "id">): Promise<string> {
  const { data, error } = await supabase
    .from("profes_guias")
    .insert(fromProfeGuiaInput(p))
    .select("id")
    .single();
  if (error) rethrow("createProfeGuia", error, "No se pudo crear el profe guía.");
  return data!.id;
}

export async function createProfesGuiasMasivo(items: Omit<ProfeGuia, "id">[]): Promise<string[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from("profes_guias")
    .insert(items.map(fromProfeGuiaInput))
    .select("id");
  if (error) rethrow("createProfesGuiasMasivo", error, "No se pudieron importar los profes guías.");
  return (data ?? []).map((r) => r.id);
}

export async function updateProfeGuia(id: string, patch: Partial<Omit<ProfeGuia, "id">>): Promise<void> {
  const fields: Partial<ProfeGuiaRow> = {};
  if (patch.nombre !== undefined) fields.nombre = patch.nombre;
  if (patch.telefono !== undefined) fields.telefono = patch.telefono ?? null;
  if (patch.sucursal !== undefined) fields.sucursal = patch.sucursal;
  if (patch.activo !== undefined) fields.activo = patch.activo;
  if (patch.fechaIngreso !== undefined) fields.fecha_ingreso = patch.fechaIngreso;
  const { error } = await supabase.from("profes_guias").update(fields).eq("id", id);
  if (error) rethrow("updateProfeGuia", error, "No se pudo actualizar el profe guía.");
}

export async function deleteProfeGuia(id: string): Promise<void> {
  await updateProfeGuia(id, { activo: false });
}

export async function reactivateProfeGuia(id: string): Promise<void> {
  await updateProfeGuia(id, { activo: true });
}

export const deactivateProfeGuia = deleteProfeGuia;

// =====================================================================
// CRUD: Instructores
// =====================================================================

export async function getInstructores(): Promise<Instructor[]> {
  const { data, error } = await supabase.from("instructores").select("*").order("nombre_completo");
  if (error) rethrow("getInstructores", error, "No se pudieron cargar los instructores.");
  return (data ?? []).map(toInstructor);
}

export async function getInstructoresPorSucursal(sucursal: Sucursal): Promise<Instructor[]> {
  const { data, error } = await supabase
    .from("instructores")
    .select("*")
    .eq("sucursal_actual", sucursal)
    .order("nombre_completo");
  if (error) rethrow("getInstructoresPorSucursal", error, `No se pudieron cargar los instructores de ${sucursal}.`);
  return (data ?? []).map(toInstructor);
}

export async function getInstructorPorEmail(email: string): Promise<Instructor | null> {
  const { data, error } = await supabase
    .from("instructores")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) rethrow("getInstructorPorEmail", error, "No se pudo cargar el perfil de instructor.");
  return data ? toInstructor(data) : null;
}

export async function createInstructor(i: Omit<Instructor, "id" | "fechaCreacion">): Promise<string> {
  // Cliente-side: crear el perfil en instructores. La cuenta Firebase Auth
  // equivalente (Supabase Auth) la crea el director manualmente desde el
  // dashboard de Supabase o vía una API server-side con service_role.
  // Después, una vez creado el auth.users, el director marca
  // auth_verificado=true desde la UI.
  const { data, error } = await supabase
    .from("instructores")
    .insert(fromInstructorInput(i))
    .select("id")
    .single();
  if (error) rethrow("createInstructor", error, "No se pudo crear el instructor.");

  // Primera entrada del historial (asignación inicial).
  await supabase.from("historial_asignaciones").insert({
    instructor_id: data!.id,
    sucursal: i.sucursalActual,
    fecha_inicio: i.fechaIngreso || new Date().toISOString().split("T")[0],
    fecha_fin: null,
    razon_cambio: "Asignación inicial",
    cambiado_por: i.creadoPor,
  });

  return data!.id;
}

export async function updateInstructor(
  id: string,
  patch: Partial<Omit<Instructor, "id">>
): Promise<void> {
  const fields: Partial<InstructorRow> = {};
  if (patch.userId !== undefined) {
    fields.user_id = patch.userId && patch.userId.length > 0 ? patch.userId : null;
  }
  if (patch.username !== undefined) fields.username = patch.username;
  if (patch.email !== undefined) fields.email = patch.email;
  if (patch.nombreCompleto !== undefined) fields.nombre_completo = patch.nombreCompleto;
  if (patch.telefono !== undefined) fields.telefono = patch.telefono ?? null;
  if (patch.sucursalActual !== undefined) fields.sucursal_actual = patch.sucursalActual;
  if (patch.activo !== undefined) fields.activo = patch.activo;
  if (patch.fechaIngreso !== undefined) fields.fecha_ingreso = patch.fechaIngreso;
  if (patch.creadoPor !== undefined) fields.creado_por = patch.creadoPor;
  if (patch.authVerificado !== undefined) fields.auth_verificado = patch.authVerificado;
  const { error } = await supabase.from("instructores").update(fields).eq("id", id);
  if (error) rethrow("updateInstructor", error, "No se pudo actualizar el instructor.");
}

export async function deactivateInstructor(id: string): Promise<void> {
  await updateInstructor(id, { activo: false });
}
export const deleteInstructor = deactivateInstructor;

export async function reactivateInstructor(id: string): Promise<void> {
  await updateInstructor(id, { activo: true });
}

export async function marcarAuthVerificado(id: string): Promise<void> {
  await updateInstructor(id, { authVerificado: true });
}

// Reasignar sucursal: cierra el historial vigente (fecha_fin) y abre uno nuevo.
export async function reasignarSucursalInstructor(
  instructorId: string,
  nuevaSucursal: Sucursal,
  razon: string,
  cambiadoPor: string
): Promise<void> {
  const hoy = new Date().toISOString().split("T")[0];
  // 1. Cerrar el historial activo si existe.
  await supabase
    .from("historial_asignaciones")
    .update({ fecha_fin: hoy })
    .eq("instructor_id", instructorId)
    .is("fecha_fin", null);
  // 2. Crear nueva entrada.
  await supabase.from("historial_asignaciones").insert({
    instructor_id: instructorId,
    sucursal: nuevaSucursal,
    fecha_inicio: hoy,
    fecha_fin: null,
    razon_cambio: razon,
    cambiado_por: cambiadoPor,
  });
  // 3. Actualizar la sucursal actual.
  await updateInstructor(instructorId, { sucursalActual: nuevaSucursal });
}

export async function getHistorialPorInstructor(instructorId: string): Promise<HistorialAsignacion[]> {
  const { data, error } = await supabase
    .from("historial_asignaciones")
    .select("*")
    .eq("instructor_id", instructorId)
    .order("fecha_inicio", { ascending: false });
  if (error) rethrow("getHistorialPorInstructor", error, "No se pudo cargar el historial.");
  return (data ?? []).map(toHistorial);
}

// =====================================================================
// Asistencias de alumnos
// =====================================================================

function assertFechaEsDiaDeClase(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  const dow = new Date(fecha + "T12:00:00Z").getUTCDay();
  if (dow !== 2 && dow !== 3) {
    throw new Error(`Solo se pueden registrar asistencias los martes y miércoles. Fecha: ${fecha}`);
  }
}

async function resolverSnapshots(
  input: Omit<AsistenciaAlumno, "id">
): Promise<Omit<AsistenciaAlumno, "id">> {
  const needTarifa =
    input.tarifaInstructorAplicada === undefined ||
    input.tarifaProfeGuiaAplicada === undefined;
  const needAsig =
    input.profeGuiaIdSnapshot === undefined ||
    input.instructorIdSnapshot === undefined;
  if (!needTarifa && !needAsig) return input;

  let cfg: ConfigPagos | null = null;
  let alumno: Alumno | null = null;
  if (needTarifa) cfg = await getConfigPagos();
  if (needAsig) {
    const { data } = await supabase
      .from("alumnos")
      .select("*")
      .eq("id", input.alumnoId)
      .maybeSingle();
    if (data) alumno = toAlumno(data);
  }

  return {
    ...input,
    tarifaInstructorAplicada:
      input.tarifaInstructorAplicada ?? cfg?.tarifasInstructor[input.curso] ?? 0,
    tarifaProfeGuiaAplicada:
      input.tarifaProfeGuiaAplicada ?? cfg?.tarifasProfeGuia[input.curso] ?? 0,
    profeGuiaIdSnapshot: input.profeGuiaIdSnapshot ?? alumno?.profeGuiaId ?? "",
    instructorIdSnapshot: input.instructorIdSnapshot ?? alumno?.instructorId ?? "",
  };
}

export async function registrarAsistenciaAlumno(input: Omit<AsistenciaAlumno, "id">): Promise<string> {
  assertFechaEsDiaDeClase(input.fecha);
  const resolved = await resolverSnapshots(input);
  const { data, error } = await supabase
    .from("asistencias_alumnos")
    .insert(fromAsistenciaInput(resolved))
    .select("id")
    .single();
  if (error) rethrow("registrarAsistenciaAlumno", error, "No se pudo registrar la asistencia.");
  return data!.id;
}

export async function registrarAsistenciasAlumnosBatch(
  filas: Omit<AsistenciaAlumno, "id">[],
  snapshotProvider?: (a: Omit<AsistenciaAlumno, "id">) => Partial<
    Pick<AsistenciaAlumno, "tarifaInstructorAplicada" | "tarifaProfeGuiaAplicada" | "profeGuiaIdSnapshot" | "instructorIdSnapshot">
  >
): Promise<string[]> {
  if (filas.length === 0) return [];
  for (const f of filas) assertFechaEsDiaDeClase(f.fecha);

  let cfg: ConfigPagos | null = null;
  const resueltas: Omit<AsistenciaAlumno, "id">[] = [];
  for (const f of filas) {
    const provided = snapshotProvider?.(f) ?? {};
    const merged: Omit<AsistenciaAlumno, "id"> = { ...f, ...provided };
    if (merged.tarifaInstructorAplicada === undefined || merged.tarifaProfeGuiaAplicada === undefined) {
      if (!cfg) cfg = await getConfigPagos();
      merged.tarifaInstructorAplicada = merged.tarifaInstructorAplicada ?? cfg.tarifasInstructor[f.curso] ?? 0;
      merged.tarifaProfeGuiaAplicada = merged.tarifaProfeGuiaAplicada ?? cfg.tarifasProfeGuia[f.curso] ?? 0;
    }
    if (merged.profeGuiaIdSnapshot === undefined) merged.profeGuiaIdSnapshot = "";
    if (merged.instructorIdSnapshot === undefined) merged.instructorIdSnapshot = "";
    resueltas.push(merged);
  }

  const { data, error } = await supabase
    .from("asistencias_alumnos")
    .insert(resueltas.map(fromAsistenciaInput))
    .select("id");
  if (error) rethrow("registrarAsistenciasAlumnosBatch", error, "No se pudo registrar el lote de asistencias.");
  return (data ?? []).map((r) => r.id);
}

export async function getAsistenciasPorAlumno(alumnoId: string, limite?: number): Promise<AsistenciaAlumno[]> {
  let q = supabase
    .from("asistencias_alumnos")
    .select("*")
    .eq("alumno_id", alumnoId)
    .order("fecha", { ascending: false });
  if (limite) q = q.limit(limite);
  const { data, error } = await q;
  if (error) rethrow("getAsistenciasPorAlumno", error, "No se pudieron cargar las asistencias.");
  return (data ?? []).map(toAsistencia);
}

export async function getAsistenciasDelDia(
  sucursal: Sucursal,
  fecha: string,
  turno?: import("./database.types").Horario
): Promise<AsistenciaAlumno[]> {
  let q = supabase
    .from("asistencias_alumnos")
    .select("*")
    .eq("sucursal", sucursal)
    .eq("fecha", fecha);
  if (turno) q = q.eq("turno", turno);
  const { data, error } = await q;
  if (error) rethrow("getAsistenciasDelDia", error, "No se pudieron cargar las asistencias del día.");
  return (data ?? []).map(toAsistencia);
}

export async function updateAsistenciaAlumno(
  id: string,
  patch: Partial<Omit<AsistenciaAlumno, "id">>
): Promise<void> {
  const fields: Partial<AsistenciaAlumnoRow> = {};
  if (patch.estado !== undefined) fields.estado = patch.estado;
  if (patch.observacion !== undefined) fields.observacion = patch.observacion ?? null;
  const { error } = await supabase.from("asistencias_alumnos").update(fields).eq("id", id);
  if (error) rethrow("updateAsistenciaAlumno", error, "No se pudo actualizar la asistencia.");
}

export async function deleteAsistenciaAlumno(id: string): Promise<void> {
  const { error } = await supabase.from("asistencias_alumnos").delete().eq("id", id);
  if (error) rethrow("deleteAsistenciaAlumno", error, "No se pudo eliminar la asistencia.");
}

// Rango de fecha (para cálculo de pagos del mes).
export async function getAsistenciasEnRango(
  sucursal: Sucursal | null,
  desde: string,
  hasta: string
): Promise<AsistenciaAlumno[]> {
  let q = supabase
    .from("asistencias_alumnos")
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (sucursal) q = q.eq("sucursal", sucursal);
  const { data, error } = await q;
  if (error) rethrow("getAsistenciasEnRango", error, "No se pudieron cargar las asistencias del período.");
  return (data ?? []).map(toAsistencia);
}

// =====================================================================
// Asistencias profes guías
// =====================================================================

export async function registrarAsistenciaProfe(input: Omit<AsistenciaProfeGuia, "id">): Promise<string> {
  assertFechaEsDiaDeClase(input.fecha);
  const { data, error } = await supabase
    .from("asistencias_profes_guias")
    .insert(fromAsistenciaProfeInput(input))
    .select("id")
    .single();
  if (error) rethrow("registrarAsistenciaProfe", error, "No se pudo registrar la asistencia del profe guía.");
  return data!.id;
}

export async function getAsistenciasProfesDelDia(
  sucursal: Sucursal,
  fecha: string
): Promise<AsistenciaProfeGuia[]> {
  const { data, error } = await supabase
    .from("asistencias_profes_guias")
    .select("*")
    .eq("sucursal", sucursal)
    .eq("fecha", fecha);
  if (error) rethrow("getAsistenciasProfesDelDia", error, "No se pudieron cargar las asistencias de profes guías.");
  return (data ?? []).map(toAsistenciaProfe);
}

export async function getAsistenciasProfeGuiaPorMes(
  profeGuiaId: string,
  mes: number,
  anio: number
): Promise<AsistenciaProfeGuia[]> {
  const mm = String(mes).padStart(2, "0");
  const desde = `${anio}-${mm}-01`;
  const ultimo = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${mm}-${String(ultimo).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("asistencias_profes_guias")
    .select("*")
    .eq("profe_guia_id", profeGuiaId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  if (error) rethrow("getAsistenciasProfeGuiaPorMes", error, "No se pudieron cargar las asistencias.");
  return (data ?? []).map(toAsistenciaProfe);
}

export async function updateAsistenciaProfe(
  id: string,
  patch: Partial<Omit<AsistenciaProfeGuia, "id">>
): Promise<void> {
  const fields: Partial<AsistenciaProfeGuiaRow> = {};
  if (patch.estado !== undefined) fields.estado = patch.estado;
  if (patch.observacion !== undefined) fields.observacion = patch.observacion ?? null;
  const { error } = await supabase.from("asistencias_profes_guias").update(fields).eq("id", id);
  if (error) rethrow("updateAsistenciaProfe", error, "No se pudo actualizar la asistencia.");
}

export async function deleteAsistenciaProfe(id: string): Promise<void> {
  const { error } = await supabase.from("asistencias_profes_guias").delete().eq("id", id);
  if (error) rethrow("deleteAsistenciaProfe", error, "No se pudo eliminar la asistencia.");
}

// =====================================================================
// Evaluaciones
// =====================================================================

export async function registrarEvaluacion(input: Omit<EvaluacionAlumno, "id">): Promise<string> {
  assertFechaEsDiaDeClase(input.fecha);
  if (input.nota < 1 || input.nota > 10) throw new Error("La nota debe estar entre 1 y 10.");
  const { data, error } = await supabase
    .from("evaluaciones_alumnos")
    .insert(fromEvaluacionInput(input))
    .select("id")
    .single();
  if (error) rethrow("registrarEvaluacion", error, "No se pudo registrar la evaluación.");
  return data!.id;
}

export async function getEvaluacionesPorAlumno(alumnoId: string, limite?: number): Promise<EvaluacionAlumno[]> {
  let q = supabase
    .from("evaluaciones_alumnos")
    .select("*")
    .eq("alumno_id", alumnoId)
    .order("fecha", { ascending: false });
  if (limite) q = q.limit(limite);
  const { data, error } = await q;
  if (error) rethrow("getEvaluacionesPorAlumno", error, "No se pudieron cargar las evaluaciones.");
  return (data ?? []).map(toEvaluacion);
}

export async function updateEvaluacion(
  id: string,
  patch: Partial<Omit<EvaluacionAlumno, "id">>
): Promise<void> {
  const fields: Partial<EvaluacionAlumnoRow> = {};
  if (patch.nota !== undefined) fields.nota = patch.nota;
  if (patch.observacion !== undefined) fields.observacion = patch.observacion ?? null;
  const { error } = await supabase.from("evaluaciones_alumnos").update(fields).eq("id", id);
  if (error) rethrow("updateEvaluacion", error, "No se pudo actualizar la evaluación.");
}

export async function deleteEvaluacion(id: string): Promise<void> {
  const { error } = await supabase.from("evaluaciones_alumnos").delete().eq("id", id);
  if (error) rethrow("deleteEvaluacion", error, "No se pudo eliminar la evaluación.");
}

// =====================================================================
// Config pagos & Precios alumnos (singletons)
// =====================================================================

export async function getConfigPagos(): Promise<ConfigPagos> {
  const { data, error } = await supabase.from("config_pagos").select("*").eq("id", "default").maybeSingle();
  if (error) rethrow("getConfigPagos", error, "No se pudo cargar la configuración de pagos.");
  if (!data) throw new Error("config_pagos/default no existe — schema sin inicializar.");
  return toConfigPagos(data);
}

export async function updateConfigPagos(patch: Partial<ConfigPagos>, actualizadoPor: string): Promise<void> {
  const fields: Partial<ConfigPagosRow> = {
    actualizado_por: actualizadoPor,
    actualizado_en: new Date().toISOString(),
  };
  if (patch.montosInstructor) {
    const m = patch.montosInstructor;
    if (m.Junior) {
      fields.monto_instructor_primer_alumno_junior = m.Junior.primero;
      fields.monto_instructor_alumno_adicional_junior = m.Junior.adicional;
    }
    if (m.Senior) {
      fields.monto_instructor_primer_alumno_senior = m.Senior.primero;
      fields.monto_instructor_alumno_adicional_senior = m.Senior.adicional;
    }
    if (m.Master) {
      fields.monto_instructor_primer_alumno_master = m.Master.primero;
      fields.monto_instructor_alumno_adicional_master = m.Master.adicional;
    }
  }
  if (patch.tarifasInstructor) {
    fields.tarifa_instructor_junior = patch.tarifasInstructor.Junior;
    fields.tarifa_instructor_senior = patch.tarifasInstructor.Senior;
    fields.tarifa_instructor_master = patch.tarifasInstructor.Master;
  }
  if (patch.tarifasProfeGuia) {
    fields.tarifa_profe_guia_junior = patch.tarifasProfeGuia.Junior;
    fields.tarifa_profe_guia_senior = patch.tarifasProfeGuia.Senior;
    fields.tarifa_profe_guia_master = patch.tarifasProfeGuia.Master;
  }
  const { error } = await supabase.from("config_pagos").update(fields).eq("id", "default");
  if (error) rethrow("updateConfigPagos", error, "No se pudo actualizar la configuración.");
}

export async function getPreciosAlumnos(): Promise<PreciosAlumnos> {
  const { data, error } = await supabase.from("precios_alumnos").select("*").eq("id", "default").maybeSingle();
  if (error) rethrow("getPreciosAlumnos", error, "No se pudieron cargar los precios.");
  if (!data) throw new Error("precios_alumnos/default no existe.");
  return toPrecios(data);
}

export async function updatePreciosAlumnos(patch: Partial<PreciosAlumnos>, actualizadoPor: string): Promise<void> {
  const fields: Partial<PreciosAlumnosRow> = {
    actualizado_por: actualizadoPor,
    actualizado_en: new Date().toISOString(),
  };
  if (patch.Junior !== undefined) fields.precio_junior = patch.Junior;
  if (patch.Senior !== undefined) fields.precio_senior = patch.Senior;
  if (patch.Master !== undefined) fields.precio_master = patch.Master;
  if (patch.duracionJuniorClases !== undefined) fields.duracion_junior_clases = patch.duracionJuniorClases;
  if (patch.duracionSeniorClases !== undefined) fields.duracion_senior_clases = patch.duracionSeniorClases;
  if (patch.duracionMasterClases !== undefined) fields.duracion_master_clases = patch.duracionMasterClases;
  if (patch.inscripcionJunior !== undefined) fields.inscripcion_junior = patch.inscripcionJunior;
  if (patch.inscripcionSenior !== undefined) fields.inscripcion_senior = patch.inscripcionSenior;
  if (patch.inscripcionMaster !== undefined) fields.inscripcion_master = patch.inscripcionMaster;
  const { error } = await supabase.from("precios_alumnos").update(fields).eq("id", "default");
  if (error) rethrow("updatePreciosAlumnos", error, "No se pudieron actualizar los precios.");
}

// =====================================================================
// Pagos de alumnos
// =====================================================================

export async function registrarPagoAlumno(p: Omit<PagoAlumno, "id" | "registradoEn">): Promise<string> {
  const { data, error } = await supabase
    .from("pagos_alumnos")
    .insert(fromPagoAlumnoInput(p))
    .select("id")
    .single();
  if (error) rethrow("registrarPagoAlumno", error, "No se pudo registrar el pago.");
  return data!.id;
}

export async function getPagosPorAlumno(alumnoId: string): Promise<PagoAlumno[]> {
  const { data, error } = await supabase
    .from("pagos_alumnos")
    .select("*")
    .eq("alumno_id", alumnoId)
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });
  if (error) rethrow("getPagosPorAlumno", error, "No se pudieron cargar los pagos.");
  return (data ?? []).map(toPagoAlumno);
}

export async function getPagosDelMes(anio: number, mes: number, sucursal?: Sucursal): Promise<PagoAlumno[]> {
  let q = supabase.from("pagos_alumnos").select("*").eq("anio", anio).eq("mes", mes);
  if (sucursal) q = q.eq("sucursal", sucursal);
  const { data, error } = await q;
  if (error) rethrow("getPagosDelMes", error, "No se pudieron cargar los pagos del mes.");
  return (data ?? []).map(toPagoAlumno);
}

export async function updatePagoAlumno(
  id: string,
  patch: Partial<Omit<PagoAlumno, "id" | "registradoEn">>
): Promise<void> {
  const fields: Partial<PagoAlumnoRow> = {};
  if (patch.monto !== undefined) fields.monto = patch.monto;
  if (patch.fechaPago !== undefined) fields.fecha_pago = patch.fechaPago;
  if (patch.medioPago !== undefined) fields.medio_pago = patch.medioPago;
  if (patch.tipoPago !== undefined) fields.tipo_pago = patch.tipoPago;
  if (patch.comprobanteUrl !== undefined) fields.comprobante_url = patch.comprobanteUrl ?? null;
  if (patch.comprobanteNombre !== undefined) fields.comprobante_nombre = patch.comprobanteNombre ?? null;
  if (patch.observacion !== undefined) fields.observacion = patch.observacion ?? null;
  const { error } = await supabase.from("pagos_alumnos").update(fields).eq("id", id);
  if (error) rethrow("updatePagoAlumno", error, "No se pudo actualizar el pago.");
}

export async function deletePagoAlumno(id: string): Promise<void> {
  const { error } = await supabase.from("pagos_alumnos").delete().eq("id", id);
  if (error) rethrow("deletePagoAlumno", error, "No se pudo eliminar el pago.");
}

// =====================================================================
// Pagos realizados (a personal)
// =====================================================================

export async function marcarPagoRealizado(
  p: Omit<PagoRealizado, "id" | "pagadoEn">
): Promise<string> {
  const { data, error } = await supabase
    .from("pagos_realizados")
    .insert({
      tipo: p.tipo,
      persona_id: p.personaId,
      persona_nombre: p.personaNombre,
      sucursal: p.sucursal,
      mes: p.mes,
      anio: p.año,
      monto: p.monto,
      fecha_pago: p.fechaPago,
      pagado_por: p.pagadoPor,
    })
    .select("id")
    .single();
  if (error) rethrow("marcarPagoRealizado", error, "No se pudo marcar el pago como realizado.");
  return data!.id;
}

export async function getPagosRealizadosDelMes(
  anio: number,
  mes: number,
  sucursal?: Sucursal
): Promise<PagoRealizado[]> {
  let q = supabase.from("pagos_realizados").select("*").eq("anio", anio).eq("mes", mes);
  if (sucursal) q = q.eq("sucursal", sucursal);
  const { data, error } = await q;
  if (error) rethrow("getPagosRealizadosDelMes", error, "No se pudieron cargar los pagos realizados.");
  return (data ?? []).map(toPagoRealizado);
}

export async function deletePagoRealizado(id: string): Promise<void> {
  const { error } = await supabase.from("pagos_realizados").delete().eq("id", id);
  if (error) rethrow("deletePagoRealizado", error, "No se pudo eliminar el pago realizado.");
}

// =====================================================================
// Temario
// =====================================================================

function toTemario(t: TemarioRow, semanas: SemanaTemarioRow[]): TemarioCurso {
  return {
    curso: t.curso,
    fechaInicio: t.fecha_inicio,
    actualizadoPor: t.actualizado_por,
    actualizadoEn: t.actualizado_en,
    semanas: semanas
      .sort((a, b) => a.semana_numero - b.semana_numero)
      .map<TemaSemana>((s) => ({
        semanaNumero: s.semana_numero,
        titulo: s.titulo,
        descripcion: nz(s.descripcion),
        temaMartes: nz(s.tema_martes),
        temaMiercoles: nz(s.tema_miercoles),
        pdfMartesUrl: nz(s.pdf_martes_url),
        pdfMartesNombre: nz(s.pdf_martes_nombre),
        pdfMiercolesUrl: nz(s.pdf_miercoles_url),
        pdfMiercolesNombre: nz(s.pdf_miercoles_nombre),
      })),
  };
}

export async function getTemarioCurso(curso: Curso): Promise<TemarioCurso | null> {
  const [tempRes, semRes] = await Promise.all([
    supabase.from("temarios").select("*").eq("curso", curso).maybeSingle(),
    supabase.from("semanas_temario").select("*").eq("curso", curso),
  ]);
  if (tempRes.error) rethrow("getTemarioCurso", tempRes.error, "No se pudo cargar el temario.");
  if (!tempRes.data) return null;
  if (semRes.error) rethrow("getTemarioCurso semanas", semRes.error, "No se pudieron cargar las semanas del temario.");
  return toTemario(tempRes.data, semRes.data ?? []);
}

export async function upsertTemarioCurso(
  curso: Curso,
  fechaInicio: string,
  actualizadoPor: string
): Promise<void> {
  const { error } = await supabase.from("temarios").upsert(
    {
      curso,
      fecha_inicio: fechaInicio,
      actualizado_por: actualizadoPor,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "curso" }
  );
  if (error) rethrow("upsertTemarioCurso", error, "No se pudo guardar el temario.");
}

export async function upsertSemanaTemario(
  curso: Curso,
  semana: TemaSemana
): Promise<void> {
  const { error } = await supabase.from("semanas_temario").upsert(
    {
      curso,
      semana_numero: semana.semanaNumero,
      titulo: semana.titulo,
      descripcion: semana.descripcion ?? null,
      tema_martes: semana.temaMartes ?? null,
      tema_miercoles: semana.temaMiercoles ?? null,
      pdf_martes_url: semana.pdfMartesUrl ?? null,
      pdf_martes_nombre: semana.pdfMartesNombre ?? null,
      pdf_miercoles_url: semana.pdfMiercolesUrl ?? null,
      pdf_miercoles_nombre: semana.pdfMiercolesNombre ?? null,
    },
    { onConflict: "curso,semana_numero" }
  );
  if (error) rethrow("upsertSemanaTemario", error, "No se pudo guardar la semana.");
}

export async function deleteSemanaTemario(curso: Curso, semanaNumero: number): Promise<void> {
  const { error } = await supabase
    .from("semanas_temario")
    .delete()
    .eq("curso", curso)
    .eq("semana_numero", semanaNumero);
  if (error) rethrow("deleteSemanaTemario", error, "No se pudo eliminar la semana.");
}

// =====================================================================
// app_users — gestión de roles director/admin (migración 0009).
//
// Las MUTACIONES (create/delete/changeRole) van por la API route
// /api/admin/users porque requieren service_role para tocar auth.users.
// Acá sólo exponemos lectura + helpers para resolver el rol de un email.
// =====================================================================

function toAppUser(r: AppUserRow): AppUser {
  return {
    email: r.email,
    username: r.username,
    role: r.role,
    nombreCompleto: r.nombre_completo,
    creadoPor: r.creado_por,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .order("role", { ascending: true })
    .order("username", { ascending: true });
  if (error) rethrow("getAppUsers", error, "No se pudo cargar la lista de usuarios.");
  return ((data ?? []) as AppUserRow[]).map(toAppUser);
}

// Resuelve el rol de un email contra app_users. Devuelve null si no es
// staff (en cuyo caso el caller decide si tratar como instructor o
// negar acceso). Usado por useAuth para derivar el rol desde la BD en
// vez de hardcoded constants.
export async function getStaffRoleByEmail(email: string): Promise<StaffRole | null> {
  const normalized = email.toLowerCase();
  const { data, error } = await supabase
    .from("app_users")
    .select("role")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    console.warn("[supabase] getStaffRoleByEmail:", error);
    return null;
  }
  return (data?.role as StaffRole | undefined) ?? null;
}
