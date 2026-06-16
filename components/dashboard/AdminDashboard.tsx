"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import CertificacionesBanner from "@/components/dashboard/CertificacionesBanner";
import { useEstadoMorosidad } from "@/hooks/useEstadoMorosidad";
import { useAusenciasDelMes } from "@/hooks/useAusenciasDelMes";
import { formatCLP, nombreMes } from "@/lib/format";

export default function AdminDashboard() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const año = hoy.getFullYear();
  const morosidad = useEstadoMorosidad(mes, año);
  const { ausencias, isLoading: ausenciasLoading } = useAusenciasDelMes(
    mes,
    año
  );
  const [verTodasAusencias, setVerTodasAusencias] = useState(false);
  const ausenciasAMostrar = ausencias.slice(0, 10);

  const porcentajeCobrado =
    morosidad.totalEsperado > 0
      ? Math.round((morosidad.totalRecaudado / morosidad.totalEsperado) * 100)
      : 0;

  return (
    <div className="space-y-6 md:space-y-8 animate-[fadeIn_0.3s_ease]">
      <div className="header-top flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900">
            Panel de Administración 💰
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">
            Pagos de alumnos y conciliación bancaria
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/alumnos">
            <Button variant="outline">Ver alumnos</Button>
          </Link>
          <Link href="/instructores">
            <Button variant="outline">Ver Instructores</Button>
          </Link>
          <Link href="/pagos-alumnos">
            <Button variant="primary">Pagos de Alumnos</Button>
          </Link>
          <Link href="/pagos">
            <Button variant="outline">Pagos del Mes</Button>
          </Link>
        </div>
      </div>

      {morosidad.error && (
        <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {morosidad.error}
        </div>
      )}

      <CertificacionesBanner />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card
          title="Estado Financiero Global"
          subtitle={`Recaudación · ${nombreMes(mes)} ${año}`}
        >
          {morosidad.isLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              <div className="bg-slate-900 text-white p-4 rounded-2xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Total recaudado este mes
                </p>
                <p className="text-3xl font-light mt-1">
                  {formatCLP(morosidad.totalRecaudado)}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Esperado: {formatCLP(morosidad.totalEsperado)} ·{" "}
                  <b className="text-white">{porcentajeCobrado}%</b> cobrado
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-emerald-700">
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    Alumnos al día
                  </p>
                  <p className="text-2xl font-light">
                    {morosidad.alumnosAlDia.length}
                  </p>
                </div>
                <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-rose-700">
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    Con deuda
                  </p>
                  <p className="text-2xl font-light">
                    {morosidad.alumnosConDeuda.length}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Alumnos con deuda" subtitle="Pendientes este mes">
          <div className="space-y-2 mt-4 max-h-72 overflow-y-auto hide-scroll pr-2">
            {morosidad.isLoading ? (
              <div className="py-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
              </div>
            ) : morosidad.alumnosConDeuda.length === 0 ? (
              <p className="text-sm text-emerald-500 font-medium bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                ✅ Todos los alumnos están al día.
              </p>
            ) : (
              morosidad.alumnosConDeuda.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl text-xs md:text-sm flex justify-between items-center border bg-rose-50 text-rose-700 border-rose-100"
                >
                  <div className="flex flex-col truncate pr-2">
                    <b>{a.nombre}</b>
                    <span className="text-[10px] uppercase tracking-widest text-rose-400">
                      {a.curso} · {a.sucursal}
                    </span>
                  </div>
                  <Link
                    href={`/pagos-alumnos?alumno=${a.id}`}
                    className="flex-shrink-0"
                  >
                    <span className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors px-3 py-1.5 rounded-lg text-[11px] font-bold">
                      Registrar pago
                    </span>
                  </Link>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Ausencias del Mes"
        subtitle={`${ausencias.length} ausencia${ausencias.length === 1 ? "" : "s"} · justifica por qué un profesional cobra menos`}
        action={
          ausencias.length > 10 ? (
            <Button
              variant="outline"
              className="!px-3 !py-2 text-xs"
              onClick={() => setVerTodasAusencias(true)}
            >
              Ver todas
            </Button>
          ) : undefined
        }
      >
        {ausenciasLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : ausencias.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium bg-emerald-50 p-3 rounded-xl border border-emerald-100 mt-4">
            ✅ Sin ausencias registradas este mes.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <AusenciasTabla data={ausenciasAMostrar} />
            {ausencias.length > 10 && (
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Mostrando las 10 más recientes de {ausencias.length}.
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card
          title="Pagos a Profes Guías"
          subtitle="Días trabajados por liquidar"
        >
          <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm text-slate-500">
            Entra a{" "}
            <Link href="/pagos" className="text-brand-500 font-bold underline">
              Pagos del Mes
            </Link>{" "}
            para ver el detalle por profe guía con monto a pagar.
          </div>
        </Card>

        <Card title="Conciliación bancaria" subtitle="Resumen del mes">
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Total recaudado</span>
              <b className="text-emerald-600">
                {formatCLP(morosidad.totalRecaudado)}
              </b>
            </div>
            <div className="flex justify-between">
              <span>Total esperado</span>
              <b className="text-slate-900">
                {formatCLP(morosidad.totalEsperado)}
              </b>
            </div>
            <div className="flex justify-between">
              <span>Diferencia</span>
              <b className="text-rose-600">
                {formatCLP(
                  Math.max(0, morosidad.totalEsperado - morosidad.totalRecaudado)
                )}
              </b>
            </div>
            <p className="pt-2 text-[11px] text-slate-400 border-t border-slate-100">
              Para el detalle banco-por-pago entra a{" "}
              <Link
                href="/pagos-alumnos"
                className="text-brand-500 font-bold underline"
              >
                Pagos de Alumnos
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>

      {verTodasAusencias && (
        <Modal
          title={`Ausencias de ${nombreMes(mes)} ${año}`}
          onClose={() => setVerTodasAusencias(false)}
        >
          <div className="max-h-[65vh] overflow-y-auto hide-scroll">
            <AusenciasTabla data={ausencias} compact />
          </div>
        </Modal>
      )}
    </div>
  );
}

function AusenciasTabla({
  data,
  compact = false,
}: {
  data: import("@/hooks/useAusenciasDelMes").AusenciaResuelta[];
  compact?: boolean;
}) {
  return (
    <table className={`w-full text-sm ${compact ? "min-w-[560px]" : "min-w-[640px]"}`}>
      <thead>
        <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
          <th className="pb-3 pr-3">Fecha</th>
          <th className="pb-3 pr-3">Alumno</th>
          <th className="pb-3 pr-3">Sucursal · Curso</th>
          <th className="pb-3 pr-3">Profesional a cargo</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr
            key={row.asistencia.id}
            className="border-b border-slate-50 hover:bg-slate-50/50"
          >
            <td className="py-3 pr-3 font-mono text-xs text-slate-700">
              {row.asistencia.fecha}
            </td>
            <td className="py-3 pr-3">
              <b className="text-slate-900">{row.alumnoNombre}</b>
            </td>
            <td className="py-3 pr-3 text-xs text-slate-500">
              {row.asistencia.sucursal} · {row.asistencia.curso}
            </td>
            <td className="py-3 pr-3 text-xs">
              <span className="font-bold text-slate-700">
                {row.profesionalNombre}
              </span>
              {row.profesionalRol !== "sin-asignar" && (
                <span className="ml-1 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  ·{" "}
                  {row.profesionalRol === "instructor"
                    ? "instructor"
                    : "profe guía"}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
