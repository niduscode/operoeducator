"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { usePagosInstructores } from "@/hooks/usePagosInstructores";
import { usePagosProfesGuias } from "@/hooks/usePagosProfesGuias";
import { usePagosRealizados } from "@/hooks/usePagosRealizados";
import type { PagoCalculado, PagoRealizado } from "@/lib/types";
import { CURSOS, emailToUsername } from "@/lib/types";
import { formatCLP, MESES_ES, nombreMes } from "@/lib/format";
import { calcularRecaudacionAlumnos } from "@/lib/firestore";
import { exportarAExcel } from "@/lib/export";

function hoyMesAño(): { mes: number; año: number } {
  const d = new Date();
  return { mes: d.getMonth() + 1, año: d.getFullYear() };
}

export default function PagosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const username = userEmail ? emailToUsername(userEmail) : "";

  const exportar = (
    pagos: PagoCalculado[],
    tipo: "instructores" | "profes-guias",
    mes: number,
    año: number
  ) => {
    if (pagos.length === 0) {
      toast.warning("No hay datos para exportar.");
      return;
    }
    const filas = pagos.map((p) => ({
      Nombre: p.personaNombre,
      Sucursal: p.sucursal,
      "Días trabajados": p.diasTrabajados,
      "Junior · alumnos": p.detallePorCurso.Junior.alumnosAsistidos,
      "Junior · subtotal": p.detallePorCurso.Junior.subtotal,
      "Senior · alumnos": p.detallePorCurso.Senior.alumnosAsistidos,
      "Senior · subtotal": p.detallePorCurso.Senior.subtotal,
      "Master · alumnos": p.detallePorCurso.Master.alumnosAsistidos,
      "Master · subtotal": p.detallePorCurso.Master.subtotal,
      "Total CLP": p.totalCLP,
      Período: `${nombreMes(mes)} ${año}`,
    }));
    exportarAExcel(
      filas,
      `pagos-${tipo}-${año}-${String(mes).padStart(2, "0")}`
    );
    toast.info(`Exportadas ${filas.length} filas.`);
  };

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

  const inicial = hoyMesAño();
  const [mes, setMes] = useState<number>(inicial.mes);
  const [año, setAño] = useState<number>(inicial.año);

  const {
    pagos: pagosInstructores,
    isLoading: loadingInst,
    totalAPagar: totalInstructores,
  } = usePagosInstructores(mes, año);
  const {
    pagos: pagosProfes,
    isLoading: loadingProfes,
    totalAPagar: totalProfes,
  } = usePagosProfesGuias(mes, año);

  // La recaudación es one-shot (no reactiva); la recargamos cuando cambia mes/año.
  const [recaudacion, setRecaudacion] = useState<{
    totalCLP: number;
    alumnosAlDia: number;
    alumnosConDeuda: number;
  } | null>(null);
  const [loadingRec, setLoadingRec] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingRec(true);
    calcularRecaudacionAlumnos(mes, año)
      .then((data) => {
        if (!cancelled) setRecaudacion(data);
      })
      .catch((err) => {
        console.error("recaudación:", err);
        if (!cancelled) setRecaudacion(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRec(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mes, año]);

  const [detalle, setDetalle] = useState<PagoCalculado | null>(null);

  // Pagos ya realizados (registro manual del director/admin) — alimenta los
  // botones "Marcar Pagado" / badge ✅ y la alerta de pagos pendientes.
  const {
    buscar: buscarRealizado,
    marcar: marcarRealizado,
    desmarcar: desmarcarRealizado,
  } = usePagosRealizados(mes, año);

  // Alerta: si hoy ya pasó el día 5 del mes SIGUIENTE al mes calculado, y
  // hay personas sin marcar como pagadas, mostrar banner.
  // En JS new Date(año, mes, 5) con `mes` 1-indexed equivale al 5 del mes
  // siguiente (porque el constructor toma el mes 0-indexed). Ej: mes=4 →
  // Date(año, 4, 5) = mayo 5.
  const pendientesAlerta = useMemo(() => {
    const limite = new Date(año, mes, 5);
    const hoy = new Date();
    if (hoy < limite) return null;
    const todos: PagoCalculado[] = [...pagosInstructores, ...pagosProfes];
    const pendientes = todos.filter(
      (p) => p.totalCLP > 0 && !buscarRealizado(p.tipo, p.personaId)
    );
    if (pendientes.length === 0) return null;
    return pendientes;
  }, [pagosInstructores, pagosProfes, buscarRealizado, mes, año]);

  const handleMarcarPagado = async (p: PagoCalculado) => {
    const ok = await confirm({
      title: "¿Marcar como Pagado?",
      message: (
        <>
          Vas a registrar el pago de{" "}
          <b>
            {p.personaNombre} — {nombreMes(mes)} {año}
          </b>{" "}
          por <b>{formatCLP(p.totalCLP)}</b>.
        </>
      ),
      confirmLabel: "Marcar Pagado",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await marcarRealizado({
        tipo: p.tipo,
        personaId: p.personaId,
        personaNombre: p.personaNombre,
        sucursal: p.sucursal,
        mes,
        año,
        monto: p.totalCLP,
        fechaPago: new Date().toISOString().split("T")[0],
        pagadoPor: username || "desconocido",
      });
      toast.success("Pago marcado como realizado.");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo marcar el pago."
      );
    }
  };

  const handleDesmarcarPagado = async (p: PagoRealizado) => {
    const ok = await confirm({
      title: "¿Deshacer el pago?",
      message: (
        <>
          Vas a borrar el registro de pago de <b>{p.personaNombre}</b> de{" "}
          <b>
            {nombreMes(p.mes)} {p.año}
          </b>
          . El cálculo del mes se mantiene intacto.
        </>
      ),
      confirmLabel: "Deshacer",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await desmarcarRealizado(p.id);
      toast.info("Pago desmarcado.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo deshacer el pago.");
    }
  };

  const opcionesAño = useMemo(() => {
    const actual = new Date().getFullYear();
    const opts: { label: string; value: string }[] = [];
    for (let y = actual - 2; y <= actual + 1; y++) {
      opts.push({ label: String(y), value: String(y) });
    }
    return opts;
  }, []);

  if (authLoading || !user || (userRole !== "director" && userRole !== "admin")) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Pagos del Mes
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              Cálculo automático en base a las asistencias registradas.
            </p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="w-40">
              <Select
                label="Mes"
                value={String(mes)}
                onChange={(e) => setMes(Number(e.target.value))}
                options={MESES_ES.map((m) => ({
                  label: m.label,
                  value: String(m.value),
                }))}
              />
            </div>
            <div className="w-28">
              <Select
                label="Año"
                value={String(año)}
                onChange={(e) => setAño(Number(e.target.value))}
                options={opcionesAño}
              />
            </div>
          </div>
        </div>

        {pendientesAlerta && pendientesAlerta.length > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 shadow-sm">
            <p className="text-sm font-bold">
              ⚠️ Pago pendiente con:{" "}
              <span className="font-normal">
                {pendientesAlerta.map((p) => p.personaNombre).join(", ")}
              </span>{" "}
              del mes de{" "}
              <b>
                {nombreMes(mes)} {año}
              </b>
              .
            </p>
            <p className="text-[11px] text-rose-600 mt-1">
              Han pasado más de 5 días del mes siguiente y aún no se ha
              registrado el pago.
            </p>
          </div>
        )}

        {/* 3 tarjetas resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ResumenCard
            title="Total a pagar instructores"
            valor={totalInstructores}
            color="brand"
            loading={loadingInst}
            subtitle={`${pagosInstructores.length} instructor${pagosInstructores.length === 1 ? "" : "es"}`}
          />
          <ResumenCard
            title="Total a pagar profes guías"
            valor={totalProfes}
            color="amber"
            loading={loadingProfes}
            subtitle={`${pagosProfes.length} profe${pagosProfes.length === 1 ? "" : "s"}`}
          />
          <ResumenCard
            title="Total recaudado de alumnos"
            valor={recaudacion?.totalCLP ?? 0}
            color="emerald"
            loading={loadingRec}
            subtitle={
              recaudacion
                ? `${recaudacion.alumnosAlDia} al día · ${recaudacion.alumnosConDeuda} con deuda`
                : "—"
            }
          />
        </div>

        <Card
          title="Pagos a Instructores"
          subtitle={`${nombreMes(mes)} ${año}`}
          action={
            pagosInstructores.length > 0 ? (
              <Button
                variant="outline"
                className="!px-3 !py-2 text-xs"
                onClick={() => exportar(pagosInstructores, "instructores", mes, año)}
              >
                Exportar Excel
              </Button>
            ) : undefined
          }
        >
          <PagosTable
            pagos={pagosInstructores}
            loading={loadingInst}
            onRowClick={(p) => setDetalle(p)}
            buscarRealizado={buscarRealizado}
            onMarcarPagado={handleMarcarPagado}
            onDesmarcar={handleDesmarcarPagado}
          />
        </Card>

        <Card
          title="Pagos a Profes Guías"
          subtitle={`${nombreMes(mes)} ${año}`}
          action={
            pagosProfes.length > 0 ? (
              <Button
                variant="outline"
                className="!px-3 !py-2 text-xs"
                onClick={() => exportar(pagosProfes, "profes-guias", mes, año)}
              >
                Exportar Excel
              </Button>
            ) : undefined
          }
        >
          <PagosTable
            pagos={pagosProfes}
            loading={loadingProfes}
            onRowClick={(p) => setDetalle(p)}
            buscarRealizado={buscarRealizado}
            onMarcarPagado={handleMarcarPagado}
            onDesmarcar={handleDesmarcarPagado}
          />
        </Card>
      </div>

      {detalle && (
        <DetalleModal pago={detalle} onClose={() => setDetalle(null)} />
      )}
    </div>
  );
}

function ResumenCard({
  title,
  valor,
  color,
  loading,
  subtitle,
}: {
  title: string;
  valor: number;
  color: "brand" | "emerald" | "amber";
  loading: boolean;
  subtitle?: string;
}) {
  const palette: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <div
      className={`p-5 rounded-3xl border shadow-sm ${palette[color]}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        {title}
      </p>
      {loading ? (
        <div className="py-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
        </div>
      ) : (
        <p className="text-3xl font-light mt-2">{formatCLP(valor)}</p>
      )}
      {subtitle && (
        <p className="text-[11px] opacity-70 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function formatFechaPago(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CL");
  } catch {
    return iso;
  }
}

function PagosTable({
  pagos,
  loading,
  onRowClick,
  buscarRealizado,
  onMarcarPagado,
  onDesmarcar,
}: {
  pagos: PagoCalculado[];
  loading: boolean;
  onRowClick: (p: PagoCalculado) => void;
  buscarRealizado: (
    tipo: "instructor" | "profeGuia",
    personaId: string
  ) => PagoRealizado | undefined;
  onMarcarPagado: (p: PagoCalculado) => Promise<void>;
  onDesmarcar: (p: PagoRealizado) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }
  if (pagos.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        No hay datos para este mes.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
            <th className="pb-3 pr-3">Nombre</th>
            <th className="pb-3 pr-3">Sucursal</th>
            <th className="pb-3 pr-3 text-center">Días</th>
            {CURSOS.map((c) => (
              <th key={c} className="pb-3 pr-3 text-center">
                {c}
              </th>
            ))}
            <th className="pb-3 text-right">Total</th>
            <th className="pb-3 text-right">Estado</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((p) => {
            const realizado = buscarRealizado(p.tipo, p.personaId);
            return (
              <tr
                key={p.personaId}
                className="border-b border-slate-50 hover:bg-slate-50"
              >
                <td
                  className="py-3 pr-3 cursor-pointer"
                  onClick={() => onRowClick(p)}
                >
                  <b className="text-slate-900">{p.personaNombre}</b>
                </td>
                <td className="py-3 pr-3 text-xs text-slate-500">
                  {p.sucursal}
                </td>
                <td
                  className="py-3 pr-3 text-center cursor-pointer"
                  onClick={() => onRowClick(p)}
                >
                  <span className="font-bold text-slate-900">
                    {p.diasTrabajados}
                  </span>
                </td>
                {CURSOS.map((c) => (
                  <td
                    key={c}
                    className="py-3 pr-3 text-center text-xs text-slate-600 cursor-pointer"
                    onClick={() => onRowClick(p)}
                  >
                    {p.detallePorCurso[c].alumnosAsistidos}
                  </td>
                ))}
                <td
                  className="py-3 text-right cursor-pointer"
                  onClick={() => onRowClick(p)}
                >
                  <span className="font-bold text-slate-900">
                    {formatCLP(p.totalCLP)}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {realizado ? (
                    <button
                      type="button"
                      onClick={() => onDesmarcar(realizado)}
                      className="text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                      title="Click para deshacer el pago"
                    >
                      ✅ Pagado{" "}
                      {realizado.fechaPago &&
                        `· ${formatFechaPago(realizado.fechaPago)}`}
                    </button>
                  ) : (
                    <Button
                      variant="primary"
                      className="!px-3 !py-1.5 text-[11px]"
                      disabled={p.totalCLP <= 0}
                      onClick={() => onMarcarPagado(p)}
                    >
                      Marcar Pagado
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetalleModal({
  pago,
  onClose,
}: {
  pago: PagoCalculado;
  onClose: () => void;
}) {
  const esInstructor = pago.tipo === "instructor";
  return (
    <Modal
      title={`${pago.personaNombre} — ${nombreMes(pago.mes)} ${pago.año}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Sucursal
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">
              {pago.sucursal}
            </p>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Días trabajados
            </p>
            <p className="text-sm font-bold text-slate-900 mt-1">
              {pago.diasTrabajados}
            </p>
          </div>
        </div>

        {esInstructor ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Desglose por día (modelo escalado)
            </p>
            {!pago.desgloseDias || pago.desgloseDias.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Sin asistencias registradas en el mes.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[380px]">
                  <thead>
                    <tr className="text-left text-[9px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <th className="pb-2 pr-2">Fecha</th>
                      <th className="pb-2 pr-2 text-center">Alumnos</th>
                      <th className="pb-2 pr-2 text-center">Cálculo</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pago.desgloseDias.map((d) => (
                      <tr key={d.fecha} className="border-b border-slate-50">
                        <td className="py-2 pr-2 font-mono text-slate-700">
                          {d.fecha}
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <b className="text-slate-900">{d.alumnos}</b>
                        </td>
                        <td className="py-2 pr-2 text-center text-[10px] text-slate-500">
                          {d.alumnos > 0 ? (
                            <>
                              {formatCLP(d.montoPrimero)}
                              {d.alumnos > 1 && (
                                <>
                                  {" + "}
                                  {d.alumnos - 1}×{formatCLP(d.montoAdicional)}
                                </>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <b className="text-slate-900">
                            {formatCLP(d.total)}
                          </b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Desglose por curso
              </p>
              <div className="space-y-2">
                {CURSOS.map((c) => {
                  const d = pago.detallePorCurso[c];
                  return (
                    <div
                      key={c}
                      className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs"
                    >
                      <span className="font-bold text-slate-700">{c}</span>
                      <span className="text-slate-500">
                        {d.alumnosAsistidos} × {formatCLP(d.tarifa)}
                      </span>
                      <b className="text-slate-900">{formatCLP(d.subtotal)}</b>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Días con asistencias registradas ({pago.diasDetalle.length})
              </p>
              {pago.diasDetalle.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Sin asistencias registradas en el mes.
                </p>
              ) : (
                <ul className="max-h-40 overflow-y-auto hide-scroll space-y-1">
                  {pago.diasDetalle.map((d) => (
                    <li
                      key={d.fecha}
                      className="flex justify-between text-xs text-slate-600 px-2 py-1 rounded-lg"
                    >
                      <span className="font-mono">{d.fecha}</span>
                      <span>
                        <b>{d.alumnos}</b> alumno{d.alumnos === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Total a pagar
          </span>
          <span className="text-2xl font-light">{formatCLP(pago.totalCLP)}</span>
        </div>
      </div>
    </Modal>
  );
}
