"use client";

import Link from "next/link";
import { useMemo } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CertificacionesBanner from "@/components/dashboard/CertificacionesBanner";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEstadoMorosidad } from "@/hooks/useEstadoMorosidad";
import { useInstructores } from "@/hooks/useInstructores";
import { Curso, Instructor, SUCURSALES, Sucursal } from "@/lib/types";
import { formatCLP, nombreMes } from "@/lib/format";

const CURSOS: Curso[] = ["Junior", "Senior", "Master"];

export default function DirectorDashboard() {
  const { alumnos, isLoading, error } = useAlumnos();
  const { instructores } = useInstructores();

  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const año = hoy.getFullYear();
  const morosidad = useEstadoMorosidad(mes, año);

  const idsAlDia = useMemo(
    () => new Set(morosidad.alumnosAlDia.map((a) => a.id)),
    [morosidad.alumnosAlDia]
  );

  const instructoresPorSucursal = useMemo(() => {
    const map: Record<Sucursal, Instructor[]> = {
      "Puerto Montt": [],
      Osorno: [],
      Valdivia: [],
      Temuco: [],
    };
    for (const i of instructores) {
      if (!i.activo) continue;
      const arr = map[i.sucursalActual];
      if (arr) arr.push(i);
    }
    return map;
  }, [instructores]);

  const porcentajeCobrado =
    morosidad.totalEsperado > 0
      ? Math.round(
          (morosidad.totalRecaudado / morosidad.totalEsperado) * 100
        )
      : 0;

  return (
    <div className="space-y-6 md:space-y-8 animate-[fadeIn_0.3s_ease]">
      <div className="header-top flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900">
            Panel de Director 📈
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">
            Visión General de la Academia Central
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link href="/alumnos">
            <Button variant="outline">Ver alumnos</Button>
          </Link>
          <Link href="/instructores">
            <Button variant="outline">Ver Instructores</Button>
          </Link>
          <Link href="/profes-guias">
            <Button variant="outline">Profes Guías</Button>
          </Link>
          <Link href="/temario">
            <Button variant="outline">Temario</Button>
          </Link>
          <Link href="/pagos-alumnos">
            <Button variant="primary">Pagos de Alumnos</Button>
          </Link>
          <Link href="/pagos">
            <Button variant="outline">Pagos del Mes</Button>
          </Link>
          <Link href="/configuracion/precios-alumnos">
            <Button variant="outline">Precios</Button>
          </Link>
          <Link href="/configuracion/pagos">
            <Button variant="outline">Config Pagos</Button>
          </Link>
          <Link href="/admin/usuarios">
            <Button variant="outline">Usuarios</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {error}
        </div>
      )}

      <CertificacionesBanner />

      {/* ---------- Sucursales ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {SUCURSALES.map((sucursal) => {
          const alumnosSuc = alumnos.filter((a) => a.sucursal === sucursal);
          const counts = CURSOS.map(
            (c) => alumnosSuc.filter((a) => a.curso === c).length
          );
          const total = alumnosSuc.length;
          const alDia = alumnosSuc.filter((a) => idsAlDia.has(a.id)).length;
          const conDeuda = total - alDia;
          const instructoresSuc = instructoresPorSucursal[sucursal] ?? [];
          return (
            <Card
              key={sucursal}
              className="border-t-4 border-brand-500 !p-4"
            >
              <h4
                className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 truncate"
                title={sucursal}
              >
                Sucursal: {sucursal}
              </h4>
              <div className="space-y-2 text-sm text-slate-700">
                {CURSOS.map((c, i) => (
                  <div
                    key={c}
                    className="flex justify-between items-center"
                  >
                    <span className="opacity-80">{c}:</span>
                    <b className="text-slate-900">{counts[i]} activos</b>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                    Total alumnos
                  </span>
                  <b className="text-brand-500">{total}</b>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                    Pago mes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <b className="text-emerald-600">{alDia} al día</b>
                    <span className="text-slate-300">/</span>
                    <b
                      className={
                        conDeuda > 0 ? "text-rose-600" : "text-slate-400"
                      }
                    >
                      {conDeuda} con deuda
                    </b>
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                    Instructores
                  </span>
                  <b
                    className={
                      instructoresSuc.length === 0
                        ? "text-slate-400"
                        : "text-slate-900"
                    }
                  >
                    {instructoresSuc.length} activo
                    {instructoresSuc.length === 1 ? "" : "s"}
                  </b>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---------- Estado Financiero del Mes ---------- */}
      <Card
        title="Estado Financiero del Mes"
        subtitle={`${nombreMes(mes)} ${año}`}
      >
        {isLoading || morosidad.isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            <div className="bg-slate-900 text-white p-4 rounded-2xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Recaudado vs esperado · {porcentajeCobrado}% cobrado
              </p>
              <p className="text-2xl font-light mt-1">
                {formatCLP(morosidad.totalRecaudado)}
                <span className="text-slate-400 text-sm font-normal">
                  {" "}
                  / {formatCLP(morosidad.totalEsperado)}
                </span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-emerald-700">
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  Alumnos al día
                </p>
                <p className="text-3xl font-light">
                  {morosidad.alumnosAlDia.length}
                </p>
              </div>
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-rose-700">
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  Con deuda
                </p>
                <p className="text-3xl font-light">
                  {morosidad.alumnosConDeuda.length}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
