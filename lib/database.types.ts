// Tipos TypeScript que mapean uno-a-uno el schema Postgres de Supabase.
//
// Estos son los tipos "raw" que devuelve PostgREST — con snake_case y
// columnas tal como están en la BD. La capa de adaptación a camelCase
// (que es lo que el resto de la app usa) vive en lib/queries.ts.
//
// Si modificas el schema (migrations 0001-N), actualiza también este
// archivo. Idealmente correr `supabase gen types typescript --linked`
// para regenerarlo automáticamente, pero por ahora mantenemos manual
// para no obligar a `supabase login` en CI.

export type Sucursal = "Muermos" | "Puerto Montt" | "Osorno" | "Valdivia" | "Temuco";
export type Curso = "Junior" | "Senior" | "Master";
export type Horario = "Mañana" | "Tarde";
export type EstadoAsistencia = "Presente" | "Tarde" | "Ausente";
export type MedioPagoAlumno =
  | "Transferencia" | "Efectivo" | "Tarjeta de Débito" | "Tarjeta de Crédito" | "Otro";
export type TipoPagoAlumno =
  | "Total" | "Parcial - Primera cuota" | "Parcial - Segunda cuota" | "Parcial - Otro";
export type TipoPagoRealizado = "instructor" | "profeGuia";

// =====================================================================
// Filas tal como vienen de la BD (snake_case).
// =====================================================================

export interface InstructorRow {
  id: string;
  user_id: string | null;
  username: string;
  email: string;
  nombre_completo: string;
  telefono: string | null;
  sucursal_actual: Sucursal;
  activo?: boolean;
  fecha_ingreso: string;       // ISO date
  creado_por: string;
  auth_verificado: boolean;
  created_at: string;          // ISO datetime
  updated_at: string;
}

export interface ProfeGuiaRow {
  id: string;
  nombre: string;
  telefono: string | null;
  sucursal: Sucursal;
  activo?: boolean;
  fecha_ingreso: string;
  created_at: string;
  updated_at: string;
}

export interface AlumnoRow {
  id: string;
  nombre: string;
  telefono: string | null;
  sucursal: Sucursal;
  curso: Curso;
  horario: Horario;
  fecha: string;                // fecha de ingreso
  profe_guia_id: string | null;
  instructor_id: string | null;
  activo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface HistorialAsignacionRow {
  id: string;
  instructor_id: string;
  sucursal: Sucursal;
  fecha_inicio: string;
  fecha_fin: string | null;
  razon_cambio: string | null;
  cambiado_por: string;
  created_at: string;
}

export interface AsistenciaAlumnoRow {
  id: string;
  alumno_id: string;
  fecha: string;
  estado: EstadoAsistencia;
  observacion: string | null;
  registrada_por: string;
  sucursal: Sucursal;
  curso: Curso;
  turno: Horario;
  tarifa_instructor_aplicada: number | null;
  tarifa_profe_guia_aplicada: number | null;
  profe_guia_id_snapshot: string | null;
  instructor_id_snapshot: string | null;
  created_at: string;
}

export interface AsistenciaProfeGuiaRow {
  id: string;
  profe_guia_id: string;
  fecha: string;
  estado: EstadoAsistencia;
  observacion: string | null;
  registrada_por: string;
  sucursal: Sucursal;
  created_at: string;
}

export interface EvaluacionAlumnoRow {
  id: string;
  alumno_id: string;
  fecha: string;
  nota: number;
  observacion: string | null;
  evaluado_por: string;
  sucursal: Sucursal;
  curso: Curso;
  created_at: string;
}

export interface ConfigPagosRow {
  id: "default";
  monto_instructor_primer_alumno: number;
  monto_instructor_alumno_adicional: number;
  tarifa_instructor_junior: number;
  tarifa_instructor_senior: number;
  tarifa_instructor_master: number;
  tarifa_profe_guia_junior: number;
  tarifa_profe_guia_senior: number;
  tarifa_profe_guia_master: number;
  actualizado_por: string;
  actualizado_en: string;
  created_at: string;
  updated_at: string;
}

export interface PreciosAlumnosRow {
  id: "default";
  precio_junior: number;
  precio_senior: number;
  precio_master: number;
  duracion_junior_clases: number;
  duracion_senior_clases: number;
  duracion_master_clases: number;
  actualizado_por: string;
  actualizado_en: string;
  created_at: string;
  updated_at: string;
}

export interface PagoAlumnoRow {
  id: string;
  alumno_id: string;
  alumno_nombre: string;
  curso: Curso;
  sucursal: Sucursal;
  mes: number;
  anio: number;
  monto: number;
  fecha_pago: string;
  medio_pago: MedioPagoAlumno;
  tipo_pago: TipoPagoAlumno;
  comprobante_url: string | null;
  comprobante_nombre: string | null;
  observacion: string | null;
  registrado_por: string;
  registrado_en: string;
  created_at: string;
  updated_at: string;
}

export interface PagoRealizadoRow {
  id: string;
  tipo: TipoPagoRealizado;
  persona_id: string;
  persona_nombre: string;
  sucursal: Sucursal;
  mes: number;
  anio: number;
  monto: number;
  fecha_pago: string;
  pagado_por: string;
  pagado_en: string;
  created_at: string;
  updated_at: string;
}

export interface TemarioRow {
  curso: Curso;
  fecha_inicio: string;
  actualizado_por: string;
  actualizado_en: string;
  created_at: string;
  updated_at: string;
}

export interface SemanaTemarioRow {
  id: string;
  curso: Curso;
  semana_numero: number;
  titulo: string;
  descripcion: string | null;
  tema_martes: string | null;
  tema_miercoles: string | null;
  pdf_martes_url: string | null;
  pdf_martes_nombre: string | null;
  pdf_miercoles_url: string | null;
  pdf_miercoles_nombre: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// Tipos "domain" en camelCase — los que usa el resto de la app y los
// componentes UI. lib/queries.ts hace el adapter snake↔camel.
//
// Estos son COMPATIBLES con los tipos viejos de lib/types.ts (mismos
// nombres de campos) para minimizar el blast radius en componentes.
// =====================================================================

export interface Instructor {
  id: string;
  userId: string | null;
  username: string;
  email: string;
  nombreCompleto: string;
  telefono?: string;
  sucursalActual: Sucursal;
  activo?: boolean;
  fechaIngreso: string;
  fechaCreacion: string;
  creadoPor: string;
  authVerificado: boolean;
}

export interface ProfeGuia {
  id: string;
  nombre: string;
  telefono?: string;
  sucursal: Sucursal;
  activo?: boolean;
  fechaIngreso: string;
}

export interface Alumno {
  id: string;
  nombre: string;
  telefono?: string;
  sucursal: Sucursal;
  curso: Curso;
  horario: Horario;
  fecha: string;
  profeGuiaId?: string;
  instructorId?: string;
  activo?: boolean;
}

export interface HistorialAsignacion {
  id: string;
  instructorId: string;
  sucursal: Sucursal;
  fechaInicio: string;
  fechaFin: string | null;
  razonCambio?: string;
  cambiadoPor: string;
}

export interface AsistenciaAlumno {
  id: string;
  alumnoId: string;
  fecha: string;
  estado: EstadoAsistencia;
  observacion?: string;
  registradaPor: string;
  sucursal: Sucursal;
  curso: Curso;
  turno: Horario;
  tarifaInstructorAplicada?: number;
  tarifaProfeGuiaAplicada?: number;
  profeGuiaIdSnapshot?: string;
  instructorIdSnapshot?: string;
}

export interface AsistenciaProfeGuia {
  id: string;
  profeGuiaId: string;
  fecha: string;
  estado: EstadoAsistencia;
  observacion?: string;
  registradaPor: string;
  sucursal: Sucursal;
}

export interface EvaluacionAlumno {
  id: string;
  alumnoId: string;
  fecha: string;
  nota: number;
  observacion?: string;
  evaluadoPor: string;
  sucursal: Sucursal;
  curso: Curso;
}

export interface TarifasPorCurso {
  Junior: number;
  Senior: number;
  Master: number;
}

export interface ConfigPagos {
  id: "default";
  montoInstructorPrimerAlumno: number;
  montoInstructorAlumnoAdicional: number;
  tarifasInstructor: TarifasPorCurso;
  tarifasProfeGuia: TarifasPorCurso;
  actualizadoPor: string;
  actualizadoEn: string;
}

export interface PreciosAlumnos {
  id: "default";
  Junior: number;
  Senior: number;
  Master: number;
  duracionJuniorClases: number;
  duracionSeniorClases: number;
  duracionMasterClases: number;
  actualizadoPor: string;
  actualizadoEn: string;
}

export interface PagoAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  curso: Curso;
  sucursal: Sucursal;
  mes: number;
  año: number;
  monto: number;
  fechaPago: string;
  medioPago: MedioPagoAlumno;
  tipoPago: TipoPagoAlumno;
  comprobanteUrl?: string;
  comprobanteNombre?: string;
  observacion?: string;
  registradoPor: string;
  registradoEn: string;
}

export interface PagoRealizado {
  id: string;
  tipo: TipoPagoRealizado;
  personaId: string;
  personaNombre: string;
  sucursal: Sucursal;
  mes: number;
  año: number;
  monto: number;
  fechaPago: string;
  pagadoPor: string;
  pagadoEn: string;
}

export interface TemaSemana {
  semanaNumero: number;
  titulo: string;
  descripcion?: string;
  temaMartes?: string;
  temaMiercoles?: string;
  pdfMartesUrl?: string;
  pdfMartesNombre?: string;
  pdfMiercolesUrl?: string;
  pdfMiercolesNombre?: string;
}

export interface TemarioCurso {
  curso: Curso;
  semanas: TemaSemana[];
  fechaInicio: string;
  actualizadoPor: string;
  actualizadoEn: string;
}

// Re-export para compatibilidad con código existente que importa de "@/lib/types"
export {
  CURSOS,
  TURNOS,
  SUCURSALES,
  INTERNAL_DOMAIN,
  DIRECTORES,
  ADMINS,
  DURACION_DEFAULT_CLASES,
  TIPOS_PAGO_ALUMNO,
  usernameToEmail,
  emailToUsername,
  determineRole,
} from "./types";
export type { Turno, UserRole, CursoConfig, SemanaTemario, Profesor, AcademiaData, PagoCalculado } from "./types";
