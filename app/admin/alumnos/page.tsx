"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  where,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import BackButton from "@/components/ui/BackButton";
import Card from "@/components/ui/Card";
import SearchableTable, {
  SearchableTableColumn,
} from "@/components/ui/SearchableTable";
import { useAuth } from "@/hooks/useAuth";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useProfesGuias } from "@/hooks/useProfesGuias";
import { useInstructores } from "@/hooks/useInstructores";
import { db } from "@/lib/firebase";
import {
  Alumno,
  AsistenciaAlumno,
  EstadoAsistencia,
  SUCURSALES,
  Sucursal,
} from "@/lib/types";
import { ASISTENCIAS_ALUMNOS_COLLECTION } from "@/lib/firestore";

type EstadoFiltro = EstadoAsistencia | "Sin marcar" | "Todos";
type ProfesionalRol = "instructor" | "profeGuia" | "sin-asignar";
type ProfesionalFiltro = ProfesionalRol | "Todos";

function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

interface FilaAlumno {
  alumno: Alumno;
  estadoHoy: EstadoAsistencia | "Sin marcar";
  profesionalNombre: string;
  profesionalRol: ProfesionalRol;
}

export default function AdminAlumnosPage() {
  const router = useRouter();
  const { user, userRole, isLoading: authLoading } = useAuth();

  // Guard: director o admin (los dos pueden ver el panel financiero del día).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (userRole !== "director" && userRole !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, userRole, authLoading, router]);

  const fecha = todayISODate();

  const { alumnos, isLoading: alumnosLoading } = useAlumnos();
  const { profesGuias } = useProfesGuias(null, { incluirInactivos: true });
  const { instructores } = useInstructores();

  // Asistencias del día a nivel global (todas las sucursales). El volumen es
  // bajo (≤ 100/día), así que un onSnapshot directo está bien.
  const [asistenciasHoy, setAsistenciasHoy] = useState<AsistenciaAlumno[]>([]);
  const [asistLoading, setAsistLoading] = useState(true);
  useEffect(() => {
    setAsistLoading(true);
    const q = query(
      collection(db, ASISTENCIAS_ALUMNOS_COLLECTION),
      where("fecha", "==", fecha)
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: AsistenciaAlumno[] = snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            alumnoId: v.alumnoId ?? "",
            fecha: v.fecha ?? "",
            estado: (v.estado as EstadoAsistencia) ?? "Presente",
            observacion: v.observacion ?? "",
            registradaPor: v.registradaPor ?? "",
            sucursal: v.sucursal,
            curso: v.curso,
            turno: v.turno,
            tarifaInstructorAplicada:
              typeof v.tarifaInstructorAplicada === "number"
                ? v.tarifaInstructorAplicada
                : undefined,
            tarifaProfeGuiaAplicada:
              typeof v.tarifaProfeGuiaAplicada === "number"
                ? v.tarifaProfeGuiaAplicada
                : undefined,
            profeGuiaIdSnapshot:
              typeof v.profeGuiaIdSnapshot === "string"
                ? v.profeGuiaIdSnapshot
                : undefined,
            instructorIdSnapshot:
              typeof v.instructorIdSnapshot === "string"
                ? v.instructorIdSnapshot
                : undefined,
          };
        });
        setAsistenciasHoy(rows);
        setAsistLoading(false);
      },
      (err) => {
        console.error("admin/alumnos onSnapshot:", err);
        setAsistLoading(false);
      }
    );
    return () => unsub();
  }, [fecha]);

  // Filtros UI.
  const [sucursalFiltro, setSucursalFiltro] = useState<Sucursal | "Todas">(
    "Todas"
  );
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("Todos");
  const [profFiltro, setProfFiltro] = useState<ProfesionalFiltro>("Todos");

  const profePorId = useMemo(() => {
    const m = new Map(profesGuias.map((p) => [p.id, p]));
    return m;
  }, [profesGuias]);
  const instructorPorId = useMemo(() => {
    const m = new Map(instructores.map((i) => [i.id, i]));
    return m;
  }, [instructores]);
  const asistPorAlumno = useMemo(() => {
    const m = new Map<string, AsistenciaAlumno>();
    for (const a of asistenciasHoy) m.set(a.alumnoId, a);
    return m;
  }, [asistenciasHoy]);

  // Construimos las filas resolviendo el profesional desde snapshots
  // (verdad histórica) y, si no existen, desde el estado actual del alumno.
  const filas: FilaAlumno[] = useMemo(() => {
    return alumnos.map((al) => {
      const asist = asistPorAlumno.get(al.id);
      const estadoHoy: FilaAlumno["estadoHoy"] = asist
        ? asist.estado
        : "Sin marcar";

      const instructorId =
        asist?.instructorIdSnapshot || al.instructorId || "";
      const profeGuiaId =
        asist?.profeGuiaIdSnapshot || al.profeGuiaId || "";

      let profesionalNombre = "Sin asignar";
      let profesionalRol: ProfesionalRol = "sin-asignar";
      if (instructorId) {
        const inst = instructorPorId.get(instructorId);
        if (inst) {
          profesionalNombre = `${inst.nombreCompleto} (Instructor)`;
          profesionalRol = "instructor";
        }
      } else if (profeGuiaId) {
        const prof = profePorId.get(profeGuiaId);
        if (prof) {
          profesionalNombre = `${prof.nombre} (Profe guía)`;
          profesionalRol = "profeGuia";
        }
      }

      return {
        alumno: al,
        estadoHoy,
        profesionalNombre,
        profesionalRol,
      };
    });
  }, [alumnos, asistPorAlumno, instructorPorId, profePorId]);

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (sucursalFiltro !== "Todas" && f.alumno.sucursal !== sucursalFiltro)
        return false;
      if (estadoFiltro !== "Todos" && f.estadoHoy !== estadoFiltro)
        return false;
      if (profFiltro !== "Todos" && f.profesionalRol !== profFiltro)
        return false;
      return true;
    });
  }, [filas, sucursalFiltro, estadoFiltro, profFiltro]);

  if (
    authLoading ||
    !user ||
    (userRole !== "director" && userRole !== "admin")
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const conteos = {
    presente: filas.filter((f) => f.estadoHoy === "Presente").length,
    tarde: filas.filter((f) => f.estadoHoy === "Tarde").length,
    ausente: filas.filter((f) => f.estadoHoy === "Ausente").length,
    sinMarcar: filas.filter((f) => f.estadoHoy === "Sin marcar").length,
  };

  const columns: SearchableTableColumn<FilaAlumno>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (r) => <b className="text-slate-900">{r.alumno.nombre}</b>,
    },
    {
      key: "sucursal",
      header: "Sucursal",
      render: (r) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {r.alumno.sucursal}
        </span>
      ),
    },
    {
      key: "curso",
      header: "Curso",
      render: (r) => <span className="text-xs">{r.alumno.curso}</span>,
    },
    {
      key: "estado",
      header: "Estado HOY",
      render: (r) => {
        const cls =
          r.estadoHoy === "Presente"
            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
            : r.estadoHoy === "Tarde"
              ? "bg-amber-50 text-amber-700 border-amber-100"
              : r.estadoHoy === "Ausente"
                ? "bg-rose-50 text-rose-700 border-rose-100"
                : "bg-slate-50 text-slate-500 border-slate-100";
        return (
          <span
            className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${cls}`}
          >
            {r.estadoHoy}
          </span>
        );
      },
    },
    {
      key: "profesional",
      header: "Profesional a cargo",
      render: (r) =>
        r.profesionalRol === "sin-asignar" ? (
          <span className="text-xs text-slate-400 italic">Sin asignar</span>
        ) : (
          <span className="text-xs text-slate-700">{r.profesionalNombre}</span>
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
            Alumnos · Asistencia de hoy
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Presentes
            </p>
            <p className="text-2xl font-light text-emerald-600 mt-1">
              {conteos.presente}
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Tarde
            </p>
            <p className="text-2xl font-light text-amber-600 mt-1">
              {conteos.tarde}
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Ausentes
            </p>
            <p className="text-2xl font-light text-rose-600 mt-1">
              {conteos.ausente}
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Sin marcar
            </p>
            <p className="text-2xl font-light text-slate-600 mt-1">
              {conteos.sinMarcar}
            </p>
          </Card>
        </div>

        <Card className="!p-4">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center mr-1">
                Sucursal:
              </span>
              {(["Todas", ...SUCURSALES] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSucursalFiltro(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    sucursalFiltro === s
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center mr-1">
                Estado:
              </span>
              {(["Todos", "Presente", "Tarde", "Ausente", "Sin marcar"] as EstadoFiltro[]).map(
                (e) => (
                  <button
                    key={e}
                    onClick={() => setEstadoFiltro(e)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      estadoFiltro === e
                        ? "bg-brand-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {e}
                  </button>
                )
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center mr-1">
                Profesional:
              </span>
              {(
                [
                  { v: "Todos", label: "Todos" },
                  { v: "instructor", label: "Instructor" },
                  { v: "profeGuia", label: "Profe guía" },
                  { v: "sin-asignar", label: "Sin asignar" },
                ] as { v: ProfesionalFiltro; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setProfFiltro(opt.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    profFiltro === opt.v
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Listado de alumnos"
          subtitle={`${filasFiltradas.length} de ${filas.length} con los filtros actuales`}
        >
          {alumnosLoading || asistLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <SearchableTable
              data={filasFiltradas}
              columns={columns}
              rowKey={(r) => r.alumno.id}
              searchableFields={(r) =>
                `${r.alumno.nombre} ${r.alumno.sucursal} ${r.alumno.curso} ${r.profesionalNombre} ${r.estadoHoy}`
              }
              searchPlaceholder="Buscar por nombre, sucursal, profesional..."
              minWidth="900px"
              emptyMessage="No hay alumnos con los filtros actuales."
            />
          )}
        </Card>

        <p className="text-[11px] text-slate-400 text-center">
          La asistencia se registra desde{" "}
          <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
            /aulas
          </code>{" "}
          por los instructores.
        </p>
      </div>
    </div>
  );
}
