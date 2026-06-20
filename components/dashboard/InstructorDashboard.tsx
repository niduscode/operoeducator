"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import CertificacionesBanner from "@/components/dashboard/CertificacionesBanner";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useProfesGuias } from "@/hooks/useProfesGuias";
import { useTemario } from "@/hooks/useTemario";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import {
  Alumno,
  Curso,
  CURSOS,
  ProfeGuia,
} from "@/lib/types";
import {
  asignarInstructorAAlumno,
  asignarProfeGuiaAAlumno,
} from "@/lib/firestore";

export default function InstructorDashboard() {
  const { perfil, isLoading: perfilLoading, error: perfilError } = useMiPerfil();

  const sucursalAsignada = perfil?.activo ? perfil.sucursalActual : null;
  const { alumnos } = useAlumnos(sucursalAsignada);
  const { profesGuias } = useProfesGuias(sucursalAsignada);
  const profesActivos = profesGuias.filter((p) => p.activo);

  const fechaHoy = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const [modal, setModal] = useState<"alumnos" | "profes" | null>(null);

  if (perfilLoading) {
    return (
      <div className="py-16 flex justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (perfilError) {
    return (
      <div className="p-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-sm font-bold text-center">
        {perfilError}
      </div>
    );
  }

  if (!perfil) {
    return (
      <Card className="text-center">
        <div className="py-8 space-y-3">
          <h2 className="text-xl font-light text-slate-900">
            Tu perfil de instructor aún no está configurado
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Tu cuenta de inicio de sesión existe, pero el Director todavía no
            creó tu perfil en el sistema. Contáctalo para que te asigne una
            sucursal y puedas empezar a operar.
          </p>
        </div>
      </Card>
    );
  }

  if (!perfil.activo) {
    return (
      <Card className="text-center">
        <div className="py-8 space-y-3">
          <h2 className="text-xl font-light text-slate-900">
            Tu cuenta está desactivada
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Contacta al Director para reactivarla.
          </p>
        </div>
      </Card>
    );
  }

  // Inicial del nombre para el avatar (estilo app de barberos).
  const inicial = (perfil.nombreCompleto || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4 md:space-y-8 animate-[fadeIn_0.3s_ease]">
      {/* Header — compacto en mobile (avatar + nombre + sucursal en una fila);
          desktop mantiene el saludo grande tradicional. */}
      <div className="header-top flex justify-between items-center gap-3">
        {/* Mobile: avatar circular + nombre/sucursal en una línea. */}
        <div className="flex items-center gap-3 md:hidden min-w-0 flex-1">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-500 to-accent-400 text-white flex items-center justify-center font-semibold text-lg shadow-md shadow-brand-500/20 flex-shrink-0">
            {inicial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
              {perfil.nombreCompleto}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {perfil.sucursalActual} · {fechaHoy.split(",")[0]}
            </p>
          </div>
        </div>
        {/* Desktop: saludo grande original. */}
        <div className="hidden md:block w-full">
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900">
            Hola, {perfil.nombreCompleto} 👋
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">{fechaHoy}</p>
        </div>
      </div>

      {/* Banner de certificaciones — solo de su sucursal. Sin botón a /pagos
          (el instructor no tiene acceso a esa pantalla). */}
      <CertificacionesBanner
        sucursal={perfil.sucursalActual}
        mostrarBotonPagos={false}
      />

      {/* Card de operación: sucursal + alumnos + profes guías.
          Mobile: grid 2 cols compacto. Desktop: layout original 3 cols.
          Los CTAs grandes (Ir al Aula / Mi Pago) viven en el bottom nav en
          mobile, y aquí solo se muestran en desktop. */}
      <Card className="bg-slate-900 text-white border-none shadow-2xl shadow-slate-900/20 !p-4 md:!p-6">
        {/* Sucursal asignada — full width arriba en mobile, columna en desktop. */}
        <div className="md:hidden mb-3">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Sucursal asignada
          </label>
          <div className="w-full bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 text-white text-sm font-semibold flex items-center justify-between">
            <span>{perfil.sucursalActual}</span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
              Fija
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 md:mb-4">
          {/* Sucursal — solo desktop (en mobile va arriba full width). */}
          <div className="hidden md:block">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Sucursal asignada
            </label>
            <div className="w-full bg-slate-800 p-3 rounded-2xl border border-slate-700 text-white text-sm font-semibold flex items-center justify-between">
              <span>{perfil.sucursalActual}</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                Fija
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal("alumnos")}
            className="text-left bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all p-3 rounded-xl md:rounded-2xl border border-slate-700"
          >
            <p className="block text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 md:mb-2 leading-tight">
              Alumnos en {perfil.sucursalActual}
            </p>
            <p className="text-2xl md:text-3xl font-light">{alumnos.length}</p>
            <p className="text-[10px] text-slate-400 mt-1 underline">
              Ver y asignarme
            </p>
          </button>
          <button
            type="button"
            onClick={() => setModal("profes")}
            className="text-left bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all p-3 rounded-xl md:rounded-2xl border border-slate-700"
          >
            <p className="block text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 md:mb-2 leading-tight">
              Profes guías activos
            </p>
            <p className="text-2xl md:text-3xl font-light">{profesActivos.length}</p>
            <p className="text-[10px] text-slate-400 mt-1 underline">
              Asignar a profes
            </p>
          </button>
        </div>

        {/* CTAs grandes — solo desktop. En mobile el bottom nav cumple la función. */}
        <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <Link href="/aulas" className="w-full">
            <Button variant="primary" className="w-full">
              Ir al Aula Virtual
            </Button>
          </Link>
          <Link href="/mi-pago" className="w-full">
            <Button variant="outline" className="w-full">
              Mi Pago del Mes
            </Button>
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <Card title="Estado Académico" subtitle="Tema sugerido de hoy por curso">
          <div className="space-y-3 mt-4">
            {CURSOS.map((c) => {
              const count = alumnos.filter((a) => a.curso === c).length;
              return (
                <CursoTemaRow
                  key={c}
                  curso={c}
                  alumnosCount={count}
                />
              );
            })}
          </div>
        </Card>
      </div>

      {modal === "alumnos" && (
        <AlumnosModal
          alumnos={alumnos}
          profesGuias={profesGuias}
          sucursal={perfil.sucursalActual}
          instructorId={perfil.id}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "profes" && (
        <ProfesModal
          profes={profesActivos}
          alumnos={alumnos}
          username={perfil.username}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function CursoTemaRow({ curso, alumnosCount }: { curso: Curso; alumnosCount: number }) {
  const { temario, semanaActual } = useTemario(curso);
  const dow = new Date().getDay();

  let mensaje: string;
  if (!temario || !semanaActual) {
    mensaje = "El curso no ha iniciado";
  } else if (dow === 2) {
    mensaje = semanaActual.temaMartes?.trim()
      ? `Martes — ${semanaActual.temaMartes}`
      : `${semanaActual.titulo} (sin tema de martes definido)`;
  } else if (dow === 3) {
    mensaje = semanaActual.temaMiercoles?.trim()
      ? `Miércoles — ${semanaActual.temaMiercoles}`
      : `${semanaActual.titulo} (sin tema de miércoles definido)`;
  } else {
    mensaje = `${semanaActual.titulo} (hoy no hay clase)`;
  }

  const semNum = semanaActual?.semanaNumero ?? 0;

  // Próxima semana: si la actual es N, mostramos N+1. El temario lista las
  // semanas ordenadas por semanaNumero — buscamos la siguiente en el array.
  const proximaSemana = (() => {
    if (!temario || !semanaActual) return null;
    const idx = temario.semanas.findIndex(
      (s) => s.semanaNumero === semanaActual.semanaNumero
    );
    if (idx === -1 || idx + 1 >= temario.semanas.length) return null;
    return temario.semanas[idx + 1];
  })();

  return (
    <div className="p-3 bg-slate-50 rounded-xl text-xs md:text-sm flex flex-col border border-slate-100">
      <div className="flex justify-between items-center mb-1">
        <span className="font-bold uppercase text-[10px] tracking-widest text-brand-500">
          Grupo {curso}
        </span>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
          {alumnosCount} alumno{alumnosCount === 1 ? "" : "s"}
        </span>
      </div>
      <span className="truncate">
        Semana {semNum}: <b className="text-slate-700">{mensaje}</b>
      </span>

      {proximaSemana && (
        <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Próxima semana — Sem {proximaSemana.semanaNumero}
          </p>
          <p className="text-slate-700">
            <b>{proximaSemana.titulo || "Sin título"}</b>
          </p>
          {proximaSemana.descripcion && (
            <p className="text-slate-500">{proximaSemana.descripcion}</p>
          )}
          {(proximaSemana.temaMartes || proximaSemana.temaMiercoles) && (
            <ul className="mt-1 space-y-0.5">
              {proximaSemana.temaMartes && (
                <li>
                  <span className="text-slate-400">Martes:</span>{" "}
                  {proximaSemana.temaMartes}
                </li>
              )}
              {proximaSemana.temaMiercoles && (
                <li>
                  <span className="text-slate-400">Miércoles:</span>{" "}
                  {proximaSemana.temaMiercoles}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AlumnosModal: el instructor puede asignarse alumnos de su sucursal
// ============================================================
//
// Reglas de la operación (v4.2):
//   - Elegibles: alumnos sin instructor (la asignación a otro instructor sí
//     se respeta — sólo el director reasigna entre instructores).
//   - Alumnos que ya tienen profe guía SÍ son elegibles. Al tomarlos, se
//     limpia el profeGuiaId vía `asignarInstructorAAlumno` (mutuamente
//     excluyente). Antes del write se pide confirmación con la lista de
//     alumnos afectados y su profe guía actual.
//   - El sucursal-filter ya viene aplicado por `useAlumnos`.
function AlumnosModal({
  alumnos,
  profesGuias,
  sucursal,
  instructorId,
  onClose,
}: {
  alumnos: Alumno[];
  profesGuias: ProfeGuia[];
  sucursal: string;
  instructorId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const profesPorId = useMemo(() => {
    const m = new Map<string, ProfeGuia>();
    for (const p of profesGuias) m.set(p.id, p);
    return m;
  }, [profesGuias]);

  const ordenados = useMemo(
    () => [...alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [alumnos]
  );

  const toggle = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAsignarAMi = async () => {
    if (seleccion.size === 0) return;

    // Si alguno de los seleccionados ya tiene profe guía, pedimos confirmación
    // explícita listando alumno + profe actual antes de pisarlo.
    const conProfe = ordenados.filter(
      (a) => seleccion.has(a.id) && a.profeGuiaId
    );
    if (conProfe.length > 0) {
      const ok = await confirm({
        title: "Reasignar desde profes guías",
        message: (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              {conProfe.length === 1
                ? "Este alumno está asignado a un profe guía. Al tomarlo, se le quitará al profe."
                : `${conProfe.length} alumnos están asignados a profes guías. Al tomarlos, se les quitará a sus profes.`}
            </p>
            <ul className="space-y-1 text-xs">
              {conProfe.map((a) => {
                const profe = a.profeGuiaId
                  ? profesPorId.get(a.profeGuiaId)
                  : undefined;
                return (
                  <li
                    key={a.id}
                    className="flex justify-between gap-2 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg"
                  >
                    <b className="text-slate-900 truncate">{a.nombre}</b>
                    <span className="text-amber-700">
                      ← {profe?.nombre ?? "(profe desconocido)"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
        variant: "warning",
        confirmLabel: "Sí, tomar al alumno",
      });
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      // Asignamos en serie para evitar saturar el SDK; el volumen esperado
      // es bajo (≤ 30 alumnos por instructor).
      for (const id of seleccion) {
        await asignarInstructorAAlumno(id, instructorId);
      }
      toast.success(
        `${seleccion.size} alumno${seleccion.size === 1 ? "" : "s"} asignado${seleccion.size === 1 ? "" : "s"} a ti.`
      );
      onClose();
    } catch (err) {
      console.error("AlumnosModal asignar:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudieron asignar los alumnos."
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Alumnos en ${sucursal}`} onClose={onClose}>
      {ordenados.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-4 text-center">
          No hay alumnos cargados en esta sucursal.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-3">
            Marca los alumnos que quieres tener a tu cargo. Aparecen checkboxes
            en los que no tienen instructor — incluye los que están asignados
            a un profe guía (al tomarlos se les quita al profe). Los alumnos
            ya asignados a otro instructor solo los puede mover el director.
          </p>
          <div className="max-h-[55vh] overflow-y-auto hide-scroll space-y-2 pr-1">
            {ordenados.map((a) => {
              const profe = a.profeGuiaId
                ? profesPorId.get(a.profeGuiaId)
                : undefined;
              const yaConmigo = a.instructorId === instructorId;
              const elegible = !yaConmigo && !a.instructorId;
              const checked = seleccion.has(a.id);
              return (
                <label
                  key={a.id}
                  className={`block p-3 rounded-2xl border text-sm transition-colors ${
                    yaConmigo
                      ? "bg-emerald-50 border-emerald-100"
                      : elegible
                        ? "bg-slate-50 border-slate-100 hover:bg-slate-100 cursor-pointer"
                        : "bg-slate-50 border-slate-100 opacity-80"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      {elegible && (
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4 accent-brand-500 flex-shrink-0"
                          checked={checked}
                          onChange={() => toggle(a.id)}
                          disabled={submitting}
                        />
                      )}
                      <div className="min-w-0">
                        <b className="text-slate-900 truncate">{a.nombre}</b>
                        <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-1 items-center">
                          {yaConmigo ? (
                            <span className="text-emerald-600 font-bold">
                              Ya asignado a ti
                            </span>
                          ) : a.instructorId ? (
                            <span>Asignado a otro instructor</span>
                          ) : profe ? (
                            <span className="bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest">
                              Asignado a: {profe.nombre}
                            </span>
                          ) : (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-brand-50 text-brand-700 px-2 py-0.5 rounded-lg">
                        {a.curso}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">
                        {a.horario}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-slate-100">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cerrar
            </Button>
            <Button
              variant="primary"
              onClick={handleAsignarAMi}
              disabled={submitting || seleccion.size === 0}
            >
              {submitting
                ? "Asignando…"
                : `Asignar a mí (${seleccion.size})`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ============================================================
// ProfesModal: el instructor asigna alumnos a profes guías de su sucursal
// ============================================================
//
// Cada profe puede expandirse y muestra sus alumnos asignados + checkboxes
// para asignar otros alumnos al profe expandido. v4.2 (simétrico al
// AlumnosModal): los alumnos con otro profe guía SÍ aparecen como elegibles
// y se confirma antes de reasignar. Alumnos asignados a un instructor no
// son elegibles desde aquí — esa reasignación pasa por el director.
//
// Los conteos de "Días trabajados (este mes)" siguen viviendo como antes
// (snapshot reactivo vía onSnapshot a asistenciasAlumnos).
function ProfesModal({
  profes,
  alumnos,
  username,
  onClose,
}: {
  profes: ProfeGuia[];
  alumnos: Alumno[];
  username: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [diasPorProfe, setDiasPorProfe] = useState<Record<string, number>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [seleccionPorProfe, setSeleccionPorProfe] = useState<
    Record<string, Set<string>>
  >({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const año = hoy.getFullYear();
    const mm = String(mes).padStart(2, "0");
    const desde = `${año}-${mm}-01`;
    const ultimoDia = new Date(año, mes, 0).getDate();
    const hasta = `${año}-${mm}-${String(ultimoDia).padStart(2, "0")}`;

    const fetchAll = async () => {
      const { data, error } = await supabase
        .from("asistencias_alumnos")
        .select("alumno_id, fecha")
        .eq("registrada_por", username)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (cancelled) return;
      if (error) {
        console.error("InstructorDashboard fetch asistencias:", error);
        return;
      }
      const profeDeAlumno = new Map<string, string>();
      for (const a of alumnos) {
        if (a.profeGuiaId) profeDeAlumno.set(a.id, a.profeGuiaId);
      }
      const diasSet: Record<string, Set<string>> = {};
      for (const r of data ?? []) {
        const profeId = profeDeAlumno.get(r.alumno_id as string);
        if (!profeId) continue;
        if (!diasSet[profeId]) diasSet[profeId] = new Set();
        diasSet[profeId].add(r.fecha as string);
      }
      const conteo: Record<string, number> = {};
      for (const k of Object.keys(diasSet)) conteo[k] = diasSet[k].size;
      setDiasPorProfe(conteo);
    };

    void fetchAll();

    const channel = supabase
      .channel(`instr-dash-asistencias-${username}-${año}-${mes}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asistencias_alumnos",
          filter: `registrada_por=eq.${username}`,
        },
        () => {
          void fetchAll();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [alumnos, username]);

  const alumnosPorProfe = useMemo(() => {
    const m = new Map<string, Alumno[]>();
    for (const a of alumnos) {
      if (!a.profeGuiaId) continue;
      const arr = m.get(a.profeGuiaId) ?? [];
      arr.push(a);
      m.set(a.profeGuiaId, arr);
    }
    return m;
  }, [alumnos]);

  const profesPorId = useMemo(() => {
    const m = new Map<string, ProfeGuia>();
    for (const p of profes) m.set(p.id, p);
    return m;
  }, [profes]);

  // Alumnos elegibles para asignar a UN profe específico:
  //   - Sin instructor (los movimientos entre instructores los hace el director).
  //   - profeGuiaId !== profeTarget.id (no tiene sentido "reasignarse" a sí mismo).
  //
  // Incluye alumnos con OTRO profe guía → se reasignan con confirmación.
  const elegiblesPara = (profeId: string): Alumno[] => {
    return alumnos
      .filter((a) => !a.instructorId && a.profeGuiaId !== profeId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const ordenados = useMemo(
    () => [...profes].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profes]
  );

  const toggleSel = (profeId: string, alumnoId: string) => {
    setSeleccionPorProfe((prev) => {
      const next = { ...prev };
      const set = new Set(next[profeId] ?? []);
      if (set.has(alumnoId)) set.delete(alumnoId);
      else set.add(alumnoId);
      next[profeId] = set;
      return next;
    });
  };

  const handleAsignar = async (profe: ProfeGuia) => {
    const sel = seleccionPorProfe[profe.id];
    if (!sel || sel.size === 0) return;

    // Confirmación de reasignaciones: alumnos que YA tienen otro profe guía.
    const reasignaciones = alumnos.filter(
      (a) =>
        sel.has(a.id) &&
        a.profeGuiaId &&
        a.profeGuiaId !== profe.id
    );
    if (reasignaciones.length > 0) {
      const ok = await confirm({
        title: `Reasignar a ${profe.nombre}`,
        message: (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              {reasignaciones.length === 1
                ? `Este alumno ya tiene profe guía. Será reasignado a ${profe.nombre}.`
                : `${reasignaciones.length} alumnos ya tienen profe guía. Serán reasignados a ${profe.nombre}.`}
            </p>
            <ul className="space-y-1 text-xs">
              {reasignaciones.map((a) => {
                const actual = a.profeGuiaId
                  ? profesPorId.get(a.profeGuiaId)
                  : undefined;
                return (
                  <li
                    key={a.id}
                    className="flex justify-between gap-2 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg"
                  >
                    <b className="text-slate-900 truncate">{a.nombre}</b>
                    <span className="text-amber-700">
                      {actual?.nombre ?? "(profe desconocido)"} → {profe.nombre}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
        variant: "warning",
        confirmLabel: "Sí, reasignar",
      });
      if (!ok) return;
    }

    setSubmitting(profe.id);
    try {
      for (const alumnoId of sel) {
        await asignarProfeGuiaAAlumno(alumnoId, profe.id);
      }
      toast.success(
        `${sel.size} alumno${sel.size === 1 ? "" : "s"} asignado${sel.size === 1 ? "" : "s"} a ${profe.nombre}.`
      );
      setSeleccionPorProfe((prev) => ({ ...prev, [profe.id]: new Set() }));
    } catch (err) {
      console.error("ProfesModal asignar:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudieron asignar los alumnos."
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal title="Profes guías activos" onClose={onClose}>
      {ordenados.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-4 text-center">
          No hay profes guías activos en esta sucursal.
        </p>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto hide-scroll space-y-2 pr-1">
          {ordenados.map((p) => {
            const asignados = alumnosPorProfe.get(p.id) ?? [];
            const sel = seleccionPorProfe[p.id] ?? new Set<string>();
            const isExp = expandido === p.id;
            return (
              <div
                key={p.id}
                className="bg-slate-50 rounded-2xl border border-slate-100 text-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandido(isExp ? null : p.id)}
                  className="w-full p-3 text-left hover:bg-slate-100 transition-colors"
                >
                  <div className="flex justify-between items-center gap-2">
                    <b className="text-slate-900">{p.nombre}</b>
                    <span className="text-slate-400 text-[10px]">
                      {isExp ? "▴" : "▾"}
                    </span>
                  </div>
                  <div className="flex gap-3 text-[11px] text-slate-500 mt-1">
                    <span>
                      Alumnos asignados:{" "}
                      <b className="text-slate-700">{asignados.length}</b>
                    </span>
                    <span>
                      Días trabajados (este mes):{" "}
                      <b className="text-slate-700">
                        {diasPorProfe[p.id] ?? 0}
                      </b>
                    </span>
                  </div>
                </button>

                {isExp && (
                  <div className="px-3 pb-3 border-t border-slate-200/60">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-2 mb-1">
                      Alumnos asignados
                    </p>
                    {asignados.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">
                        Aún no tiene alumnos.
                      </p>
                    ) : (
                      <ul className="space-y-1 mb-2">
                        {asignados.map((al) => (
                          <li
                            key={al.id}
                            className="flex justify-between items-center text-[11px] bg-white border border-slate-100 px-2 py-1.5 rounded-lg"
                          >
                            <span className="text-slate-700">
                              {al.nombre}{" "}
                              <span className="text-slate-400">
                                · {al.curso}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-3 mb-1">
                      Asignar alumnos
                    </p>
                    {(() => {
                      const elegibles = elegiblesPara(p.id);
                      if (elegibles.length === 0) {
                        return (
                          <p className="text-[11px] text-slate-400 italic">
                            No hay alumnos para asignar a este profe en tu
                            sucursal.
                          </p>
                        );
                      }
                      return (
                        <div className="max-h-48 overflow-y-auto hide-scroll space-y-1">
                          {elegibles.map((al) => {
                            const profeActual = al.profeGuiaId
                              ? profesPorId.get(al.profeGuiaId)
                              : undefined;
                            return (
                              <label
                                key={al.id}
                                className="flex items-center gap-2 text-[11px] bg-white border border-slate-100 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 accent-brand-500 flex-shrink-0"
                                  checked={sel.has(al.id)}
                                  onChange={() => toggleSel(p.id, al.id)}
                                  disabled={submitting === p.id}
                                />
                                <span className="text-slate-700 flex-1 min-w-0 truncate">
                                  {al.nombre}{" "}
                                  <span className="text-slate-400">
                                    · {al.curso}
                                  </span>
                                </span>
                                {profeActual && (
                                  <span
                                    className="bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest flex-shrink-0"
                                    title="Reasignar (se confirma antes de guardar)"
                                  >
                                    Asignado a: {profeActual.nombre}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="primary"
                        className="!px-3 !py-1.5 text-[11px]"
                        onClick={() => handleAsignar(p)}
                        disabled={submitting === p.id || sel.size === 0}
                      >
                        {submitting === p.id
                          ? "Asignando…"
                          : `Asignar (${sel.size})`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
