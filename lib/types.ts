// Tipos principales de OperoEducator

export type Sucursal = 'Puerto Montt' | 'Osorno' | 'Valdivia' | 'Temuco';
export type Curso = 'Junior' | 'Senior' | 'Master';
export type Horario = 'Mañana' | 'Tarde';
// Alias semántico: en las pantallas de aula usamos "turno" como sinónimo de horario.
export type Turno = Horario;
export type EstadoAsistencia = 'Presente' | 'Tarde' | 'Ausente';
export type UserRole = 'director' | 'admin' | 'instructor';

export const CURSOS: Curso[] = ['Junior', 'Senior', 'Master'];
export const TURNOS: Turno[] = ['Mañana', 'Tarde'];

// Medio de pago de la mensualidad del alumno. Se denormaliza en PagoAlumno
// para conciliación bancaria sin tener que mirar el comprobante.
export type MedioPagoAlumno =
  | 'Transferencia'
  | 'Efectivo'
  | 'Tarjeta de Débito'
  | 'Tarjeta de Crédito'
  | 'Otro';

// Tipo de pago de la mensualidad. "Total" cubre el precio del curso completo.
// Las variantes "Parcial - ..." indican abono incompleto y permiten saldo
// pendiente en la pantalla de pagos.
export type TipoPagoAlumno =
  | 'Total'
  | 'Parcial - Primera cuota'
  | 'Parcial - Segunda cuota'
  | 'Parcial - Otro';

export const TIPOS_PAGO_ALUMNO: TipoPagoAlumno[] = [
  'Total',
  'Parcial - Primera cuota',
  'Parcial - Segunda cuota',
  'Parcial - Otro',
];

export interface Alumno {
  // Firestore doc ID. Antes era number (Date.now()) en la v1 mock;
  // al migrar a Firestore usamos el doc id como string.
  id: string;
  nombre: string;
  telefono?: string;
  sucursal: Sucursal;
  curso: Curso;
  horario: Horario;
  fecha: string;
  // Asignación a UNO de los dos roles operativos. Mutuamente excluyentes:
  // un alumno está acompañado por un instructor O por un profe guía, nunca
  // por ambos al mismo tiempo. Los helpers asignarInstructorAAlumno /
  // asignarProfeGuiaAAlumno mantienen la invariante limpiando el contrario.
  profeGuiaId?: string;
  instructorId?: string;
  // Soft delete: false = oculto en la operación pero conserva pagos/asistencias.
  // Default true. Datos legacy sin el campo se asumen activos.
  activo?: boolean;
  // El estado de pago del mes vigente NO vive aquí: se calcula on-demand
  // contra la colección "pagosAlumnos" (ver useEstadoMorosidad).
}

// Profe guía: persona que personaliza la clase de 3-5 alumnos.
// NO entra al sistema — solo existe como registro que el admin/instructor gestionan.
// Su pago se calcula por alumno asistido usando ConfigPagos.tarifasProfeGuia.
export interface ProfeGuia {
  id: string;
  nombre: string;
  telefono?: string;
  sucursal: Sucursal;
  activo?: boolean;
  fechaIngreso: string;
}

// Registro de asistencia diaria de un profe guía.
// Lo crea un instructor — `registradaPor` = su username.
// Vive en la colección raíz "asistenciasProfesGuias".
export interface AsistenciaProfeGuia {
  id: string;
  profeGuiaId: string;
  fecha: string;             // ISO date YYYY-MM-DD
  estado: EstadoAsistencia;
  observacion?: string;
  registradaPor: string;     // username del instructor
  sucursal: Sucursal;
}

// Asistencia diaria de un alumno (colección "asistenciasAlumnos").
// Una fila por (alumno, fecha). Se crea desde el aula virtual del instructor.
export interface AsistenciaAlumno {
  id: string;
  alumnoId: string;
  fecha: string;             // ISO date YYYY-MM-DD
  estado: EstadoAsistencia;
  observacion?: string;
  registradaPor: string;     // username del instructor
  sucursal: Sucursal;
  curso: Curso;
  turno: Turno;
  // Snapshots tomados al momento de registrar la asistencia. Preservan la
  // verdad histórica para que el cálculo de pagos no se vea afectado por
  // cambios posteriores en ConfigPagos o en el profeGuiaId/instructorId del
  // alumno. Datos legacy (anteriores a v2) NO los tienen — fallback en cálculos.
  tarifaInstructorAplicada?: number;   // CLP por alumno asistido (instructor) — modelo legacy
  tarifaProfeGuiaAplicada?: number;    // CLP por alumno asistido (profe guía)
  profeGuiaIdSnapshot?: string;        // profeGuiaId del alumno en ese instante
  // Snapshot del instructorId del alumno al momento de la asistencia. Lo usa
  // el cálculo NUEVO de pagos por alumno (escala 1er + adicional). Si está
  // vacío, el alumno no estaba asignado a ningún instructor en ese instante.
  instructorIdSnapshot?: string;
}

// Evaluación diaria de un alumno (colección "evaluacionesAlumnos").
// Una fila por (alumno, fecha). Nota 1-10.
export interface EvaluacionAlumno {
  id: string;
  alumnoId: string;
  fecha: string;             // ISO date YYYY-MM-DD
  nota: number;              // 1-10
  observacion?: string;
  evaluadoPor: string;       // username del instructor
  sucursal: Sucursal;
  curso: Curso;
}

export interface Profesor {
  id: string;
  nombre: string;
}

// Instructor: usuario operativo con UNA sucursal asignada por el Director.
// El instructor NO puede cambiar su sucursal; solo el Director vía reasignación.
// Cada cambio queda registrado en historialAsignaciones.
export interface Instructor {
  id: string;                  // doc ID en Firestore
  // Supabase: enlace con auth.users (UUID). null si todavía no se creó
  // la cuenta de auth (el director marca authVerificado=true cuando ya
  // existe el row en auth.users).
  userId?: string | null;
  username: string;            // ej: "instructor.gregory"
  email: string;               // ej: "instructor.gregory@operoeducator.internal"
  nombreCompleto: string;      // ej: "Gregory Delgado"
  telefono?: string;
  sucursalActual: Sucursal;
  activo?: boolean;
  fechaIngreso: string;        // ISO date
  fechaCreacion: string;       // ISO datetime - cuándo se creó el perfil
  creadoPor: string;           // username del director que lo creó
  // Marca manual del director: "ya creé la cuenta de Firebase Auth para este
  // instructor". Default false al crear el perfil. No verificable client-side
  // sin Cloud Functions, por eso es check manual.
  authVerificado?: boolean;
}

// Bitácora de asignaciones de sucursal por instructor.
// fechaFin === null indica la asignación activa actual (única por instructor).
export interface HistorialAsignacion {
  id: string;                  // doc ID
  instructorId: string;        // referencia al Instructor
  sucursal: Sucursal;
  fechaInicio: string;         // ISO date
  fechaFin: string | null;     // null = asignación activa actual
  razonCambio?: string;        // opcional, por qué se reasignó
  cambiadoPor: string;         // username del director que hizo el cambio
}

export interface SemanaTemario {
  titulo: string;
  martes: string;
  miercoles: string;
}

// Temario v2 (colección "temarios"): doc id = curso (Junior/Senior/Master).
// El director lo carga; el instructor lo lee para calcular qué tema toca hoy.
// Las clases son siempre martes y miércoles, y la "semana 1" arranca en el
// primer martes definido por `fechaInicio`.
export interface TemaSemana {
  semanaNumero: number;        // 1, 2, 3, ...
  titulo: string;              // ej: "Cortes básicos"
  descripcion?: string;
  temaMartes?: string;
  temaMiercoles?: string;
  // PDF de la clase del día. URL pública de Firebase Storage + nombre original
  // del archivo. Se cargan desde /temario y se muestran en /aulas.
  pdfMartesUrl?: string;
  pdfMartesNombre?: string;
  pdfMiercolesUrl?: string;
  pdfMiercolesNombre?: string;
}

export interface TemarioCurso {
  id: string;                  // doc id = curso (Junior/Senior/Master)
  curso: Curso;
  semanas: TemaSemana[];
  fechaInicio: string;         // ISO date del primer martes del curso
  actualizadoPor: string;      // username del director
  actualizadoEn: string;       // ISO datetime
}

export interface CursoConfig {
  fechaInicio: string;
  precio: string | number;
}

// ============================================================
// PAGOS — Fase D
// ============================================================

// Tarifa por alumno asistido (Presente o Tarde) en cada curso.
// Misma forma para instructores y profes guías; solo cambia la magnitud.
export interface TarifasPorCurso {
  Junior: number;   // CLP por alumno asistido
  Senior: number;
  Master: number;
}

// Singleton: doc id "default" en colección "configPagos".
// Solo el director puede escribir; lectura para autenticados.
export interface ConfigPagos {
  id: "default";
  // Modelo NUEVO: el instructor cobra por alumno asistido en el día, escalado.
  // - Por el 1er alumno asistido en una clase: gana montoInstructorPrimerAlumno.
  // - Por cada alumno adicional (2°, 3°, …): gana montoInstructorAlumnoAdicional.
  // Pago del día = primer + (asistidos − 1) × adicional.
  montoInstructorPrimerAlumno: number;
  montoInstructorAlumnoAdicional: number;
  // Modelo LEGACY: tarifa fija por curso para instructores. Se mantiene en
  // Firestore por compatibilidad con asistencias snapshoteadas, pero NO se
  // usa en el cálculo nuevo. Sirve también de fallback para asistencias
  // legacy sin instructorIdSnapshot.
  tarifasInstructor: TarifasPorCurso;
  // Profes guías: el modelo SIGUE siendo tarifa por curso (no migra).
  tarifasProfeGuia: TarifasPorCurso;
  actualizadoPor: string;     // username del director
  actualizadoEn: string;      // ISO datetime
}

// Resultado calculado on-demand a partir de asistencias + config.
// NO se persiste — se recalcula cada vez que se renderiza la pantalla.
export interface PagoCalculado {
  personaId: string;          // instructorId o profeGuiaId
  personaNombre: string;
  tipo: "instructor" | "profeGuia";
  sucursal: Sucursal;
  mes: number;                 // 1-12
  año: number;
  detallePorCurso: {
    Junior: { alumnosAsistidos: number; tarifa: number; subtotal: number };
    Senior: { alumnosAsistidos: number; tarifa: number; subtotal: number };
    Master: { alumnosAsistidos: number; tarifa: number; subtotal: number };
  };
  totalCLP: number;
  diasTrabajados: number;
  alumnosAsistidos: number;    // total atendidos en el mes (suma cursos)
  // Lista de días únicos en los que esta persona registró asistencias.
  // Útil para la UI de "mi-pago" y el modal de detalle por persona.
  diasDetalle: { fecha: string; alumnos: number }[];
  // Desglose granular por día con la fórmula del modelo NUEVO de instructores
  // (1er alumno + N-1 adicionales). Para profes guías se llena igual pero el
  // monto del día es la suma de tarifas por curso. Permite que la UI muestre
  // la tabla "Fecha | Alumnos | Cálculo | Total".
  desgloseDias?: {
    fecha: string;
    alumnos: number;
    montoPrimero: number;
    montoAdicional: number;
    total: number;
  }[];
}

// ============================================================
// PRECIOS Y PAGOS DE ALUMNOS
// ============================================================

// Singleton: doc id "default" en colección "preciosAlumnos".
// El director define un precio por curso y todos los pagos del mes
// se autocompletan a partir de esto.
// v4: además de precios, guarda duración de cada curso en cantidad de clases.
// Usado para calcular la fecha de término por alumno (fechaIngreso + ⌈clases/2⌉
// semanas, asumiendo 2 clases por semana — martes y miércoles).
export interface PreciosAlumnos {
  id: "default";
  Junior: number;
  Senior: number;
  Master: number;
  // Duración en clases (no en semanas) — opcional para datos legacy
  // anteriores a v4. Defaults aplicados en lectura: 8 / 16 / 8.
  duracionJuniorClases?: number;
  duracionSeniorClases?: number;
  duracionMasterClases?: number;
  // Inscripción por curso (migración 0007). Se cobra cuando el alumno NO
  // paga el curso completo de una vez (paga la inscripción para apartar
  // el cupo y completa después con la mensualidad).
  inscripcionJunior?: number;
  inscripcionSenior?: number;
  inscripcionMaster?: number;
  actualizadoPor: string;     // username de quien actualizó
  actualizadoEn: string;      // ISO datetime
}

// Defaults v4: duración estándar por curso si el director aún no la configuró.
export const DURACION_DEFAULT_CLASES: Record<Curso, number> = {
  Junior: 8,
  Senior: 16,
  Master: 8,
};

// Pago mensual de un alumno (colección "pagosAlumnos").
// La v3 permite VARIOS pagos por (alumnoId, año, mes) cuando alguno es
// parcial. La capa CRUD ya no impone unicidad estricta; el modal sí valida
// que no se dupliquen pagos "Total".
// Los campos `alumnoNombre`, `curso` y `sucursal` están denormalizados para
// que la pantalla de pagos pueda filtrar/ordenar sin un join.
export interface PagoAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  curso: Curso;
  sucursal: Sucursal;
  mes: number;                // 1-12
  año: number;
  monto: number;              // CLP
  fechaPago: string;          // ISO date YYYY-MM-DD
  medioPago: MedioPagoAlumno;
  // Tipo de pago. Default "Total" en datos legacy. Permite distinguir un
  // abono parcial (cuota) del pago completo del mes.
  tipoPago?: TipoPagoAlumno;
  // True si este pago incluye la inscripción del curso (migración 0007).
  pagaInscripcion?: boolean;
  comprobanteUrl?: string;    // URL pública de Firebase Storage (opcional)
  comprobanteNombre?: string; // Nombre original del archivo
  observacion?: string;
  registradoPor: string;      // username de quien registró
  registradoEn: string;       // ISO datetime
}

// Pagos a personal (instructor/profeGuía) ya ejecutados.
// Colección "pagosRealizados". Se crea cuando el director/admin marca a una
// persona como "Pagado" desde la pantalla /pagos. Único por
// (tipo, personaId, mes, año) — la unicidad se valida client-side.
export interface PagoRealizado {
  id: string;
  tipo: "instructor" | "profeGuia";
  personaId: string;
  personaNombre: string;       // denormalizado para listados sin join
  sucursal: Sucursal;          // denormalizado
  mes: number;                 // 1-12
  año: number;
  monto: number;               // CLP — se snapshotea al marcar
  fechaPago: string;           // ISO date (cliente)
  pagadoPor: string;           // username
  pagadoEn: string;            // ISO datetime (server)
}

export interface AcademiaData {
  alumnos: Alumno[];
  planes: {
    Junior: SemanaTemario[];
    Senior: SemanaTemario[];
    Master: SemanaTemario[];
  };
  profesores: Profesor[];
  cursoConfig: {
    Junior: CursoConfig;
    Senior: CursoConfig;
    Master: CursoConfig;
  };
}

export const SUCURSALES: Sucursal[] = ['Puerto Montt', 'Osorno', 'Valdivia', 'Temuco'];

// Dominio interno "fake" usado para construir emails a partir de usernames.
// Los instructores solo ven/escriben el username; el backend de Firebase
// Auth sigue recibiendo un email válido (username + INTERNAL_DOMAIN).
export const INTERNAL_DOMAIN = "@operoeducator.internal";

// Usernames con rol director/admin — FALLBACK DE BOOTSTRAP únicamente.
//
// A partir de la migración 0009, la fuente de verdad de los roles
// director/admin es la tabla `app_users` en Postgres. La UI de gestión
// vive en /admin/usuarios. Estas constantes se mantienen para dos
// casos puntuales:
//
//   1. Si por alguna razón la tabla queda vacía o no responde, el
//      director original puede entrar igual y restaurar el estado.
//   2. Algunos componentes históricos llamaban a determineRole() de
//      forma sincrónica (sin esperar a la BD). Esos sitios reciben
//      como respuesta el rol determinado por estas constantes.
//      determineRoleFromAppUsers() (que sí consulta la BD) es la API
//      preferida — ver hooks/useAuth.ts.
//
// Si vas a entregar este código a otro equipo: NO agregues nuevos
// directores/admins acá. Hazlo desde /admin/usuarios.
export const DIRECTORES: string[] = ["director.christan", "director.maria"];
export const ADMINS: string[] = ["admin.finanzas"];

// Roles gestionables desde /admin/usuarios. Sólo director y admin se
// almacenan en app_users; los instructores viven en su propia tabla.
export type StaffRole = 'director' | 'admin';
export const STAFF_ROLES: StaffRole[] = ['director', 'admin'];

export interface AppUser {
  email: string;          // PK, lowercase
  username: string;
  role: StaffRole;
  nombreCompleto: string;
  creadoPor: string;
  createdAt: string;       // ISO datetime
  updatedAt: string;
}

export function usernameToEmail(username: string): string {
  return username.includes("@") ? username : `${username}${INTERNAL_DOMAIN}`;
}

export function emailToUsername(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

export function determineRole(email: string): UserRole {
  const username = emailToUsername(email).toLowerCase();
  if (DIRECTORES.map((u) => u.toLowerCase()).includes(username)) return "director";
  if (ADMINS.map((u) => u.toLowerCase()).includes(username)) return "admin";
  return "instructor";
}
