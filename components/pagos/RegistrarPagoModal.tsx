"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import type {
  Alumno,
  MedioPagoAlumno,
  PagoAlumno,
  PreciosAlumnos,
  TipoPagoAlumno,
} from "@/lib/types";
import { TIPOS_PAGO_ALUMNO } from "@/lib/types";
import { type PagoAlumnoInput } from "@/lib/firestore";
import {
  COMPROBANTE_MAX_BYTES,
  COMPROBANTE_MIME_TYPES,
  eliminarComprobantePago,
  subirComprobantePago,
} from "@/lib/storage";
import { formatCLP, MESES_ES } from "@/lib/format";

interface RegistrarPagoModalProps {
  alumnos: Alumno[];
  precios: PreciosAlumnos | null;
  registradoPor: string;          // username del usuario actual
  alumnoPreseleccionadoId?: string;
  mesInicial?: number;
  añoInicial?: number;
  // Si se pasa, el modal entra en modo "edit": precarga campos, bloquea
  // la selección de alumno y al guardar dispara onSubmit con editId.
  initialPago?: PagoAlumno;
  onSubmit: (data: PagoAlumnoInput, editId?: string) => Promise<void>;
  onCancel: () => void;
}

const MEDIO_OPTIONS: { label: string; value: MedioPagoAlumno }[] = [
  { label: "Transferencia", value: "Transferencia" },
  { label: "Efectivo", value: "Efectivo" },
  { label: "Tarjeta de Débito", value: "Tarjeta de Débito" },
  { label: "Tarjeta de Crédito", value: "Tarjeta de Crédito" },
  { label: "Otro", value: "Otro" },
];

const TIPO_OPTIONS: { label: string; value: TipoPagoAlumno }[] =
  TIPOS_PAGO_ALUMNO.map((t) => ({ label: t, value: t }));

function añosDisponibles(actual: number): { label: string; value: string }[] {
  // Permitimos registrar pagos del año actual y los dos anteriores.
  const out: { label: string; value: string }[] = [];
  for (let a = actual + 1; a >= actual - 2; a--) {
    out.push({ label: String(a), value: String(a) });
  }
  return out;
}

export default function RegistrarPagoModal({
  alumnos,
  precios,
  registradoPor,
  alumnoPreseleccionadoId,
  mesInicial,
  añoInicial,
  initialPago,
  onSubmit,
  onCancel,
}: RegistrarPagoModalProps) {
  const isEdit = !!initialPago;
  const hoy = new Date();

  const [alumnoId, setAlumnoId] = useState<string>(
    initialPago?.alumnoId ?? alumnoPreseleccionadoId ?? ""
  );
  const [mes, setMes] = useState<number>(
    initialPago?.mes ?? mesInicial ?? hoy.getMonth() + 1
  );
  const [año, setAño] = useState<number>(
    initialPago?.año ?? añoInicial ?? hoy.getFullYear()
  );
  const [monto, setMonto] = useState<number>(initialPago?.monto ?? 0);
  // En edición consideramos el monto inicial como "ya tocado" para no
  // pisarlo con el precio del curso si el director cambia mes/alumno.
  const [montoEditado, setMontoEditado] = useState<boolean>(isEdit);
  const [fechaPago, setFechaPago] = useState<string>(
    initialPago?.fechaPago ?? hoy.toISOString().split("T")[0]
  );
  const [medioPago, setMedioPago] = useState<MedioPagoAlumno>(
    initialPago?.medioPago ?? "Transferencia"
  );
  const [tipoPago, setTipoPago] = useState<TipoPagoAlumno>(
    initialPago?.tipoPago ?? "Total"
  );
  // Si el alumno paga el curso completo, normalmente NO paga inscripción.
  // Si es parcial, DEBE pagar la inscripción primero para apartar el cupo.
  // El director puede sobrescribirlo a mano si hay una excepción.
  const [pagaInscripcion, setPagaInscripcion] = useState<boolean>(
    initialPago?.pagaInscripcion ?? false
  );
  const [observacion, setObservacion] = useState(
    initialPago?.observacion ?? ""
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  // En edición arrancamos manteniendo el comprobante existente. El usuario
  // puede subir uno nuevo (lo reemplaza) o pulsar "Quitar" para borrarlo.
  const [comprobanteExistente, setComprobanteExistente] = useState<{
    url: string;
    nombre: string;
  } | null>(
    initialPago?.comprobanteUrl
      ? {
          url: initialPago.comprobanteUrl,
          nombre: initialPago.comprobanteNombre || "comprobante",
        }
      : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState("");

  // Pagos existentes del alumno para ese mes/año — sirve para validar
  // duplicados y para mostrar el saldo pendiente cuando es parcial.
  const [pagosExistentes, setPagosExistentes] = useState<
    { id: string; monto: number; tipoPago: string }[]
  >([]);
  const [chequeando, setChequeando] = useState<boolean>(false);

  const alumnoSeleccionado = useMemo(
    () => alumnos.find((a) => a.id === alumnoId) ?? null,
    [alumnos, alumnoId]
  );

  // Auto-llenado de monto a partir del precio del curso del alumno, salvo
  // que el usuario lo haya editado manualmente (o estemos en modo edit).
  useEffect(() => {
    if (montoEditado) return;
    if (!alumnoSeleccionado || !precios) {
      setMonto(0);
      return;
    }
    setMonto(precios[alumnoSeleccionado.curso] ?? 0);
  }, [alumnoSeleccionado, precios, montoEditado]);

  // Cada vez que cambian alumno/mes/año, traemos pagos existentes.
  useEffect(() => {
    if (!alumnoId || !mes || !año) {
      setPagosExistentes([]);
      return;
    }
    let cancelado = false;
    setChequeando(true);
    // Supabase: anio en vez de año (col en snake_case en BD).
    // PostgrestBuilder devuelve un PromiseLike sin .finally — encadenamos
    // a un Promise nativo con .then(() => res) para poder usar finally.
    (async () => {
      try {
        const { data, error } = await supabase
          .from("pagos_alumnos")
          .select("id, monto, tipo_pago")
          .eq("alumno_id", alumnoId)
          .eq("mes", mes)
          .eq("anio", año);
        if (cancelado) return;
        if (error) {
          console.error("chequeo pagos existentes:", error);
          setPagosExistentes([]);
          return;
        }
        const rows = (data ?? [])
          .filter((d) => d.id !== initialPago?.id)
          .map((d) => ({
            id: d.id as string,
            monto: Number(d.monto ?? 0),
            tipoPago: (d.tipo_pago as string | undefined) ?? "Total",
          }));
        setPagosExistentes(rows);
      } finally {
        if (!cancelado) setChequeando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [alumnoId, mes, año, initialPago?.id]);

  // Saldo: si hay precio referencia, restamos el total ya pagado (incluyendo
  // el monto actual del form si es parcial). Solo informativo.
  const precioReferencia = alumnoSeleccionado && precios
    ? precios[alumnoSeleccionado.curso] ?? 0
    : 0;
  const yaPagado = pagosExistentes.reduce((acc, p) => acc + p.monto, 0);
  const saldoPendiente = Math.max(
    0,
    precioReferencia - (yaPagado + (tipoPago !== "Total" ? monto : 0))
  );

  const yaHayTotal = pagosExistentes.some((p) => p.tipoPago === "Total");

  const handleArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setError("");
    if (!file) {
      setArchivo(null);
      return;
    }
    if (
      !COMPROBANTE_MIME_TYPES.includes(
        file.type as (typeof COMPROBANTE_MIME_TYPES)[number]
      )
    ) {
      setError("Formato no admitido. Usa JPG, PNG, WEBP o PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > COMPROBANTE_MAX_BYTES) {
      setError("El archivo supera el límite de 5 MB.");
      e.target.value = "";
      return;
    }
    setArchivo(file);
  };

  const handleQuitarComprobante = () => {
    setComprobanteExistente(null);
    setArchivo(null);
  };

  // Opciones para SearchableSelect de alumnos.
  const opcionesAlumno = useMemo(
    () =>
      alumnos
        .filter((a) => a.activo !== false)
        .map((a) => ({
          value: a.id,
          label: a.nombre,
          hint: `${a.curso} · ${a.sucursal}`,
        })),
    [alumnos]
  );

  const tieneComprobante = !!archivo || !!comprobanteExistente;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!alumnoSeleccionado) {
      setError("Selecciona un alumno.");
      return;
    }
    if (yaHayTotal) {
      setError(
        "Ya existe un pago Total registrado para este alumno en este mes. Edítalo en lugar de crear uno nuevo."
      );
      return;
    }
    if (tipoPago === "Total" && pagosExistentes.length > 0) {
      setError(
        "El alumno ya tiene pagos parciales en este mes. Elige un tipo Parcial o consolídalos antes de marcar Total."
      );
      return;
    }
    if (!fechaPago) {
      setError("Indica la fecha de pago.");
      return;
    }
    // Comprobante OBLIGATORIO siempre, sin importar el medio.
    if (!tieneComprobante) {
      setError("El comprobante es obligatorio para todos los pagos.");
      return;
    }
    if (monto <= 0) {
      setError("El monto debe ser mayor a cero.");
      return;
    }

    setSubmitting(true);
    setProgress(0);

    try {
      let comprobanteUrl: string | undefined = comprobanteExistente?.url;
      let comprobanteNombre: string | undefined =
        comprobanteExistente?.nombre;

      if (archivo) {
        setProgress(20);
        const subido = await subirComprobantePago(
          alumnoSeleccionado.id,
          mes,
          año,
          archivo
        );
        comprobanteUrl = subido.url;
        comprobanteNombre = subido.nombre;
        setProgress(70);

        // Si reemplazamos un comprobante anterior (no es el mismo URL),
        // intentamos limpiar el viejo de Storage. Tolerante a fallos.
        const urlPrevio = initialPago?.comprobanteUrl;
        if (urlPrevio && urlPrevio !== subido.url) {
          try {
            await eliminarComprobantePago(urlPrevio);
          } catch (cleanupErr) {
            console.warn(
              "RegistrarPagoModal: no se pudo limpiar comprobante previo",
              cleanupErr
            );
          }
        }
      } else {
        setProgress(40);
      }

      const ahora = new Date().toISOString();
      const input: PagoAlumnoInput = {
        alumnoId: alumnoSeleccionado.id,
        alumnoNombre: alumnoSeleccionado.nombre,
        curso: alumnoSeleccionado.curso,
        sucursal: alumnoSeleccionado.sucursal,
        mes,
        año,
        monto,
        fechaPago,
        medioPago,
        tipoPago,
        pagaInscripcion,
        comprobanteUrl,
        comprobanteNombre,
        observacion: observacion.trim() || undefined,
        // En edición preservamos quién registró originalmente.
        registradoPor: isEdit
          ? initialPago?.registradoPor || registradoPor || "desconocido"
          : registradoPor || "desconocido",
        // registradoEn NO va en el input: lo setea Postgres vía
        // registrado_en TIMESTAMPTZ DEFAULT now() en el schema (0004).
      };

      await onSubmit(input, initialPago?.id);
      setProgress(100);
    } catch (err) {
      console.error("registrar pago:", err);
      setError(
        err instanceof Error ? err.message : "No se pudo registrar el pago."
      );
      setSubmitting(false);
      setProgress(0);
    }
  };

  const lockAlumno = isEdit || !!alumnoPreseleccionadoId;
  const submitDisabled = submitting || yaHayTotal || !tieneComprobante;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!lockAlumno && (
        <SearchableSelect
          label="Alumno"
          value={alumnoId}
          onChange={(v) => setAlumnoId(v)}
          options={opcionesAlumno}
          placeholder="Buscar alumno por nombre..."
          disabled={submitting}
          emptyMessage="Sin coincidencias."
        />
      )}

      {alumnoSeleccionado && (
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs flex justify-between items-center flex-wrap gap-2">
          <span>
            <b className="text-slate-900">{alumnoSeleccionado.nombre}</b>
            <span className="text-slate-400"> · {alumnoSeleccionado.curso}</span>
            <span className="text-slate-400"> · {alumnoSeleccionado.sucursal}</span>
          </span>
          {precios && (
            <span className="text-slate-500">
              Precio referencia:{" "}
              <b className="text-slate-700">
                {formatCLP(precios[alumnoSeleccionado.curso] ?? 0)}
              </b>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Mes"
          value={String(mes)}
          onChange={(e) => setMes(Number(e.target.value))}
          options={MESES_ES.map((m) => ({
            label: m.label,
            value: String(m.value),
          }))}
          disabled={submitting}
        />
        <Select
          label="Año"
          value={String(año)}
          onChange={(e) => setAño(Number(e.target.value))}
          options={añosDisponibles(new Date().getFullYear())}
          disabled={submitting}
        />
      </div>

      {yaHayTotal && (
        <div className="-mt-1 p-2 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-bold">
          ⚠️ Ya existe un pago Total registrado para este alumno en este mes.
        </div>
      )}
      {chequeando && (
        <p className="-mt-1 text-[11px] text-slate-400">
          Verificando pagos existentes…
        </p>
      )}

      <Input
        label="Monto (CLP)"
        type="number"
        step="500"
        value={String(monto)}
        onChange={(e) => {
          const n = Number(e.target.value);
          setMonto(Number.isFinite(n) && n >= 0 ? n : 0);
          setMontoEditado(true);
        }}
        disabled={submitting}
      />

      <Input
        label="Fecha de pago"
        type="date"
        value={fechaPago}
        onChange={(e) => setFechaPago(e.target.value)}
        disabled={submitting}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Medio de pago"
          value={medioPago}
          onChange={(e) => setMedioPago(e.target.value as MedioPagoAlumno)}
          options={MEDIO_OPTIONS}
          disabled={submitting}
        />
        <Select
          label="Tipo de pago"
          value={tipoPago}
          onChange={(e) => setTipoPago(e.target.value as TipoPagoAlumno)}
          options={TIPO_OPTIONS}
          disabled={submitting}
        />
      </div>

      {/* Checkbox inscripción. Solo se ofrece cuando el pago es parcial
          (el alumno aparta el cupo) o el director quiere marcarlo manual.
          Para pago Total, el alumno NO paga inscripción por regla de negocio. */}
      <label
        className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
          pagaInscripcion
            ? "border-brand-300 bg-brand-50"
            : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={pagaInscripcion}
          onChange={(e) => setPagaInscripcion(e.target.checked)}
          disabled={submitting}
        />
        <div className="text-xs">
          <p className="font-bold text-slate-900">Incluye inscripción</p>
          <p className="text-slate-500 mt-0.5">
            Marca esto si este pago incluye también el monto de inscripción
            del curso (se cobra solo cuando el alumno NO paga el curso
            completo de una vez).
            {alumnoSeleccionado && precios && (
              <>
                {" "}
                <span className="text-slate-700">
                  Inscripción {alumnoSeleccionado.curso}:{" "}
                  <b>
                    {formatCLP(
                      alumnoSeleccionado.curso === "Junior"
                        ? precios.inscripcionJunior ?? 0
                        : alumnoSeleccionado.curso === "Senior"
                          ? precios.inscripcionSenior ?? 0
                          : precios.inscripcionMaster ?? 0
                    )}
                  </b>
                </span>
              </>
            )}
          </p>
        </div>
      </label>

      {tipoPago !== "Total" && precioReferencia > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-800">
          <p className="font-bold uppercase tracking-widest text-[10px] mb-1">
            Pago parcial
          </p>
          <p>
            Ya pagado este mes:{" "}
            <b>{formatCLP(yaPagado + monto)}</b> de{" "}
            <b>{formatCLP(precioReferencia)}</b>.
          </p>
          <p>
            Saldo pendiente:{" "}
            <b className="text-amber-900">{formatCLP(saldoPendiente)}</b>
          </p>
        </div>
      )}

      <div>
        <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Comprobante (obligatorio)
        </label>

        {comprobanteExistente && !archivo && (
          <div className="mb-2 p-2 bg-slate-50 rounded-xl border border-slate-100 text-xs flex justify-between items-center gap-2">
            <a
              href={comprobanteExistente.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 font-bold underline truncate"
            >
              {comprobanteExistente.nombre}
            </a>
            <button
              type="button"
              onClick={handleQuitarComprobante}
              disabled={submitting}
              className="text-rose-600 font-bold text-[11px] hover:underline"
            >
              Quitar
            </button>
          </div>
        )}

        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleArchivo}
          disabled={submitting}
          className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800 file:cursor-pointer"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          JPG, PNG, WEBP o PDF · máximo 5 MB.
          {comprobanteExistente && !archivo &&
            " Si subes uno nuevo, reemplaza el actual."}
        </p>
        {archivo && (
          <p className="text-[11px] text-slate-600 mt-1 truncate">
            Nuevo archivo: <b>{archivo.name}</b>
          </p>
        )}
        {!tieneComprobante && (
          <p className="text-[11px] text-rose-600 font-bold mt-1">
            Adjunta un comprobante para poder registrar el pago.
          </p>
        )}
      </div>

      <div>
        <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Observación
        </label>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          disabled={submitting}
          rows={2}
          className="w-full bg-slate-50 p-3 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm disabled:opacity-50 resize-none"
          placeholder="Opcional"
        />
      </div>

      {submitting && (
        <div className="space-y-1">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-accent-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {progress < 70
              ? "Subiendo comprobante..."
              : isEdit
              ? "Actualizando pago..."
              : "Registrando pago..."}
          </p>
        </div>
      )}

      {error && (
        <div className="p-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={submitDisabled}>
          {submitting
            ? isEdit
              ? "Guardando..."
              : "Registrando..."
            : isEdit
            ? "Guardar cambios"
            : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
