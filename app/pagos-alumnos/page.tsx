"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import SearchableTable, {
  SearchableTableColumn,
} from "@/components/ui/SearchableTable";
import { useToast } from "@/components/ui/Toast";
import RegistrarPagoModal from "@/components/pagos/RegistrarPagoModal";
import HistorialPagosModal from "@/components/pagos/HistorialPagosModal";
import { exportarAExcel } from "@/lib/export";
import { useAuth } from "@/hooks/useAuth";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEstadoMorosidad } from "@/hooks/useEstadoMorosidad";
import { usePagosAlumnos } from "@/hooks/usePagosAlumnos";
import { usePreciosAlumnos } from "@/hooks/usePreciosAlumnos";
import type { Alumno, PagoAlumno, Sucursal } from "@/lib/types";
import { SUCURSALES, emailToUsername } from "@/lib/types";
import { formatCLP, MESES_ES, nombreMes } from "@/lib/format";
import type { PagoAlumnoInput } from "@/lib/firestore";

type Tab = "alDia" | "conDeuda";

type ModalState =
  | { type: "none" }
  | { type: "registrar"; alumnoPreseleccionadoId?: string }
  | { type: "historial"; alumno: Alumno }
  | { type: "editar"; pago: PagoAlumno };

function añosDisponibles(actual: number): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (let a = actual + 1; a >= actual - 2; a--) {
    out.push({ label: String(a), value: String(a) });
  }
  return out;
}

export default function PagosAlumnosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const toast = useToast();

  // Guard: director o admin.
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

  const username = useMemo(
    () => (userEmail ? emailToUsername(userEmail) : ""),
    [userEmail]
  );

  const hoy = new Date();
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1);
  const [año, setAño] = useState<number>(hoy.getFullYear());
  const [sucursal, setSucursal] = useState<Sucursal | "Todas">("Todas");
  const [tab, setTab] = useState<Tab>("conDeuda");
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const sucursalQuery = sucursal === "Todas" ? null : sucursal;

  const { alumnos } = useAlumnos();
  const { pagos, registrarPago, actualizarPago } = usePagosAlumnos(
    mes,
    año,
    sucursalQuery
  );
  const { precios } = usePreciosAlumnos();
  const morosidad = useEstadoMorosidad(mes, año);

  // Cuando se filtra por sucursal aplicamos el filtro local sobre la
  // morosidad global para que el conteo de "al día / con deuda" cuadre
  // con la tabla.
  const alumnosAlDiaFiltrados = useMemo(
    () =>
      sucursal === "Todas"
        ? morosidad.alumnosAlDia
        : morosidad.alumnosAlDia.filter((a) => a.sucursal === sucursal),
    [morosidad.alumnosAlDia, sucursal]
  );
  const alumnosConDeudaFiltrados = useMemo(
    () =>
      sucursal === "Todas"
        ? morosidad.alumnosConDeuda
        : morosidad.alumnosConDeuda.filter((a) => a.sucursal === sucursal),
    [morosidad.alumnosConDeuda, sucursal]
  );

  const totalRecaudado = useMemo(
    () =>
      sucursal === "Todas"
        ? morosidad.totalRecaudado
        : pagos.reduce((acc, p) => acc + (p.monto || 0), 0),
    [sucursal, morosidad.totalRecaudado, pagos]
  );

  const totalEsperado = useMemo(() => {
    if (sucursal === "Todas") return morosidad.totalEsperado;
    if (!precios) return 0;
    const alumnosSuc = alumnos.filter((a) => a.sucursal === sucursal);
    return alumnosSuc.reduce(
      (acc, a) => acc + (precios[a.curso] ?? 0),
      0
    );
  }, [sucursal, morosidad.totalEsperado, precios, alumnos]);

  const pagoPorAlumnoId = useMemo(() => {
    const map = new Map<string, (typeof pagos)[number]>();
    for (const p of pagos) map.set(p.alumnoId, p);
    return map;
  }, [pagos]);

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
    const filas: Record<string, unknown>[] =
      tab === "alDia"
        ? alumnosAlDiaFiltrados.map((a) => {
            const pago = pagoPorAlumnoId.get(a.id);
            return {
              Nombre: a.nombre,
              Curso: a.curso,
              Sucursal: a.sucursal,
              Monto: pago?.monto ?? "",
              Fecha: pago?.fechaPago ?? "",
              Medio: pago?.medioPago ?? "",
              Comprobante: pago?.comprobanteUrl ?? "",
              Observación: pago?.observacion ?? "",
              Período: `${nombreMes(mes)} ${año}`,
            };
          })
        : alumnosConDeudaFiltrados.map((a) => ({
            Nombre: a.nombre,
            Curso: a.curso,
            Sucursal: a.sucursal,
            "Monto esperado": precios ? precios[a.curso] ?? 0 : "",
            Período: `${nombreMes(mes)} ${año}`,
          }));
    const sufijo = tab === "alDia" ? "al-dia" : "con-deuda";
    exportarAExcel(
      filas,
      `pagos-alumnos-${sufijo}-${año}-${String(mes).padStart(2, "0")}`
    );
    toast.info(`Exportadas ${filas.length} filas.`);
  };

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

  const porcentajeCobrado =
    totalEsperado > 0 ? Math.round((totalRecaudado / totalEsperado) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Pagos de Alumnos
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              Registro mensual y conciliación bancaria.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setModal({ type: "registrar" })}
          >
            Registrar pago
          </Button>
        </div>

        <Card className="!p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Mes"
              value={String(mes)}
              onChange={(e) => setMes(Number(e.target.value))}
              options={MESES_ES.map((m) => ({
                label: m.label,
                value: String(m.value),
              }))}
            />
            <Select
              label="Año"
              value={String(año)}
              onChange={(e) => setAño(Number(e.target.value))}
              options={añosDisponibles(new Date().getFullYear())}
            />
            <Select
              label="Sucursal"
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value as Sucursal | "Todas")}
              options={[
                { label: "Todas", value: "Todas" },
                ...SUCURSALES.map((s) => ({ label: s, value: s })),
              ]}
            />
          </div>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Total recaudado
            </p>
            <p className="text-2xl font-light text-emerald-600 mt-1">
              {formatCLP(totalRecaudado)}
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Total esperado
            </p>
            <p className="text-2xl font-light text-slate-900 mt-1">
              {formatCLP(totalEsperado)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {porcentajeCobrado}% cobrado
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Alumnos al día
            </p>
            <p className="text-2xl font-light text-emerald-600 mt-1">
              {alumnosAlDiaFiltrados.length}
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Alumnos con deuda
            </p>
            <p className="text-2xl font-light text-rose-600 mt-1">
              {alumnosConDeudaFiltrados.length}
            </p>
          </Card>
        </div>

        <Card className="!p-4">
          <div className="flex gap-2 overflow-x-auto hide-scroll mb-4">
            <button
              onClick={() => setTab("alDia")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1 md:flex-none ${
                tab === "alDia"
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              Al día ({alumnosAlDiaFiltrados.length})
            </button>
            <button
              onClick={() => setTab("conDeuda")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-1 md:flex-none ${
                tab === "conDeuda"
                  ? "bg-rose-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              Con deuda ({alumnosConDeudaFiltrados.length})
            </button>
          </div>

          {tab === "alDia" ? (
            <TablaAlDia
              alumnos={alumnosAlDiaFiltrados}
              pagoPorAlumnoId={pagoPorAlumnoId}
              montoPagadoPorAlumno={morosidad.montoPagadoPorAlumno}
              precios={precios}
              canExport={userRole === "director" || userRole === "admin"}
              onExport={handleExport}
              onVerHistorial={(alumno) =>
                setModal({ type: "historial", alumno })
              }
            />
          ) : (
            <TablaConDeuda
              alumnos={alumnosConDeudaFiltrados}
              parcialIds={morosidad.parcialIds}
              montoPagadoPorAlumno={morosidad.montoPagadoPorAlumno}
              precios={precios}
              canExport={userRole === "director" || userRole === "admin"}
              onExport={handleExport}
              onRegistrar={(alumnoId) =>
                setModal({ type: "registrar", alumnoPreseleccionadoId: alumnoId })
              }
              onVerHistorial={(alumno) =>
                setModal({ type: "historial", alumno })
              }
            />
          )}
        </Card>

        <p className="text-[11px] text-slate-400 text-center">
          Período: <b className="text-slate-600">{nombreMes(mes)} {año}</b>{" "}
          {sucursal !== "Todas" && (
            <>
              · Sucursal: <b className="text-slate-600">{sucursal}</b>
            </>
          )}
        </p>
      </div>

      {modal.type === "registrar" && (
        <Modal
          title="Registrar pago"
          onClose={() => setModal({ type: "none" })}
        >
          <RegistrarPagoModal
            alumnos={alumnos}
            precios={precios}
            registradoPor={username}
            alumnoPreseleccionadoId={modal.alumnoPreseleccionadoId}
            mesInicial={mes}
            añoInicial={año}
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
            onEdit={(pago) => setModal({ type: "editar", pago })}
          />
        </Modal>
      )}

      {modal.type === "editar" && (
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

function TablaAlDia({
  alumnos,
  pagoPorAlumnoId,
  montoPagadoPorAlumno,
  precios,
  canExport,
  onExport,
  onVerHistorial,
}: {
  alumnos: Alumno[];
  pagoPorAlumnoId: Map<string, import("@/lib/types").PagoAlumno>;
  montoPagadoPorAlumno: Map<string, number>;
  precios: import("@/lib/types").PreciosAlumnos | null;
  canExport: boolean;
  onExport: () => void;
  onVerHistorial: (a: Alumno) => void;
}) {
  type Row = Alumno & { __pago: import("@/lib/types").PagoAlumno | undefined };
  const filas: Row[] = alumnos.map((a) => ({
    ...a,
    __pago: pagoPorAlumnoId.get(a.id),
  }));
  const columns: SearchableTableColumn<Row>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (r) => <b className="text-slate-900">{r.nombre}</b>,
    },
    {
      key: "curso",
      header: "Curso",
      render: (r) => <span className="text-xs">{r.curso}</span>,
    },
    {
      key: "sucursal",
      header: "Sucursal",
      render: (r) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {r.sucursal}
        </span>
      ),
    },
    {
      key: "monto",
      header: "Monto",
      render: (r) => {
        const total = montoPagadoPorAlumno.get(r.id) ?? r.__pago?.monto ?? 0;
        return (
          <span className="text-sm font-bold text-emerald-600">
            {formatCLP(total)}
          </span>
        );
      },
    },
    {
      key: "estado",
      header: "Estado",
      render: (r) => {
        const tipo = r.__pago?.tipoPago ?? "Total";
        // Si hay UN solo pago Total: badge "Total". Si llegó a alumnosAlDia
        // por sumar varios parciales, mostramos "Completado por parciales".
        const precio = precios ? precios[r.curso] ?? 0 : 0;
        const pagado = montoPagadoPorAlumno.get(r.id) ?? 0;
        const completadoPorParciales =
          tipo !== "Total" && precio > 0 && pagado >= precio;
        if (completadoPorParciales) {
          return (
            <span
              className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest"
              title={`Saldo cubierto con ${formatCLP(pagado)} en pagos parciales`}
            >
              Completado por parciales
            </span>
          );
        }
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
            Total
          </span>
        );
      },
    },
    {
      key: "fecha",
      header: "Fecha",
      render: (r) => (
        <span className="text-xs text-slate-500">{r.__pago?.fechaPago ?? "—"}</span>
      ),
    },
    {
      key: "medio",
      header: "Medio",
      render: (r) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {r.__pago?.medioPago ?? "—"}
        </span>
      ),
    },
    {
      key: "comprobante",
      header: "Comp.",
      render: (r) =>
        r.__pago?.comprobanteUrl ? (
          <a
            href={r.__pago.comprobanteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 font-bold underline text-xs"
          >
            Ver
          </a>
        ) : (
          <span className="text-slate-400 italic text-xs">—</span>
        ),
    },
    {
      key: "acciones",
      header: <span className="block text-right">Acciones</span>,
      tdClassName: "text-right",
      render: (r) => (
        <Button
          variant="outline"
          className="!px-3 !py-2 text-xs"
          onClick={() => onVerHistorial(r)}
        >
          Ver pagos
        </Button>
      ),
    },
  ];
  return (
    <SearchableTable
      data={filas}
      columns={columns}
      rowKey={(r) => r.id}
      searchableFields={(r) =>
        `${r.nombre} ${r.curso} ${r.sucursal} ${r.__pago?.medioPago ?? ""}`
      }
      searchPlaceholder="Buscar por nombre, curso, sucursal..."
      minWidth="900px"
      emptyBaseMessage="Aún no hay pagos registrados con los filtros actuales."
      toolbar={
        canExport && filas.length > 0 ? (
          <Button
            variant="outline"
            className="!px-3 !py-2 text-xs"
            onClick={onExport}
          >
            Exportar Excel
          </Button>
        ) : undefined
      }
    />
  );
}

function TablaConDeuda({
  alumnos,
  parcialIds,
  montoPagadoPorAlumno,
  precios,
  canExport,
  onExport,
  onRegistrar,
  onVerHistorial,
}: {
  alumnos: Alumno[];
  parcialIds: Set<string>;
  montoPagadoPorAlumno: Map<string, number>;
  precios: import("@/lib/types").PreciosAlumnos | null;
  canExport: boolean;
  onExport: () => void;
  onRegistrar: (alumnoId: string) => void;
  onVerHistorial: (a: Alumno) => void;
}) {
  if (alumnos.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-emerald-600 font-medium bg-emerald-50 rounded-2xl border border-emerald-100">
        🎉 Todos los alumnos están al día este mes.
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
          {parcialIds.has(a.id) && (
            <span
              className="self-start bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-widest"
              title="Tiene pagos parciales sin cubrir el precio"
            >
              Parcial
            </span>
          )}
        </div>
      ),
    },
    {
      key: "curso",
      header: "Curso",
      render: (a) => <span className="text-xs">{a.curso}</span>,
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
      key: "monto",
      header: "Monto esperado",
      render: (a) => (
        <span className="text-sm font-bold text-slate-700">
          {precios ? formatCLP(precios[a.curso] ?? 0) : "—"}
        </span>
      ),
    },
    {
      key: "saldo",
      header: "Pagado / Saldo",
      render: (a) => {
        const precio = precios ? precios[a.curso] ?? 0 : 0;
        const pagado = montoPagadoPorAlumno.get(a.id) ?? 0;
        const saldo = Math.max(0, precio - pagado);
        if (pagado === 0) {
          return (
            <span className="text-xs text-slate-400 italic">Sin abonos</span>
          );
        }
        return (
          <span className="text-xs">
            <b className="text-emerald-600">{formatCLP(pagado)}</b>
            <span className="text-slate-300"> / </span>
            <b className="text-rose-600">{formatCLP(saldo)}</b>
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
            onClick={() => onVerHistorial(a)}
          >
            Historial
          </Button>
          <Button
            variant="primary"
            className="!px-3 !py-2 text-xs"
            onClick={() => onRegistrar(a.id)}
          >
            Registrar pago
          </Button>
        </div>
      ),
    },
  ];
  return (
    <SearchableTable
      data={alumnos}
      columns={columns}
      rowKey={(a) => a.id}
      searchableFields={(a) => `${a.nombre} ${a.curso} ${a.sucursal}`}
      searchPlaceholder="Buscar por nombre, curso, sucursal..."
      minWidth="780px"
      toolbar={
        canExport && alumnos.length > 0 ? (
          <Button
            variant="outline"
            className="!px-3 !py-2 text-xs"
            onClick={onExport}
          >
            Exportar Excel
          </Button>
        ) : undefined
      }
    />
  );
}
