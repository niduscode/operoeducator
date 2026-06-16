"use client";

import { FormEvent, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  Alumno,
  Curso,
  Horario,
  ProfeGuia,
  SUCURSALES,
  Sucursal,
} from "@/lib/types";
import { AlumnoInput } from "@/lib/firestore";

interface AlumnoFormProps {
  initial?: Alumno | null;
  profesGuias: ProfeGuia[];
  // Para el warning ">5 alumnos": contamos los alumnos ya asignados a cada profe.
  alumnosPorProfeGuia: Record<string, number>;
  onSubmit: (data: AlumnoInput) => Promise<void>;
  onCancel: () => void;
}

const CURSO_OPTIONS: { label: Curso; value: Curso }[] = [
  { label: "Junior", value: "Junior" },
  { label: "Senior", value: "Senior" },
  { label: "Master", value: "Master" },
];

const HORARIO_OPTIONS: { label: Horario; value: Horario }[] = [
  { label: "Mañana", value: "Mañana" },
  { label: "Tarde", value: "Tarde" },
];

const LIMITE_RECOMENDADO_ALUMNOS = 5;

export default function AlumnoForm({
  initial,
  profesGuias,
  alumnosPorProfeGuia,
  onSubmit,
  onCancel,
}: AlumnoFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [sucursal, setSucursal] = useState<Sucursal>(
    initial?.sucursal ?? SUCURSALES[0]
  );
  const [curso, setCurso] = useState<Curso>(initial?.curso ?? "Junior");
  const [horario, setHorario] = useState<Horario>(initial?.horario ?? "Mañana");
  const [fecha, setFecha] = useState(
    initial?.fecha ?? new Date().toISOString().split("T")[0]
  );
  const [profeGuiaId, setProfeGuiaId] = useState(initial?.profeGuiaId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Profes guías elegibles: activos y de la MISMA sucursal que el alumno.
  const profesElegibles = useMemo(
    () => profesGuias.filter((p) => p.activo && p.sucursal === sucursal),
    [profesGuias, sucursal]
  );

  // Si cambia la sucursal y el profe actual ya no pertenece a esa sucursal,
  // limpiamos la asignación automáticamente.
  const profeActualPerteneceASucursal = useMemo(() => {
    if (!profeGuiaId) return true;
    return profesElegibles.some((p) => p.id === profeGuiaId);
  }, [profeGuiaId, profesElegibles]);

  const handleSucursalChange = (nuevaSuc: Sucursal) => {
    setSucursal(nuevaSuc);
    if (profeGuiaId) {
      const sigueValido = profesGuias.some(
        (p) => p.id === profeGuiaId && p.sucursal === nuevaSuc
      );
      if (!sigueValido) setProfeGuiaId("");
    }
  };

  const profeSeleccionado = profesGuias.find((p) => p.id === profeGuiaId);
  // Contamos cuántos alumnos ya tiene este profe (excluyendo al alumno actual
  // si estamos editando y ya estaba asignado a él).
  const countProfeActual = profeGuiaId
    ? (alumnosPorProfeGuia[profeGuiaId] ?? 0) -
      (initial?.profeGuiaId === profeGuiaId ? 1 : 0)
    : 0;
  const profeEnLimite = countProfeActual >= LIMITE_RECOMENDADO_ALUMNOS;

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
        curso,
        horario,
        fecha,
        profeGuiaId,
        // Preservamos el flag activo en edición; default true al crear.
        activo: initial?.activo ?? true,
      });
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar el alumno."
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
        onChange={(e) => handleSucursalChange(e.target.value as Sucursal)}
        options={SUCURSALES.map((s) => ({ label: s, value: s }))}
        disabled={submitting}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Curso"
          value={curso}
          onChange={(e) => setCurso(e.target.value as Curso)}
          options={CURSO_OPTIONS}
          disabled={submitting}
        />
        <Select
          label="Turno"
          value={horario}
          onChange={(e) => setHorario(e.target.value as Horario)}
          options={HORARIO_OPTIONS}
          disabled={submitting}
        />
      </div>
      <Input
        label="Fecha de ingreso"
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        disabled={submitting}
      />

      <div>
        <Select
          label={`Profe guía (sucursal: ${sucursal})`}
          value={profeGuiaId}
          onChange={(e) => setProfeGuiaId(e.target.value)}
          options={[
            { label: "-- Sin asignar --", value: "" },
            ...profesElegibles.map((p) => {
              const count = alumnosPorProfeGuia[p.id] ?? 0;
              return {
                label: `${p.nombre} (${count}/${LIMITE_RECOMENDADO_ALUMNOS})`,
                value: p.id,
              };
            }),
          ]}
          disabled={submitting}
        />
        {profesElegibles.length === 0 && (
          <p className="-mt-3 mb-3 text-[11px] text-slate-500">
            No hay profes guías activos en {sucursal}. Créalos en la sección
            “Profes Guías”.
          </p>
        )}
        {!profeActualPerteneceASucursal && profeGuiaId && (
          <p className="-mt-3 mb-3 text-[11px] text-amber-600">
            El profe guía asignado no pertenece a {sucursal}. Cambia la
            selección o elige “Sin asignar”.
          </p>
        )}
        {profeSeleccionado && profeEnLimite && (
          <div className="-mt-3 mb-3 p-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-[11px]">
            ⚠️ {profeSeleccionado.nombre} ya tiene {countProfeActual} alumnos
            (límite recomendado: {LIMITE_RECOMENDADO_ALUMNOS}). Puedes asignar
            igualmente.
          </div>
        )}
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
          {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
