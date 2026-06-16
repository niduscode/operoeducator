"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getPagosPorAlumno, eliminarPagoAlumno } from "@/lib/firestore";
import type { Alumno, PagoAlumno } from "@/lib/types";
import { formatCLP, nombreMes } from "@/lib/format";

interface HistorialPagosModalProps {
  alumno: Alumno;
  onClose: () => void;
  onEdit?: (pago: PagoAlumno) => void;
}

export default function HistorialPagosModal({
  alumno,
  onClose,
  onEdit,
}: HistorialPagosModalProps) {
  const [pagos, setPagos] = useState<PagoAlumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await getPagosPorAlumno(alumno.id);
      setPagos(rows);
    } catch (err) {
      console.error("historial pagos:", err);
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los pagos."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumno.id]);

  const handleDelete = async (pago: PagoAlumno) => {
    const ok = await confirm({
      title: "¿Eliminar pago?",
      message: (
        <>
          Vas a eliminar el pago de <b>{nombreMes(pago.mes)} {pago.año}</b> (
          {formatCLP(pago.monto)}). Si tiene comprobante, se borrará también.
          Esta acción no se puede deshacer.
        </>
      ),
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await eliminarPagoAlumno(pago.id);
      toast.success("Pago eliminado.");
      await cargar();
    } catch (err) {
      console.error("eliminar pago:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo eliminar el pago."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        Mostrando todos los pagos registrados para{" "}
        <b className="text-slate-700">{alumno.nombre}</b>{" "}
        <span className="text-slate-400">
          ({alumno.curso} · {alumno.sucursal})
        </span>
        .
      </div>

      {error && (
        <div className="p-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      ) : pagos.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Este alumno aún no tiene pagos registrados.
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto hide-scroll pr-1">
          {pagos.map((p) => (
            <div
              key={p.id}
              className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-2"
            >
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div>
                  <b className="text-slate-900">
                    {nombreMes(p.mes)} {p.año}
                  </b>
                  <span className="text-slate-400">
                    {" · "}
                    {p.medioPago}
                  </span>
                </div>
                <b className="text-emerald-600">{formatCLP(p.monto)}</b>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 flex-wrap gap-2">
                <span>Fecha: {p.fechaPago || "—"}</span>
                {p.comprobanteUrl ? (
                  <a
                    href={p.comprobanteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 font-bold underline"
                  >
                    Ver comprobante
                  </a>
                ) : (
                  <span className="text-slate-400 italic">Sin comprobante</span>
                )}
              </div>
              {p.observacion && (
                <p className="text-[11px] text-slate-600 italic">
                  “{p.observacion}”
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                {onEdit && (
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 text-[11px]"
                    onClick={() => onEdit(p)}
                  >
                    Editar
                  </Button>
                )}
                <Button
                  variant="danger"
                  className="!px-3 !py-1.5 text-[11px]"
                  onClick={() => handleDelete(p)}
                  disabled={busy}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
