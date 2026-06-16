"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import CertificacionesBanner from "@/components/dashboard/CertificacionesBanner";
import { useAuth } from "@/hooks/useAuth";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useProfesGuias } from "@/hooks/useProfesGuias";
import { useAsistenciasAlumnos } from "@/hooks/useAsistenciasAlumnos";
import { useAsistenciasProfes } from "@/hooks/useAsistenciasProfes";
import { useConfigPagos } from "@/hooks/useConfigPagos";
import { useEvaluaciones } from "@/hooks/useEvaluaciones";
import { useTemario } from "@/hooks/useTemario";
import {
  Alumno,
  AsistenciaAlumno,
  AsistenciaProfeGuia,
  Curso,
  CURSOS,
  EstadoAsistencia,
  EvaluacionAlumno,
  ProfeGuia,
  Turno,
  TURNOS,
  emailToUsername,
} from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  registrarAsistenciasAlumnosBatch,
  registrarEvaluacion,
  updateEvaluacion,
} from "@/lib/firestore";

type Subtab = "asistencia" | "evaluacion" | "profes";

// Heurística: antes de las 14:00 (zona local del navegador) ⇒ "Mañana".
function turnoSegunHora(): Turno {
  return new Date().getHours() < 14 ? "Mañana" : "Tarde";
}

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

// Avanza desde `desde` hasta el próximo martes o miércoles (incluyente del
// día siguiente). Solo se llama cuando hoy NO es día de clase.
function proximaClaseDesde(desde: Date): Date {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(desde);
    d.setDate(desde.getDate() + i);
    const dow = d.getDay();
    if (dow === 2 || dow === 3) return d;
  }
  // Fallback teórico (nunca debería ocurrir): regresa el siguiente lunes+1.
  const d = new Date(desde);
  d.setDate(desde.getDate() + 1);
  return d;
}

const ESTADO_LABEL: Record<EstadoAsistencia, string> = {
  Presente: "Presente",
  Ausente: "Ausente",
  Tarde: "Tarde",
};

const ESTADO_BADGE: Record<EstadoAsistencia, string> = {
  Presente: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Ausente: "bg-rose-100 text-rose-700 border-rose-200",
  Tarde: "bg-amber-100 text-amber-700 border-amber-200",
};

// Mensaje único cuando un registro pertenece a un día anterior. La regla:
// el instructor solo puede editar lo del día en curso. Un registro pasado
// queda como "auditoría" — solo el director (vía Firestore Console) puede
// modificarlo.
const EDIT_LOCKED_TOOLTIP =
  "Solo se puede editar en el día. Contacta al director.";

export default function AulaVirtualPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const { perfil, isLoading: perfilLoading } = useMiPerfil();
  const toast = useToast();
  const { config: configPagos } = useConfigPagos();

  // Guard: solo instructores logueados con perfil activo.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (userRole !== "instructor") {
      router.replace("/dashboard");
    }
  }, [user, userRole, authLoading, router]);

  const sucursal = perfil?.activo ? perfil.sucursalActual : null;
  const username = useMemo(
    () => (userEmail ? emailToUsername(userEmail) : ""),
    [userEmail]
  );

  // Estado de UI: turno, curso, sub-tab.
  const [turno, setTurno] = useState<Turno>(turnoSegunHora());
  const [curso, setCurso] = useState<Curso>("Junior");
  const [subtab, setSubtab] = useState<Subtab>("asistencia");
  const fecha = todayISODate();

  // Datos base.
  const { alumnos } = useAlumnos(sucursal);
  const { profesGuias } = useProfesGuias(sucursal);
  const { asistencias, registrar: registrarAsistencia, actualizar: actualizarAsistencia } =
    useAsistenciasAlumnos(sucursal, fecha);
  const {
    asistencias: asistenciasProfes,
    registrar: registrarAsistProfe,
    actualizar: actualizarAsistProfe,
  } = useAsistenciasProfes(sucursal, fecha);
  const { temario, semanaActual } = useTemario(curso);

  // Alumnos filtrados por curso + turno (la sucursal ya viene filtrada por useAlumnos).
  const alumnosFiltrados = useMemo(
    () =>
      alumnos
        .filter((a) => a.activo !== false && a.curso === curso && a.horario === turno)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [alumnos, curso, turno]
  );

  // Cursos visibles: solo aquellos donde el instructor tenga al menos un alumno
  // activo en su sucursal. Mantenemos el orden canónico Junior → Senior → Master.
  const cursosActivos = useMemo<Curso[]>(() => {
    const set = new Set<Curso>();
    for (const a of alumnos) if (a.activo !== false) set.add(a.curso);
    return CURSOS.filter((c) => set.has(c));
  }, [alumnos]);

  // Turnos visibles: solo los que tengan alumnos activos en el CURSO seleccionado.
  // Si el instructor no tiene alumnos en mañana en Senior, no le mostramos Mañana
  // cuando esté en la pestaña Senior — evita confusión.
  const turnosActivos = useMemo<Turno[]>(() => {
    const set = new Set<Turno>();
    for (const a of alumnos) if (a.activo !== false && a.curso === curso) set.add(a.horario);
    return TURNOS.filter((t) => set.has(t));
  }, [alumnos, curso]);

  // Si el curso seleccionado deja de tener alumnos (o el instructor cambió de
  // sucursal), auto-saltamos al primero disponible para no quedarnos en una
  // pestaña vacía. Idem para turno.
  useEffect(() => {
    if (cursosActivos.length === 0) return;
    if (!cursosActivos.includes(curso)) setCurso(cursosActivos[0]);
  }, [cursosActivos, curso]);
  useEffect(() => {
    if (turnosActivos.length === 0) return;
    if (!turnosActivos.includes(turno)) setTurno(turnosActivos[0]);
  }, [turnosActivos, turno]);

  const profesActivos = useMemo(
    () =>
      profesGuias
        .filter((p) => p.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profesGuias]
  );

  // Mapa alumnoId → asistencia de hoy (para mostrar estado actual rápido).
  const asistenciaPorAlumno = useMemo(() => {
    const map = new Map<string, AsistenciaAlumno>();
    for (const a of asistencias) map.set(a.alumnoId, a);
    return map;
  }, [asistencias]);

  const asistenciaPorProfe = useMemo(() => {
    const map = new Map<string, AsistenciaProfeGuia>();
    for (const a of asistenciasProfes) map.set(a.profeGuiaId, a);
    return map;
  }, [asistenciasProfes]);

  // Cálculo del tema de hoy: solo aplica martes/miércoles.
  const dow = new Date().getDay(); // 0=dom, 2=mar, 3=mié
  const esDiaDeClase = dow === 2 || dow === 3;
  const proximaClaseStr = useMemo(() => {
    if (esDiaDeClase) return "";
    const next = proximaClaseDesde(new Date());
    const dia = next.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return dia;
  }, [esDiaDeClase]);
  const temaHoy = useMemo(() => {
    if (!semanaActual) return null;
    if (dow === 2) return semanaActual.temaMartes ?? "";
    if (dow === 3) return semanaActual.temaMiercoles ?? "";
    return null;
  }, [semanaActual, dow]);

  // PDF del día (si existe). Solo aplica martes/miércoles.
  const pdfHoy = useMemo<{ url: string; nombre?: string } | null>(() => {
    if (!semanaActual) return null;
    if (dow === 2 && semanaActual.pdfMartesUrl)
      return {
        url: semanaActual.pdfMartesUrl,
        nombre: semanaActual.pdfMartesNombre,
      };
    if (dow === 3 && semanaActual.pdfMiercolesUrl)
      return {
        url: semanaActual.pdfMiercolesUrl,
        nombre: semanaActual.pdfMiercolesNombre,
      };
    return null;
  }, [semanaActual, dow]);

  // Loading / guard.
  if (authLoading || perfilLoading || !user || userRole !== "instructor") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Card className="text-center">
            <div className="py-8 space-y-3">
              <h2 className="text-xl font-light text-slate-900">
                Tu perfil de instructor aún no está configurado
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Contacta al Director para que te asigne una sucursal.
              </p>
              <Link href="/dashboard">
                <Button variant="outline">← Volver al panel</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!perfil.activo) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Card className="text-center">
            <div className="py-8 space-y-3">
              <h2 className="text-xl font-light text-slate-900">
                Tu cuenta está desactivada
              </h2>
              <Link href="/dashboard">
                <Button variant="outline">← Volver al panel</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Aula Virtual
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              {perfil.nombreCompleto} · Sucursal{" "}
              <b className="text-slate-700">{perfil.sucursalActual}</b> ·{" "}
              {new Date().toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        {/* Banner de alumnos certificándose — útil para que el instructor
            sepa que hoy se cumple el curso de algún alumno suyo. */}
        <CertificacionesBanner
          sucursal={perfil.sucursalActual}
          mostrarBotonPagos={false}
        />

        {/* Tema de hoy */}
        <Card className="bg-slate-900 text-white border-none shadow-2xl shadow-slate-900/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                Tema de hoy — {curso}
              </p>
              {!temario || !semanaActual ? (
                <p className="text-sm text-slate-300">
                  El curso {curso} no ha iniciado o no tiene temario cargado.
                </p>
              ) : dow !== 2 && dow !== 3 ? (
                <div>
                  <p className="text-sm text-slate-200">
                    Hoy no hay clase ({curso}). Semana {semanaActual.semanaNumero}:{" "}
                    <b>{semanaActual.titulo}</b>
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base md:text-lg font-light leading-snug">
                    Semana {semanaActual.semanaNumero} —{" "}
                    <b>{semanaActual.titulo}</b>
                  </p>
                  <p className="text-sm text-slate-300 mt-1">
                    {temaHoy && temaHoy.trim().length > 0
                      ? temaHoy
                      : `Sin tema definido para el ${dow === 2 ? "martes" : "miércoles"}.`}
                  </p>
                  {pdfHoy && (
                    <a
                      href={pdfHoy.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all"
                    >
                      📄 Ver material de la clase
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Selector turno: solo turnos con alumnos activos en el curso
                  seleccionado. Si solo hay uno, se ve como chip único; si no
                  hay ninguno (instructor sin alumnos), no se muestra. */}
              {turnosActivos.length > 0 && (
                <div className="bg-slate-800 rounded-2xl p-1 flex">
                  {turnosActivos.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTurno(t)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                        turno === t
                          ? "bg-white text-slate-900"
                          : "text-slate-300 hover:text-white"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Selector curso: solo cursos donde el instructor tiene alumnos
            activos en su sucursal. Si no tiene ninguno, muestra el aviso
            vacío más abajo. */}
        {cursosActivos.length > 0 ? (
          <Card className="!p-4">
            <div className="flex gap-2 overflow-x-auto hide-scroll">
              {cursosActivos.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurso(c)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    curso === c
                      ? "bg-slate-900 text-white shadow-lg"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="!p-6 text-center">
            <p className="text-sm text-slate-600">
              No tienes alumnos activos asignados en <b>{perfil.sucursalActual}</b>.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Pídele al director que te asigne alumnos o asígnalos tú desde el
              panel de instructor.
            </p>
          </Card>
        )}

        {/* Banner informativo: día de clase vs no clase. Vive arriba de los
            sub-tabs para que el instructor lo vea siempre. */}
        <div
          className={`px-4 py-3 rounded-2xl border text-sm ${
            esDiaDeClase
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          {esDiaDeClase ? (
            <span>
              📅 Hoy es <b>{dow === 2 ? "martes" : "miércoles"}</b> · Día de
              clase. Puedes registrar asistencia.
            </span>
          ) : (
            <span>
              📅 Hoy no hay clases. Las clases son los <b>martes</b> y{" "}
              <b>miércoles</b>. Próxima clase:{" "}
              <b className="capitalize">{proximaClaseStr}</b>.
            </span>
          )}
        </div>

        {/* Sub-tabs */}
        <Card className="!p-4">
          <div className="flex gap-2 overflow-x-auto hide-scroll">
            <SubtabBtn
              active={subtab === "asistencia"}
              onClick={() => setSubtab("asistencia")}
              label="Asistencia Alumnos"
              count={alumnosFiltrados.length}
            />
            <SubtabBtn
              active={subtab === "evaluacion"}
              onClick={() => setSubtab("evaluacion")}
              label="Evaluación"
              count={alumnosFiltrados.length}
            />
            <SubtabBtn
              active={subtab === "profes"}
              onClick={() => setSubtab("profes")}
              label="Profes Guías"
              count={profesActivos.length}
            />
          </div>
        </Card>

        {/* Contenido */}
        {subtab === "asistencia" && (
          <AsistenciaTab
            alumnos={alumnosFiltrados}
            profesGuias={profesGuias}
            asistenciaPorAlumno={asistenciaPorAlumno}
            curso={curso}
            turno={turno}
            sucursal={perfil.sucursalActual}
            fecha={fecha}
            username={username}
            tarifasInstructor={configPagos?.tarifasInstructor}
            tarifasProfeGuia={configPagos?.tarifasProfeGuia}
            esDiaDeClase={esDiaDeClase}
            onRegistrar={async (data) => {
              await registrarAsistencia(data);
              toast.success("Asistencia registrada.");
            }}
            onActualizar={async (id, data) => {
              await actualizarAsistencia(id, data);
              toast.success("Asistencia actualizada.");
            }}
            onSuccess={(msg) => toast.success(msg)}
            onError={(msg) => toast.error(msg)}
          />
        )}

        {subtab === "evaluacion" && (
          <EvaluacionTab
            alumnos={alumnosFiltrados}
            curso={curso}
            sucursal={perfil.sucursalActual}
            fecha={fecha}
            username={username}
            esDiaDeClase={esDiaDeClase}
            onToast={(msg) => toast.info(msg)}
          />
        )}

        {subtab === "profes" && (
          <ProfesGuiasTab
            profes={profesActivos}
            asistenciaPorProfe={asistenciaPorProfe}
            sucursal={perfil.sucursalActual}
            fecha={fecha}
            username={username}
            esDiaDeClase={esDiaDeClase}
            onRegistrar={async (data) => {
              await registrarAsistProfe(data);
              toast.success("Asistencia registrada.");
            }}
            onActualizar={async (id, data) => {
              await actualizarAsistProfe(id, data);
              toast.success("Asistencia actualizada.");
            }}
            onError={(msg) => toast.error(msg)}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-componentes locales
// ============================================================

function SubtabBtn({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
        active
          ? "bg-brand-500 text-white shadow-lg"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
          active ? "bg-white/20" : "bg-white text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ---------- Asistencia ----------

interface AsistenciaTabProps {
  alumnos: Alumno[];
  profesGuias: ProfeGuia[];
  asistenciaPorAlumno: Map<string, AsistenciaAlumno>;
  curso: Curso;
  turno: Turno;
  sucursal: Alumno["sucursal"];
  fecha: string;
  username: string;
  // Tarifas vigentes para snapshotear al registrar (anti-retroactivo, tarea 1.2).
  tarifasInstructor?: { Junior: number; Senior: number; Master: number };
  tarifasProfeGuia?: { Junior: number; Senior: number; Master: number };
  // v4: si hoy no es martes ni miércoles, los botones de asistencia se
  // deshabilitan. La regla del negocio dicta solo dos días de clase a la
  // semana, así que registrar en otros días sería accidental.
  esDiaDeClase: boolean;
  onRegistrar: (data: Omit<AsistenciaAlumno, "id">) => Promise<void>;
  onActualizar: (
    id: string,
    data: Partial<Omit<AsistenciaAlumno, "id">>
  ) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const NO_CLASS_TOOLTIP =
  "Hoy no hay clases. Las clases son los martes y miércoles.";

function AsistenciaTab(props: AsistenciaTabProps) {
  const {
    alumnos,
    profesGuias,
    asistenciaPorAlumno,
    curso,
    turno,
    sucursal,
    fecha,
    username,
    tarifasInstructor,
    tarifasProfeGuia,
    esDiaDeClase,
    onRegistrar,
    onActualizar,
    onSuccess,
    onError,
  } = props;

  const [obsModal, setObsModal] = useState<{
    alumno: Alumno;
    estado: EstadoAsistencia;
    existente?: AsistenciaAlumno;
  } | null>(null);

  const profesPorId = useMemo(() => {
    const m = new Map<string, ProfeGuia>();
    for (const p of profesGuias) m.set(p.id, p);
    return m;
  }, [profesGuias]);

  const aplicar = async (
    alumno: Alumno,
    estado: EstadoAsistencia,
    observacion?: string
  ) => {
    try {
      const existente = asistenciaPorAlumno.get(alumno.id);
      if (existente) {
        await onActualizar(existente.id, {
          estado,
          observacion: observacion ?? existente.observacion ?? "",
        });
      } else {
        // Snapshot al momento del registro (tareas 1.2 / 1.3): tarifas
        // vigentes y profeGuiaId actual del alumno.
        await onRegistrar({
          alumnoId: alumno.id,
          fecha,
          estado,
          observacion: observacion ?? "",
          registradaPor: username,
          sucursal,
          curso,
          turno,
          tarifaInstructorAplicada: tarifasInstructor?.[alumno.curso],
          tarifaProfeGuiaAplicada: tarifasProfeGuia?.[alumno.curso],
          profeGuiaIdSnapshot: alumno.profeGuiaId ?? "",
        });
      }
    } catch (err) {
      console.error("aplicar asistencia:", err);
      onError(
        err instanceof Error ? err.message : "No se pudo registrar la asistencia."
      );
    }
  };

  const marcarTodosPresente = async () => {
    // Filtramos los que NECESITAN registro nuevo o cambio. Los que ya están
    // Presente o vienen de otra fecha (auditoría) los preservamos.
    const candidatos = alumnos.filter((al) => {
      const existente = asistenciaPorAlumno.get(al.id);
      if (existente && existente.estado === "Presente") return false;
      if (existente && existente.fecha !== fecha) return false;
      return true;
    });

    if (candidatos.length === 0) {
      onSuccess("Todos los alumnos ya están como Presente.");
      return;
    }

    // Para los que YA tienen registro hoy con otro estado, hacemos update.
    // Para los que NO tienen registro, hacemos batch insert (write único).
    const aActualizar = candidatos
      .map((al) => ({
        al,
        existente: asistenciaPorAlumno.get(al.id),
      }))
      .filter((x) => x.existente);
    const aCrear = candidatos.filter((al) => !asistenciaPorAlumno.get(al.id));

    try {
      // Primero los updates (no son batch — son docs distintos con writes
      // individuales pero los disparamos en paralelo).
      await Promise.all(
        aActualizar.map(({ existente }) =>
          existente
            ? onActualizar(existente.id, {
                estado: "Presente",
                observacion: existente.observacion ?? "",
              })
            : Promise.resolve()
        )
      );

      if (aCrear.length > 0) {
        const filas = aCrear.map((al) => ({
          alumnoId: al.id,
          fecha,
          estado: "Presente" as EstadoAsistencia,
          observacion: "",
          registradaPor: username,
          sucursal,
          curso,
          turno,
          tarifaInstructorAplicada: tarifasInstructor?.[al.curso],
          tarifaProfeGuiaAplicada: tarifasProfeGuia?.[al.curso],
          profeGuiaIdSnapshot: al.profeGuiaId ?? "",
        }));
        // El helper se encarga del chunking 500 ops por batch (Firestore).
        await registrarAsistenciasAlumnosBatch(filas);
      }

      onSuccess(
        `${candidatos.length} alumno${candidatos.length === 1 ? "" : "s"} marcado${candidatos.length === 1 ? "" : "s"} como Presente.`
      );
    } catch (err) {
      console.error("marcarTodosPresente:", err);
      onError(
        err instanceof Error
          ? err.message
          : "No se pudieron marcar todos como Presente."
      );
    }
  };

  return (
    <Card
      title="Asistencia del día"
      subtitle={`${curso} · ${turno} · ${alumnos.length} alumno${alumnos.length === 1 ? "" : "s"}`}
      action={
        alumnos.length > 0 ? (
          <span title={!esDiaDeClase ? NO_CLASS_TOOLTIP : undefined}>
            <Button
              variant="outline"
              onClick={marcarTodosPresente}
              disabled={!esDiaDeClase}
            >
              Marcar todos como Presente
            </Button>
          </span>
        ) : undefined
      }
    >
      {alumnos.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          No hay alumnos en {curso} · {turno} en tu sucursal.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-3 pr-3">Alumno</th>
                <th className="pb-3 pr-3">Profe guía</th>
                <th className="pb-3 pr-3">Estado actual</th>
                <th className="pb-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a) => {
                const ya = asistenciaPorAlumno.get(a.id);
                const profe = a.profeGuiaId
                  ? profesPorId.get(a.profeGuiaId)
                  : undefined;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 align-top"
                  >
                    <td className="py-3 pr-3">
                      <b className="text-slate-900 block">{a.nombre}</b>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {profe?.nombre ?? "—"}
                    </td>
                    <td className="py-3 pr-3">
                      {ya ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${ESTADO_BADGE[ya.estado]}`}
                          >
                            {ESTADO_LABEL[ya.estado]}
                          </span>
                          {ya.observacion && (
                            <span className="text-[11px] text-slate-500 italic">
                              “{ya.observacion}”
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
                          Sin registrar
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {ya && ya.fecha !== fecha ? (
                        <span
                          className="inline-flex justify-end w-full text-[10px] text-slate-400 italic"
                          title={EDIT_LOCKED_TOOLTIP}
                        >
                          Registro de otra fecha — no editable
                        </span>
                      ) : (
                        <div
                          className="flex justify-end gap-2 flex-wrap"
                          title={!esDiaDeClase ? NO_CLASS_TOOLTIP : undefined}
                        >
                          {(
                            ["Presente", "Tarde", "Ausente"] as EstadoAsistencia[]
                          ).map((e) => (
                            <Button
                              key={e}
                              variant={
                                ya?.estado === e
                                  ? "primary"
                                  : e === "Presente"
                                    ? "outline"
                                    : e === "Tarde"
                                      ? "warning"
                                      : "danger"
                              }
                              className="!px-3 !py-2 text-xs"
                              disabled={!esDiaDeClase}
                              onClick={() =>
                                setObsModal({ alumno: a, estado: e, existente: ya })
                              }
                            >
                              {e}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {obsModal && (
        <ObservacionModal
          title={`${obsModal.alumno.nombre} — ${obsModal.estado}`}
          initialObs={obsModal.existente?.observacion ?? ""}
          onCancel={() => setObsModal(null)}
          onConfirm={async (obs) => {
            await aplicar(obsModal.alumno, obsModal.estado, obs);
            setObsModal(null);
          }}
        />
      )}
    </Card>
  );
}

function ObservacionModal({
  title,
  initialObs,
  onCancel,
  onConfirm,
}: {
  title: string;
  initialObs: string;
  onCancel: () => void;
  onConfirm: (obs: string) => Promise<void>;
}) {
  const [obs, setObs] = useState(initialObs);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <Input
          label="Observación (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="ej: llegó 10 min tarde"
          disabled={submitting}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(obs.trim());
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Evaluación ----------

interface EvaluacionTabProps {
  alumnos: Alumno[];
  curso: Curso;
  sucursal: Alumno["sucursal"];
  fecha: string;
  username: string;
  esDiaDeClase: boolean;
  onToast: (msg: string) => void;
}

function EvaluacionTab(props: EvaluacionTabProps) {
  const { alumnos, curso, sucursal, fecha, username, esDiaDeClase, onToast } = props;
  // Carga TODAS las evaluaciones del curso+sucursal: necesitamos la nota de
  // hoy + el promedio histórico por alumno. Vol. esperado: bajo (decenas de
  // alumnos × decenas de clases). Si crece, paginar por mes.
  const [evalsCurso, setEvalsCurso] = useState<EvaluacionAlumno[]>([]);

  useEffect(() => {
    if (!sucursal) return;
    let cancelled = false;

    const fetchAll = async () => {
      const { data, error } = await supabase
        .from("evaluaciones_alumnos")
        .select("*")
        .eq("sucursal", sucursal)
        .eq("curso", curso);
      if (cancelled) return;
      if (error) {
        console.error("evaluaciones del curso fetch:", error);
        onToast("No se pudieron cargar las evaluaciones.");
        return;
      }
      const rows: EvaluacionAlumno[] = (data ?? []).map((d) => ({
        id: d.id as string,
        alumnoId: d.alumno_id ?? "",
        fecha: d.fecha ?? "",
        nota: typeof d.nota === "number" ? Number(d.nota) : 0,
        observacion: d.observacion ?? "",
        evaluadoPor: d.evaluado_por ?? "",
        sucursal: d.sucursal,
        curso: d.curso,
      }));
      setEvalsCurso(rows);
    };

    void fetchAll();

    const channel = supabase
      .channel(`evaluaciones-${sucursal}-${curso}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluaciones_alumnos",
          filter: `sucursal=eq.${sucursal}`,
        },
        (payload) => {
          // Filtrar por curso client-side ya que postgres_changes solo
          // permite UN filter — el de sucursal es el más específico.
          const row = (payload.new ?? payload.old) as { curso?: string };
          if (!row?.curso || row.curso === curso) void fetchAll();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sucursal, curso, onToast]);

  // Hoy: una eval por alumno (la del día).
  // Promedio: media de TODAS las notas del alumno en el curso (incluida la
  // de hoy si existe). El promedio se renderiza en pequeño debajo de la nota.
  const evalPorAlumno = useMemo(() => {
    const m = new Map<string, EvaluacionAlumno>();
    for (const e of evalsCurso) if (e.fecha === fecha) m.set(e.alumnoId, e);
    return m;
  }, [evalsCurso, fecha]);

  const promedioPorAlumno = useMemo(() => {
    const sumas = new Map<string, { suma: number; n: number }>();
    for (const e of evalsCurso) {
      const cur = sumas.get(e.alumnoId) ?? { suma: 0, n: 0 };
      cur.suma += e.nota;
      cur.n += 1;
      sumas.set(e.alumnoId, cur);
    }
    const out = new Map<string, number>();
    for (const [id, { suma, n }] of sumas) out.set(id, n > 0 ? suma / n : 0);
    return out;
  }, [evalsCurso]);

  const [evalModal, setEvalModal] = useState<{
    alumno: Alumno;
    existente?: EvaluacionAlumno;
  } | null>(null);

  return (
    <Card
      title="Evaluación del día"
      subtitle={`${curso} · ${alumnos.length} alumno${alumnos.length === 1 ? "" : "s"}`}
    >
      {alumnos.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          No hay alumnos en este filtro.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-3 pr-3">Alumno</th>
                <th className="pb-3 pr-3">Nota de hoy</th>
                <th className="pb-3 pr-3">Observación</th>
                <th className="pb-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a) => {
                const ya = evalPorAlumno.get(a.id);
                const promedio = promedioPorAlumno.get(a.id);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 align-top"
                  >
                    <td className="py-3 pr-3">
                      <b className="text-slate-900 block">{a.nombre}</b>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-col gap-0.5">
                        {ya ? (
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold border bg-brand-50 text-brand-700 border-brand-100 self-start">
                            {ya.nota.toFixed(1)} / 10
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
                            Sin evaluar
                          </span>
                        )}
                        {typeof promedio === "number" && promedio > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Promedio: {promedio.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500 italic max-w-[260px]">
                      {ya?.observacion || "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {ya && ya.fecha !== fecha ? (
                          <span title={EDIT_LOCKED_TOOLTIP} className="inline-flex">
                            <Button
                              variant="outline"
                              className="!px-3 !py-2 text-xs"
                              disabled
                            >
                              Editar
                            </Button>
                          </span>
                        ) : (
                          <span
                            title={!esDiaDeClase ? NO_CLASS_TOOLTIP : undefined}
                            className="inline-flex"
                          >
                            <Button
                              variant={ya ? "outline" : "primary"}
                              className="!px-3 !py-2 text-xs"
                              disabled={!esDiaDeClase}
                              onClick={() =>
                                setEvalModal({ alumno: a, existente: ya })
                              }
                            >
                              {ya ? "Editar" : "Evaluar hoy"}
                            </Button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {evalModal && (
        <EvaluarModal
          alumno={evalModal.alumno}
          existente={evalModal.existente}
          fecha={fecha}
          curso={curso}
          sucursal={sucursal}
          username={username}
          onClose={() => setEvalModal(null)}
          onSaved={() => {
            setEvalModal(null);
            onToast("Evaluación guardada.");
          }}
          onError={(msg) => onToast(msg)}
        />
      )}
    </Card>
  );
}

function EvaluarModal({
  alumno,
  existente,
  fecha,
  curso,
  sucursal,
  username,
  onClose,
  onSaved,
  onError,
}: {
  alumno: Alumno;
  existente?: EvaluacionAlumno;
  fecha: string;
  curso: Curso;
  sucursal: Alumno["sucursal"];
  username: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [nota, setNota] = useState<string>(
    existente ? String(existente.nota) : "7"
  );
  const [obs, setObs] = useState(existente?.observacion ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Histórico del alumno para mostrar promedio + últimas notas dentro del modal.
  // Se carga reactivo solo cuando el modal está abierto (montaje del componente).
  const { evaluaciones, isLoading: evalsLoading } = useEvaluaciones(alumno.id);

  // Promedio: si estamos editando una evaluación de hoy, ya viene en el array;
  // entonces el promedio refleja el estado guardado. La nota del input local
  // (`nota`) NO se mete al promedio hasta que el director/instructor guarde.
  const promedio = useMemo(() => {
    if (evaluaciones.length === 0) return null;
    const suma = evaluaciones.reduce((acc, e) => acc + e.nota, 0);
    return suma / evaluaciones.length;
  }, [evaluaciones]);

  const handle = async () => {
    const n = Number(nota);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      onError("La nota debe estar entre 1 y 10.");
      return;
    }
    setSubmitting(true);
    try {
      if (existente) {
        await updateEvaluacion(existente.id, { nota: n, observacion: obs });
      } else {
        await registrarEvaluacion({
          alumnoId: alumno.id,
          fecha,
          nota: n,
          observacion: obs,
          evaluadoPor: username,
          sucursal,
          curso,
        });
      }
      onSaved();
    } catch (err) {
      console.error("registrar evaluación:", err);
      onError(
        err instanceof Error ? err.message : "No se pudo guardar la evaluación."
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Evaluar — ${alumno.nombre}`} onClose={onClose}>
      <div className="space-y-1">
        {/* Resumen histórico del alumno */}
        <div className="mb-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Histórico
            </span>
            {evalsLoading ? (
              <span className="text-[10px] text-slate-400">Cargando…</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Promedio
                </span>
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold border bg-brand-50 text-brand-700 border-brand-100">
                  {promedio === null ? "—" : `${promedio.toFixed(2)} / 10`}
                </span>
                <span className="text-[10px] text-slate-400">
                  ({evaluaciones.length} eval
                  {evaluaciones.length === 1 ? "" : "s"})
                </span>
              </div>
            )}
          </div>
          {!evalsLoading && evaluaciones.length > 0 && (
            <ul className="max-h-28 overflow-y-auto hide-scroll space-y-1 pr-1">
              {evaluaciones.slice(0, 5).map((e) => (
                <li
                  key={e.id}
                  className="flex justify-between items-center text-xs text-slate-600"
                >
                  <span className="font-mono">{e.fecha}</span>
                  <span className="font-bold text-slate-900">
                    {e.nota.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Input
          label="Nota (1 a 10)"
          type="number"
          step="0.5"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={submitting}
        />
        <Input
          label="Observación (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="ej: avanzó muy bien en cortes"
          disabled={submitting}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handle} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar evaluación"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Profes Guías ----------

interface ProfesGuiasTabProps {
  profes: ProfeGuia[];
  asistenciaPorProfe: Map<string, AsistenciaProfeGuia>;
  sucursal: Alumno["sucursal"];
  fecha: string;
  username: string;
  esDiaDeClase: boolean;
  onRegistrar: (data: Omit<AsistenciaProfeGuia, "id">) => Promise<void>;
  onActualizar: (
    id: string,
    data: Partial<Omit<AsistenciaProfeGuia, "id">>
  ) => Promise<void>;
  onError: (msg: string) => void;
}

function ProfesGuiasTab(props: ProfesGuiasTabProps) {
  const {
    profes,
    asistenciaPorProfe,
    sucursal,
    fecha,
    username,
    esDiaDeClase,
    onRegistrar,
    onActualizar,
    onError,
  } = props;

  const [obsModal, setObsModal] = useState<{
    profe: ProfeGuia;
    estado: EstadoAsistencia;
    existente?: AsistenciaProfeGuia;
  } | null>(null);

  const aplicar = async (
    profe: ProfeGuia,
    estado: EstadoAsistencia,
    observacion?: string
  ) => {
    try {
      const existente = asistenciaPorProfe.get(profe.id);
      if (existente) {
        await onActualizar(existente.id, {
          estado,
          observacion: observacion ?? existente.observacion ?? "",
        });
      } else {
        await onRegistrar({
          profeGuiaId: profe.id,
          fecha,
          estado,
          observacion: observacion ?? "",
          registradaPor: username,
          sucursal,
        });
      }
    } catch (err) {
      console.error("aplicar asistencia profe:", err);
      onError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la asistencia del profe guía."
      );
    }
  };

  return (
    <Card
      title="Asistencia de Profes Guías"
      subtitle={`${profes.length} profe${profes.length === 1 ? "" : "s"} activos en tu sucursal`}
    >
      {profes.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          No hay profes guías activos en esta sucursal.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-3 pr-3">Profe guía</th>
                <th className="pb-3 pr-3">Estado actual</th>
                <th className="pb-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {profes.map((p) => {
                const ya = asistenciaPorProfe.get(p.id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 align-top"
                  >
                    <td className="py-3 pr-3">
                      <b className="text-slate-900 block">{p.nombre}</b>
                      {p.telefono && (
                        <span className="text-[10px] text-slate-400">
                          {p.telefono}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {ya ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${ESTADO_BADGE[ya.estado]}`}
                          >
                            {ESTADO_LABEL[ya.estado]}
                          </span>
                          {ya.observacion && (
                            <span className="text-[11px] text-slate-500 italic">
                              “{ya.observacion}”
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
                          Sin registrar
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {ya && ya.fecha !== fecha ? (
                        <span
                          className="inline-flex justify-end w-full text-[10px] text-slate-400 italic"
                          title={EDIT_LOCKED_TOOLTIP}
                        >
                          Registro de otra fecha — no editable
                        </span>
                      ) : (
                        <div
                          className="flex justify-end gap-2 flex-wrap"
                          title={!esDiaDeClase ? NO_CLASS_TOOLTIP : undefined}
                        >
                          {(
                            ["Presente", "Tarde", "Ausente"] as EstadoAsistencia[]
                          ).map((e) => (
                            <Button
                              key={e}
                              variant={
                                ya?.estado === e
                                  ? "primary"
                                  : e === "Presente"
                                    ? "outline"
                                    : e === "Tarde"
                                      ? "warning"
                                      : "danger"
                              }
                              className="!px-3 !py-2 text-xs"
                              disabled={!esDiaDeClase}
                              onClick={() =>
                                setObsModal({ profe: p, estado: e, existente: ya })
                              }
                            >
                              {e}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {obsModal && (
        <ObservacionModal
          title={`${obsModal.profe.nombre} — ${obsModal.estado}`}
          initialObs={obsModal.existente?.observacion ?? ""}
          onCancel={() => setObsModal(null)}
          onConfirm={async (obs) => {
            await aplicar(obsModal.profe, obsModal.estado, obs);
            setObsModal(null);
          }}
        />
      )}
    </Card>
  );
}
