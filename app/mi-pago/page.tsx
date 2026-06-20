"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import InstructorBottomNav from "@/components/dashboard/InstructorBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useMiPago } from "@/hooks/useMiPago";
import { useMiPerfil } from "@/hooks/useMiPerfil";
import { formatCLP, MESES_ES, nombreMes } from "@/lib/format";

function hoyMesAño(): { mes: number; año: number } {
  const d = new Date();
  return { mes: d.getMonth() + 1, año: d.getFullYear() };
}

export default function MiPagoPage() {
  const router = useRouter();
  const { user, userRole, isLoading: authLoading } = useAuth();
  const { perfil, isLoading: perfilLoading } = useMiPerfil();

  // Guard: solo instructores.
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

  const inicial = hoyMesAño();
  const [mes, setMes] = useState<number>(inicial.mes);
  const [año, setAño] = useState<number>(inicial.año);

  const { pago, isLoading } = useMiPago(mes, año);

  const opcionesAño = useMemo(() => {
    const actual = new Date().getFullYear();
    const opts: { label: string; value: string }[] = [];
    for (let y = actual - 2; y <= actual + 1; y++) {
      opts.push({ label: String(y), value: String(y) });
    }
    return opts;
  }, []);

  if (authLoading || perfilLoading || !user || userRole !== "instructor") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />

        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
            Mi Pago del Mes
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">
            {perfil?.nombreCompleto} · Sucursal{" "}
            <b className="text-slate-700">{perfil?.sucursalActual}</b>
          </p>
          <p className="text-[11px] text-slate-400 italic mt-1">
            El monto se actualiza automáticamente con cada asistencia que
            registres.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="w-44">
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
          <div className="w-32">
            <Select
              label="Año"
              value={String(año)}
              onChange={(e) => setAño(Number(e.target.value))}
              options={opcionesAño}
            />
          </div>
        </div>

        {/* Tarjeta total grande */}
        <Card className="bg-slate-900 text-white border-none shadow-2xl shadow-slate-900/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Total {nombreMes(mes)} {año}
          </p>
          {isLoading ? (
            <div className="py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
            </div>
          ) : (
            <p className="text-5xl md:text-6xl font-light mt-3">
              {formatCLP(pago?.totalCLP ?? 0)}
            </p>
          )}
          {pago && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-slate-800 p-3 rounded-2xl">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Días trabajados
                </p>
                <p className="text-2xl font-light mt-1">
                  {pago.diasTrabajados}
                </p>
              </div>
              <div className="bg-slate-800 p-3 rounded-2xl">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Alumnos atendidos
                </p>
                <p className="text-2xl font-light mt-1">
                  {pago.alumnosAsistidos}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Desglose por día — modelo escalado del instructor */}
        {pago && (
          <Card
            title="Desglose por día"
            subtitle={`${pago.desgloseDias?.length ?? 0} día${(pago.desgloseDias?.length ?? 0) === 1 ? "" : "s"} con asistencias`}
          >
            {!pago.desgloseDias || pago.desgloseDias.length === 0 ? (
              <p className="text-xs text-slate-400 italic mt-3">
                Sin asistencias registradas este mes.
              </p>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <th className="pb-3 pr-3">Fecha</th>
                      <th className="pb-3 pr-3 text-center">Alumnos</th>
                      <th className="pb-3 pr-3 text-center">Cálculo</th>
                      <th className="pb-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pago.desgloseDias.map((d) => (
                      <tr
                        key={d.fecha}
                        className="border-b border-slate-50"
                      >
                        <td className="py-3 pr-3 font-mono text-slate-700 text-xs">
                          {d.fecha}
                        </td>
                        <td className="py-3 pr-3 text-center">
                          <b className="text-slate-900">{d.alumnos}</b>
                        </td>
                        <td className="py-3 pr-3 text-center text-[11px] text-slate-500">
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
                        <td className="py-3 text-right">
                          <b className="text-slate-900">{formatCLP(d.total)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
      <InstructorBottomNav />
    </div>
  );
}
