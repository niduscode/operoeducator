"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import SearchableTable, {
  SearchableTableColumn,
} from "@/components/ui/SearchableTable";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import AlumnoForm from "@/components/alumnos/AlumnoForm";
import BulkImport from "@/components/alumnos/BulkImport";
import RegistrarPagoModal from "@/components/pagos/RegistrarPagoModal";
import HistorialPagosModal from "@/components/pagos/HistorialPagosModal";
import { useAuth } from "@/hooks/useAuth";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEstadoMorosidad } from "@/hooks/useEstadoMorosidad";
import { usePagosAlumnos } from "@/hooks/usePagosAlumnos";
import { usePreciosAlumnos } from "@/hooks/usePreciosAlumnos";
import { useProfesGuias } from "@/hooks/useProfesGuias";
import { useInstructores } from "@/hooks/useInstructores";
import {
  Alumno,
  AsistenciaAlumno,
  Curso,
  Horario,
  Instructor,
  PagoAlumno,
  ProfeGuia,
  Sucursal,
  SUCURSALES,
  emailToUsername,
} from "@/lib/types";
import {
  AlumnoInput,
  PagoAlumnoInput,
  getAsistenciasPorAlumno,
} from "@/lib/firestore";
import { exportarAExcel } from "@/lib/export";

type Vista = "tabla" | "sucursal";

const CURSOS: Curso[] = ["Junior", "Senior", "Master"];
const HORARIOS: Horario[] = ["Mañana", "Tarde"];

type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; alumno: Alumno }
  | { type: "import" }
  | { type: "registrarPago"; alumno: Alumno }
  | { type: "historial"; alumno: Alumno }
  | { type: "editarPago"; pago: PagoAlumno };

export default function AlumnosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const {
    alumnos,
    isLoading: alumnosLoading,
    error: alumnosError,
    createAlumno,
    updateAlumno,
    deleteAlumno,
    reactivateAlumno,
    importMasivo,
  } = useAlumnos(null, { incluirInactivos: mostrarInactivos });
  const { profesGuias } = useProfesGuias();
  const { instructores } = useInstructores();
  const { precios } = usePreciosAlumnos();
  const [vista, setVista] = useState<Vista>("tabla");

  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  const añoActual = hoy.getFullYear();
  const morosidad = useEstadoMorosidad(mesActual, añoActual);
  const { registrarPago, actualizarPago } = usePagosAlumnos(
    mesActual,
    añoActual
  );
  const username = userEmail ? emailToUsername(userEmail) : "";

  const [curso, setCurso] = useState<Curso>("Junior");
  const [horarioFiltro, setHorarioFiltro] = useState<Horario | "Todos">("Todos");
  const [sucursalFiltro, setSucursalFiltro] = useState<Sucursal | "Todas">(
    "Todas"
  );
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Guard: solo director
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (userRole !== "director") {
      router.replace("/dashboard");
    }
  }, [user, userRole, authLoading, router]);

  const alumnosFiltrados = useMemo(() => {
    return alumnos.filter((a) => {
      if (a.curso !== curso) return false;
      if (horarioFiltro !== "Todos" && a.horario !== horarioFiltro) return false;
      if (sucursalFiltro !== "Todas" && a.sucursal !== sucursalFiltro) return false;
      return true;
    });
  }, [alumnos, curso, horarioFiltro, sucursalFiltro]);

  // Conteo de alumnos por profeGuiaId (para mostrar en selector y warning).
  const alumnosPorProfeGuia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of alumnos) {
      if (a.profeGuiaId) {
        map[a.profeGuiaId] = (map[a.profeGuiaId] ?? 0) + 1;
      }
    }
    return map;
  }, [alumnos]);

  const profesPorId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profesGuias) map[p.id] = p.nombre;
    return map;
  }, [profesGuias]);

  const handleCreate = async (data: AlumnoInput) => {
    await createAlumno(data);
    setModal({ type: "none" });
    toast.success("Alumno registrado correctamente.");
  };

  const handleUpdate = async (id: string, data: AlumnoInput) => {
    await updateAlumno(id, data);
    setModal({ type: "none" });
    toast.success("Alumno actualizado.");
  };

  const handleDelete = async (alumno: Alumno) => {
    const ok = await confirm({
      title: "¿Desactivar alumno?",
      message: (
        <>
          Vas a desactivar a <b>{alumno.nombre}</b> ({alumno.curso}
          {" · "}
          {alumno.sucursal}). Sus pagos y asistencias se conservan.
        </>
      ),
      variant: "danger",
      confirmLabel: "Desactivar",
    });
    if (!ok) return;
    try {
      await deleteAlumno(alumno.id);
      toast.success("Alumno desactivado.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo desactivar el alumno.");
    }
  };

  const handleReactivate = async (alumno: Alumno) => {
    try {
      await reactivateAlumno(alumno.id);
      toast.success(`${alumno.nombre} fue reactivado.`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo reactivar el alumno.");
    }
  };

  const handleImport = async (valid: AlumnoInput[]) => {
    try {
      const ids = await importMasivo(valid);
      setModal({ type: "none" });
      toast.success(`${ids.length} alumnos importados correctamente.`);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Error en la importación masiva."
      );
    }
  };

  const handleSubmitPago = async (
    data: PagoAlumnoInput,
    editId?: string
  ) => {
    if (editId) {
      await actualizarPago(editId, data);
      setModal({ type: "none" });
      toast.success("Pago actualizado correctamente.");
    } else {
      await registrarPago(data);
      setModal({ type: "none" });
      toast.success("Pago registrado correctamente.");
    }
  };

  const handleExport = () => {
    const filas = alumnosFiltrados.map((a) => ({
      Nombre: a.nombre,
      Teléfono: a.telefono ?? "",
      Sucursal: a.sucursal,
      Curso: a.curso,
      Turno: a.horario,
      "Profe guía":
        (a.profeGuiaId && profesPorId[a.profeGuiaId]) || "Sin asignar",
      "Fecha ingreso": a.fecha,
      Estado: a.activo === false ? "Inactivo" : "Activo",
      "Pago mes actual": idsAlDia.has(a.id) ? "Al día" : "Con deuda",
    }));
    const fecha = `${añoActual}-${String(mesActual).padStart(2, "0")}`;
    exportarAExcel(filas, `alumnos-${curso}-${fecha}`);
    toast.info(`Exportadas ${filas.length} filas.`);
  };

  // Set de IDs de alumnos al día este mes (para badge en la tabla).
  const idsAlDia = useMemo(
    () => new Set(morosidad.alumnosAlDia.map((a) => a.id)),
    [morosidad.alumnosAlDia]
  );

  const canExport = userRole === "director" || userRole === "admin";

  // Loading inicial de auth
  if (authLoading || !user || userRole !== "director") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const columns: SearchableTableColumn<Alumno>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (a) => (
        <div className="flex flex-col gap-1">
          <b className="text-slate-900">{a.nombre}</b>
          {a.activo === false && (
            <span className="self-start bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest">
              Inactivo
            </span>
          )}
        </div>
      ),
    },
    {
      key: "telefono",
      header: "Teléfono",
      render: (a) => (
        <span className="text-slate-500 text-xs">{a.telefono || "—"}</span>
      ),
    },
    {
      key: "sucursal",
      header: "Sucursal",
      render: (a) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {a.sucursal}
        </span>
      ),
    },
    {
      key: "curso",
      header: "Curso",
      render: (a) => <span className="text-xs">{a.curso}</span>,
    },
    {
      key: "turno",
      header: "Turno",
      render: (a) => <span className="text-xs">{a.horario}</span>,
    },
    {
      key: "profe",
      header: "Profe guía",
      render: (a) =>
        a.profeGuiaId && profesPorId[a.profeGuiaId] ? (
          <span className="text-slate-700 text-xs">
            {profesPorId[a.profeGuiaId]}
          </span>
        ) : (
          <span className="text-slate-400 italic text-xs">Sin asignar</span>
        ),
    },
    {
      key: "pago",
      header: "Pago mes actual",
      render: (a) => {
        if (morosidad.isLoading)
          return <span className="text-slate-300 text-[10px]">…</span>;
        const alDia = idsAlDia.has(a.id);
        return alDia ? (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
            Al día
          </span>
        ) : (
          <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
            Con deuda
          </span>
        );
      },
    },
    {
      key: "acciones",
      header: <span className="block text-right">Acciones</span>,
      tdClassName: "text-right",
      render: (a) => (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            variant="outline"
            className="!px-3 !py-2 text-xs"
            onClick={() => setModal({ type: "historial", alumno: a })}
          >
            Ver pagos
          </Button>
          <Button
            variant="primary"
            className="!px-3 !py-2 text-xs"
            onClick={() => setModal({ type: "registrarPago", alumno: a })}
          >
            Registrar pago
          </Button>
          <Button
            variant="outline"
            className="!px-3 !py-2 text-xs"
            onClick={() => setModal({ type: "edit", alumno: a })}
          >
            Editar
          </Button>
          {a.activo === false ? (
            <Button
              variant="warning"
              className="!px-3 !py-2 text-xs"
              onClick={() => handleReactivate(a)}
            >
              Reactivar
            </Button>
          ) : (
            <Button
              variant="danger"
              className="!px-3 !py-2 text-xs"
              onClick={() => handleDelete(a)}
            >
              Desactivar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        {/* Header + acciones */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Gestión Global de Alumnos
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              {alumnos.length} alumno{alumnos.length === 1 ? "" : "s"}{" "}
              {mostrarInactivos ? "(incluyendo inactivos)" : "activos"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setModal({ type: "import" })}
            >
              Importar desde Excel/CSV
            </Button>
            <Button variant="primary" onClick={() => setModal({ type: "create" })}>
              Registrar alumno manual
            </Button>
          </div>
        </div>

        {alumnosError && (
          <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
            {alumnosError}
          </div>
        )}

        {/* Toggle Vista Tabla / Vista por Sucursal */}
        <Card className="!p-2">
          <div className="flex gap-1">
            <button
              onClick={() => setVista("tabla")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                vista === "tabla"
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-transparent text-slate-500 hover:bg-slate-50"
              }`}
            >
              Vista Tabla
            </button>
            <button
              onClick={() => setVista("sucursal")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                vista === "sucursal"
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-transparent text-slate-500 hover:bg-slate-50"
              }`}
            >
              Vista por Sucursal
            </button>
          </div>
        </Card>

        {vista === "sucursal" && (
          <VistaPorSucursal
            alumnos={alumnos}
            profesGuias={profesGuias}
            instructores={instructores}
          />
        )}

        {vista === "tabla" && (
        <>

        {/* Pestañas de curso */}
        <Card className="!p-4">
          <div className="flex gap-2 overflow-x-auto hide-scroll">
            {CURSOS.map((c) => (
              <button
                key={c}
                onClick={() => setCurso(c)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1 md:flex-none ${
                  curso === c
                    ? "bg-slate-900 text-white shadow-lg"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center mr-1">
                Turno:
              </span>
              {(["Todos", ...HORARIOS] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorarioFiltro(h)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    horarioFiltro === h
                      ? "bg-brand-500 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

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

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 self-start mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => setMostrarInactivos(e.target.checked)}
                className="rounded"
              />
              Mostrar inactivos
            </label>
          </div>
        </Card>

        {/* Tabla */}
        <Card
          title="Directorio"
          subtitle={`${alumnosFiltrados.length} ${
            alumnosFiltrados.length === 1 ? "alumno" : "alumnos"
          } en ${curso}${
            horarioFiltro !== "Todos" ? ` · ${horarioFiltro}` : ""
          }${sucursalFiltro !== "Todas" ? ` · ${sucursalFiltro}` : ""}`}
        >
          {alumnosLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <SearchableTable
              data={alumnosFiltrados}
              columns={columns}
              rowKey={(a) => a.id}
              searchableFields={(a) =>
                `${a.nombre} ${a.telefono ?? ""} ${a.sucursal} ${a.curso} ${a.horario} ${
                  (a.profeGuiaId && profesPorId[a.profeGuiaId]) || ""
                }`
              }
              searchPlaceholder="Buscar por nombre, teléfono, sucursal..."
              minWidth="900px"
              emptyMessage="No hay alumnos con los filtros actuales."
              toolbar={
                canExport && alumnosFiltrados.length > 0 ? (
                  <Button
                    variant="outline"
                    className="!px-3 !py-2 text-xs"
                    onClick={handleExport}
                  >
                    Exportar Excel
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
        </>
        )}
      </div>

      {/* Modales */}
      {modal.type === "create" && (
        <Modal
          title="Registrar alumno manual"
          onClose={() => setModal({ type: "none" })}
        >
          <AlumnoForm
            profesGuias={profesGuias}
            alumnosPorProfeGuia={alumnosPorProfeGuia}
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {modal.type === "edit" && (
        <Modal
          title="Editar alumno"
          onClose={() => setModal({ type: "none" })}
        >
          <AlumnoForm
            initial={modal.alumno}
            profesGuias={profesGuias}
            alumnosPorProfeGuia={alumnosPorProfeGuia}
            onSubmit={(data) => handleUpdate(modal.alumno.id, data)}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {modal.type === "import" && (
        <Modal
          title="Importar alumnos desde Excel/CSV"
          onClose={() => setModal({ type: "none" })}
        >
          <BulkImport
            onCancel={() => setModal({ type: "none" })}
            onImport={handleImport}
          />
        </Modal>
      )}

      {modal.type === "registrarPago" && (
        <Modal
          title={`Registrar pago · ${modal.alumno.nombre}`}
          onClose={() => setModal({ type: "none" })}
        >
          <RegistrarPagoModal
            alumnos={alumnos}
            precios={precios}
            registradoPor={username}
            alumnoPreseleccionadoId={modal.alumno.id}
            mesInicial={mesActual}
            añoInicial={añoActual}
            onSubmit={handleSubmitPago}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {modal.type === "historial" && (
        <Modal
          title={`Historial de pagos · ${modal.alumno.nombre}`}
          onClose={() => setModal({ type: "none" })}
        >
          <HistorialPagosModal
            alumno={modal.alumno}
            onClose={() => setModal({ type: "none" })}
            onEdit={(pago) => setModal({ type: "editarPago", pago })}
          />
        </Modal>
      )}

      {modal.type === "editarPago" && (
        <Modal
          title={`Editar pago · ${modal.pago.alumnoNombre}`}
          onClose={() => setModal({ type: "none" })}
        >
          <RegistrarPagoModal
            alumnos={alumnos}
            precios={precios}
            registradoPor={username}
            initialPago={modal.pago}
            onSubmit={handleSubmitPago}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}
    </div>
  );
}

function VistaPorSucursal({
  alumnos,
  profesGuias,
  instructores,
}: {
  alumnos: Alumno[];
  profesGuias: ProfeGuia[];
  instructores: Instructor[];
}) {
  const [expandidaSuc, setExpandidaSuc] = useState<Sucursal | null>(null);

  const profePorId = useMemo(() => {
    const m = new Map<string, ProfeGuia>();
    for (const p of profesGuias) m.set(p.id, p);
    return m;
  }, [profesGuias]);
  const instPorId = useMemo(() => {
    const m = new Map<string, Instructor>();
    for (const i of instructores) m.set(i.id, i);
    return m;
  }, [instructores]);

  const porSucursal = useMemo(() => {
    const map: Record<Sucursal, Alumno[]> = {
      "Puerto Montt": [],
      Osorno: [],
      Valdivia: [],
      Temuco: [],
    };
    for (const a of alumnos) {
      if (a.activo === false) continue;
      const arr = map[a.sucursal];
      if (arr) arr.push(a);
    }
    for (const k of Object.keys(map) as Sucursal[]) {
      map[k].sort((x, y) => x.nombre.localeCompare(y.nombre));
    }
    return map;
  }, [alumnos]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {SUCURSALES.map((s) => {
        const lista = porSucursal[s] ?? [];
        const expandida = expandidaSuc === s;
        return (
          <Card key={s} className="!p-4 cursor-pointer">
            <button
              type="button"
              onClick={() => setExpandidaSuc(expandida ? null : s)}
              className="w-full text-left"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold uppercase text-[10px] tracking-widest text-brand-600">
                    Sucursal
                  </p>
                  <p className="text-lg font-bold text-slate-900">{s}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-light text-slate-900">
                    {lista.length}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    alumno{lista.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {expandida ? "▾ Cerrar lista" : "▸ Ver lista"}
              </p>
            </button>

            {expandida && (
              <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto hide-scroll pr-1">
                {lista.length === 0 ? (
                  <p className="text-xs italic text-slate-400 py-3 text-center">
                    Sin alumnos en esta sucursal.
                  </p>
                ) : (
                  lista.map((a) => (
                    <AlumnoEnSucursalRow
                      key={a.id}
                      alumno={a}
                      profe={
                        a.profeGuiaId ? profePorId.get(a.profeGuiaId) : undefined
                      }
                      instructor={
                        a.instructorId
                          ? instPorId.get(a.instructorId)
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AlumnoEnSucursalRow({
  alumno,
  profe,
  instructor,
}: {
  alumno: Alumno;
  profe: ProfeGuia | undefined;
  instructor: Instructor | undefined;
}) {
  const [expandido, setExpandido] = useState(false);
  const [historial, setHistorial] = useState<AsistenciaAlumno[] | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!expandido || historial !== null) return;
    let cancelado = false;
    setLoadingHist(true);
    getAsistenciasPorAlumno(alumno.id, 3)
      .then((rows) => {
        if (!cancelado) setHistorial(rows);
      })
      .catch((err) => {
        console.error("getAsistenciasPorAlumno:", err);
        if (!cancelado) setHistorial([]);
      })
      .finally(() => {
        if (!cancelado) setLoadingHist(false);
      });
    return () => {
      cancelado = true;
    };
  }, [expandido, historial, alumno.id]);

  return (
    <div className="border border-slate-100 rounded-xl bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full p-3 text-left text-xs hover:bg-slate-100 transition-colors"
      >
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <b className="text-slate-900 block truncate">{alumno.nombre}</b>
            <span className="text-slate-500 text-[11px]">
              {alumno.curso} · {alumno.horario}
            </span>
          </div>
          <span className="text-slate-400 text-[10px] flex-shrink-0">
            {expandido ? "▴" : "▾"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 truncate">
          A cargo de:{" "}
          <b className="text-slate-700">
            {instructor
              ? `${instructor.nombreCompleto} (Instructor)`
              : profe
                ? `${profe.nombre} (Profe guía)`
                : "Sin asignar"}
          </b>
        </p>
      </button>

      {expandido && (
        <div className="px-3 pb-3 border-t border-slate-200/80">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-2 mb-1">
            Últimas 3 asistencias
          </p>
          {loadingHist ? (
            <p className="text-[11px] text-slate-400 italic">Cargando…</p>
          ) : !historial || historial.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">
              Sin asistencias registradas.
            </p>
          ) : (
            <ul className="space-y-1">
              {historial.map((h) => (
                <li
                  key={h.id}
                  className="flex justify-between items-center text-[11px] bg-white border border-slate-100 px-2 py-1.5 rounded-lg"
                >
                  <span className="font-mono text-slate-700">{h.fecha}</span>
                  <span
                    className={`font-bold uppercase text-[9px] tracking-widest px-2 py-0.5 rounded ${
                      h.estado === "Presente"
                        ? "bg-emerald-50 text-emerald-700"
                        : h.estado === "Tarde"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {h.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
