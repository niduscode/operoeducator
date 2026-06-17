"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useConfigPagos } from "@/hooks/useConfigPagos";
import {
  CURSOS,
  TarifasPorCurso,
  emailToUsername,
} from "@/lib/types";
import { formatCLP } from "@/lib/format";

const TARIFAS_VACIAS: TarifasPorCurso = { Junior: 0, Senior: 0, Master: 0 };

export default function ConfigPagosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const { config, isLoading: configLoading, save } = useConfigPagos();

  // Guard: solo director.
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

  const directorUsername = useMemo(
    () => (userEmail ? emailToUsername(userEmail) : ""),
    [userEmail]
  );

  // Modelo NUEVO por curso: 3 pares (primero, adicional) — uno por curso.
  type Par = { primero: number; adicional: number };
  type MontosCurso = { Junior: Par; Senior: Par; Master: Par };
  const MONTOS_VACIOS: MontosCurso = {
    Junior: { primero: 0, adicional: 0 },
    Senior: { primero: 0, adicional: 0 },
    Master: { primero: 0, adicional: 0 },
  };
  const [montosInstructor, setMontosInstructor] = useState<MontosCurso>(MONTOS_VACIOS);
  // Modelo legacy de profes guías (sigue activo).
  const [tarifasProfeGuia, setTarifasProfeGuia] =
    useState<TarifasPorCurso>(TARIFAS_VACIAS);
  const [hidratado, setHidratado] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (configLoading) return;
    if (hidratado) return;
    if (config) {
      setMontosInstructor(config.montosInstructor ?? MONTOS_VACIOS);
      setTarifasProfeGuia(config.tarifasProfeGuia);
    }
    setHidratado(true);
  }, [config, configLoading, hidratado]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleGuardar = async () => {
    setSubmitting(true);
    try {
      await save(
        {
          tarifasInstructor: config?.tarifasInstructor ?? TARIFAS_VACIAS,
          tarifasProfeGuia,
          montosInstructor,
        },
        directorUsername || "director"
      );
      showToast("Configuración guardada.");
    } catch (err) {
      console.error("guardar config pagos:", err);
      showToast(
        err instanceof Error ? err.message : "No se pudo guardar la configuración."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || userRole !== "director" || !hidratado) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const ultimaActualizacion = config?.actualizadoEn
    ? formatearFecha(config.actualizadoEn)
    : null;

  // Ejemplos por curso: 1, 2, 3, 5, 8 alumnos en un día.
  const ejemplosPorCurso = CURSOS.map((c) => {
    const par = montosInstructor[c];
    return {
      curso: c,
      filas: [1, 2, 3, 5, 8].map((n) => ({
        n,
        total: n > 0 ? par.primero + (n - 1) * par.adicional : 0,
      })),
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Configuración de Pagos
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              Define cuánto se paga a instructores y profes guías. Los montos
              se aplican automáticamente al cálculo mensual.
            </p>
          </div>
        </div>

        {ultimaActualizacion && (
          <div className="text-xs text-slate-500 bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-sm">
            Última actualización:{" "}
            <b className="text-slate-700">{ultimaActualizacion}</b>
            {config?.actualizadoPor && (
              <>
                {" "}
                por <b className="text-slate-700">{config.actualizadoPor}</b>
              </>
            )}
          </div>
        )}

        <Card
          title="Pago a Instructores"
          subtitle="Modelo escalado POR CURSO: 1er alumno + N-1 adicionales en el día"
        >
          <p className="text-xs text-slate-500 mb-4 mt-2">
            Cada curso tiene su propio par (primer alumno, adicional). Si en
            un mismo día el instructor atiende alumnos de varios cursos, el
            pago del día se suma por curso de forma independiente.
          </p>
          <div className="space-y-6 mt-4">
            {CURSOS.map((c) => (
              <div
                key={c}
                className="p-4 border border-slate-200 rounded-2xl bg-white space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">{c}</h3>
                <Input
                  label="Monto por primer alumno (CLP)"
                  type="number"
                  step="100"
                  value={String(montosInstructor[c].primero)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setMontosInstructor((m) => ({
                      ...m,
                      [c]: {
                        ...m[c],
                        primero: Number.isFinite(n) && n >= 0 ? n : 0,
                      },
                    }));
                  }}
                  disabled={submitting}
                />
                <Input
                  label="Monto por alumno adicional (CLP)"
                  type="number"
                  step="100"
                  value={String(montosInstructor[c].adicional)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setMontosInstructor((m) => ({
                      ...m,
                      [c]: {
                        ...m[c],
                        adicional: Number.isFinite(n) && n >= 0 ? n : 0,
                      },
                    }));
                  }}
                  disabled={submitting}
                />
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Vista previa día — {c}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ejemplosPorCurso
                      .find((x) => x.curso === c)!
                      .filas.map((e) => (
                        <div
                          key={e.n}
                          className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-center"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {e.n} alumno{e.n === 1 ? "" : "s"}
                          </p>
                          <b className="text-sm text-slate-900 block mt-1">
                            {formatCLP(e.total)}
                          </b>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Tarifas de Profes Guías"
          subtitle="CLP por alumno asistido, por curso (modelo sin cambios)"
        >
          <div className="space-y-2 mt-4">
            {CURSOS.map((c) => (
              <Input
                key={c}
                label={`${c}`}
                type="number"
                step="100"
                value={String(tarifasProfeGuia[c] ?? 0)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setTarifasProfeGuia({
                    ...tarifasProfeGuia,
                    [c]: Number.isFinite(n) && n >= 0 ? n : 0,
                  });
                }}
                disabled={submitting}
              />
            ))}
            <PreviewTarifas tarifas={tarifasProfeGuia} />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleGuardar}
            disabled={submitting}
            className="!px-6 !py-3 text-base"
          >
            {submitting ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold animate-[fadeIn_0.2s_ease]">
          {toast}
        </div>
      )}
    </div>
  );
}

function PreviewTarifas({ tarifas }: { tarifas: TarifasPorCurso }) {
  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
        Vista previa
      </p>
      {CURSOS.map((c) => (
        <div key={c} className="flex justify-between text-xs">
          <span className="text-slate-500">{c}</span>
          <b className="text-slate-900">{formatCLP(tarifas[c] ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

function formatearFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
