"use client";

import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ProfeGuia, SUCURSALES, Sucursal } from "@/lib/types";
import { ProfeGuiaInput } from "@/lib/firestore";

interface ProfeGuiaFormProps {
  initial?: ProfeGuia | null;
  onSubmit: (data: ProfeGuiaInput) => Promise<void>;
  onCancel: () => void;
}

export default function ProfeGuiaForm({
  initial,
  onSubmit,
  onCancel,
}: ProfeGuiaFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [sucursal, setSucursal] = useState<Sucursal>(
    initial?.sucursal ?? SUCURSALES[0]
  );
  const [activo, setActivo] = useState<boolean>(initial?.activo ?? true);
  const [fechaIngreso, setFechaIngreso] = useState(
    initial?.fechaIngreso ?? new Date().toISOString().split("T")[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    if (!nombre.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        sucursal,
        activo,
        fechaIngreso,
      });
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el profe guía."
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <Input
        label="Nombre completo"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
        disabled={submitting}
      />
      <Input
        label="Teléfono"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        disabled={submitting}
      />
      <Select
        label="Sucursal"
        value={sucursal}
        onChange={(e) => setSucursal(e.target.value as Sucursal)}
        options={SUCURSALES.map((s) => ({ label: s, value: s }))}
        disabled={submitting}
      />
      <Input
        label="Fecha de ingreso"
        type="date"
        value={fechaIngreso}
        onChange={(e) => setFechaIngreso(e.target.value)}
        disabled={submitting}
      />

      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            disabled={submitting}
            className="w-4 h-4 accent-brand-500"
          />
          <span className="text-sm text-slate-700">
            Profe activo (disponible para asignar alumnos)
          </span>
        </label>
      </div>

      {formError && (
        <div className="p-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {formError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting
            ? "Guardando..."
            : initial
              ? "Guardar cambios"
              : "Agregar profe"}
        </Button>
      </div>
    </form>
  );
}
