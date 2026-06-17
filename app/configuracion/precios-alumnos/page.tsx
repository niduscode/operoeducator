"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { usePreciosAlumnos } from "@/hooks/usePreciosAlumnos";
import {
  CURSOS,
  DURACION_DEFAULT_CLASES,
  emailToUsername,
} from "@/lib/types";
import { formatCLP } from "@/lib/format";

const PRECIOS_VACIOS = { Junior: 0, Senior: 0, Master: 0 };
const DURACION_VACIA = {
  Junior: DURACION_DEFAULT_CLASES.Junior,
  Senior: DURACION_DEFAULT_CLASES.Senior,
  Master: DURACION_DEFAULT_CLASES.Master,
};

export default function PreciosAlumnosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const { precios, isLoading: preciosLoading, save } = usePreciosAlumnos();

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

  const [valores, setValores] = useState(PRECIOS_VACIOS);
  const [inscripciones, setInscripciones] = useState(PRECIOS_VACIOS);
  const [duraciones, setDuraciones] = useState(DURACION_VACIA);
  const [hidratado, setHidratado] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (preciosLoading || hidratado) return;
    if (precios) {
      setValores({
        Junior: precios.Junior,
        Senior: precios.Senior,
        Master: precios.Master,
      });
      setInscripciones({
        Junior: precios.inscripcionJunior ?? 0,
        Senior: precios.inscripcionSenior ?? 0,
        Master: precios.inscripcionMaster ?? 0,
      });
      setDuraciones({
        Junior: precios.duracionJuniorClases ?? DURACION_DEFAULT_CLASES.Junior,
        Senior: precios.duracionSeniorClases ?? DURACION_DEFAULT_CLASES.Senior,
        Master: precios.duracionMasterClases ?? DURACION_DEFAULT_CLASES.Master,
      });
    }
    setHidratado(true);
  }, [precios, preciosLoading, hidratado]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const onChange = (curso: keyof typeof PRECIOS_VACIOS, valor: string) => {
    const n = Number(valor);
    setValores((v) => ({
      ...v,
      [curso]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  };

  const onChangeInscripcion = (curso: keyof typeof PRECIOS_VACIOS, valor: string) => {
    const n = Number(valor);
    setInscripciones((v) => ({
      ...v,
      [curso]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  };

  const onChangeDuracion = (
    curso: keyof typeof DURACION_VACIA,
    valor: string
  ) => {
    const n = Number(valor);
    setDuraciones((d) => ({
      ...d,
      [curso]: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
    }));
  };

  const handleGuardar = async () => {
    setSubmitting(true);
    try {
      await save(
        {
          ...valores,
          duracionJuniorClases: duraciones.Junior || undefined,
          duracionSeniorClases: duraciones.Senior || undefined,
          duracionMasterClases: duraciones.Master || undefined,
          inscripcionJunior: inscripciones.Junior,
          inscripcionSenior: inscripciones.Senior,
          inscripcionMaster: inscripciones.Master,
        },
        directorUsername || "director"
      );
      showToast("Precios, inscripciones y duraciones guardados.");
    } catch (err) {
      console.error("guardar precios:", err);
      showToast(
        err instanceof Error ? err.message : "No se pudieron guardar los precios."
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

  const ultimaActualizacion = precios?.actualizadoEn
    ? formatearFecha(precios.actualizadoEn)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
            Precios de Cursos
          </h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">
            Define la mensualidad estándar por curso. Estos montos se usan
            para autocompletar el formulario de pago y calcular el total
            esperado del mes.
          </p>
        </div>

        {ultimaActualizacion && (
          <div className="text-xs text-slate-500 bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-sm">
            Última actualización:{" "}
            <b className="text-slate-700">{ultimaActualizacion}</b>
            {precios?.actualizadoPor && (
              <>
                {" "}
                por <b className="text-slate-700">{precios.actualizadoPor}</b>
              </>
            )}
          </div>
        )}

        <Card title="Mensualidad por curso" subtitle="CLP">
          <div className="space-y-2 mt-4">
            {CURSOS.map((c) => (
              <Input
                key={c}
                label={c}
                type="number"
                step="500"
                value={String(valores[c] ?? 0)}
                onChange={(e) => onChange(c, e.target.value)}
                disabled={submitting}
              />
            ))}
            <div className="mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Vista previa
              </p>
              {CURSOS.map((c) => (
                <div key={c} className="flex justify-between text-xs">
                  <span className="text-slate-500">{c}</span>
                  <b className="text-slate-900">{formatCLP(valores[c] ?? 0)}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Inscripción por curso"
          subtitle="CLP — se cobra cuando el alumno NO paga el curso completo"
        >
          <p className="text-xs text-slate-500 mb-3">
            Si el alumno paga el curso completo de una vez, NO paga inscripción.
            Si paga en partes, debe pagar la inscripción primero para apartar el
            cupo, y completar con la mensualidad después.
          </p>
          <div className="space-y-2">
            {CURSOS.map((c) => (
              <Input
                key={c}
                label={c}
                type="number"
                step="500"
                value={String(inscripciones[c] ?? 0)}
                onChange={(e) => onChangeInscripcion(c, e.target.value)}
                disabled={submitting}
              />
            ))}
            <div className="mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Vista previa
              </p>
              {CURSOS.map((c) => (
                <div key={c} className="flex justify-between text-xs">
                  <span className="text-slate-500">{c}</span>
                  <b className="text-slate-900">
                    {formatCLP(inscripciones[c] ?? 0)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="Duración del curso"
          subtitle="Cantidad de clases — usado para calcular fechas de término"
        >
          <p className="text-xs text-slate-500 mb-3">
            Las clases son los martes y miércoles, por lo que cada semana
            cubre 2 clases. La fecha de término se calcula como{" "}
            <b>fechaIngreso + ⌈clases/2⌉ semanas</b>.
          </p>
          <div className="space-y-2">
            {CURSOS.map((c) => (
              <Input
                key={c}
                label={`${c} (clases)`}
                type="number"
                step="1"
                value={String(duraciones[c] ?? 0)}
                onChange={(e) => onChangeDuracion(c, e.target.value)}
                disabled={submitting}
              />
            ))}
            <div className="mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Equivalencia en semanas
              </p>
              {CURSOS.map((c) => {
                const clases = duraciones[c] ?? 0;
                const semanas = clases > 0 ? Math.ceil(clases / 2) : 0;
                return (
                  <div key={c} className="flex justify-between text-xs">
                    <span className="text-slate-500">{c}</span>
                    <b className="text-slate-900">
                      {clases} clase{clases === 1 ? "" : "s"} ·{" "}
                      {semanas} semana{semanas === 1 ? "" : "s"}
                    </b>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleGuardar}
            disabled={submitting}
            className="!px-6 !py-3 text-base"
          >
            {submitting ? "Guardando..." : "Guardar"}
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
