"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  Alumno,
  INTERNAL_DOMAIN,
  Instructor,
  SUCURSALES,
  Sucursal,
  usernameToEmail,
} from "@/lib/types";
import {
  InstructorInput,
  sincronizarAlumnosDeInstructor,
} from "@/lib/firestore";
import { useAlumnos } from "@/hooks/useAlumnos";

interface InstructorFormProps {
  initial?: Instructor | null;
  // username del director que está creando/editando — se persiste en creadoPor
  // (solo en create) o se ignora en edit. Llega desde la página vía useAuth.
  currentDirectorUsername: string;
  onSubmit: (data: InstructorInput) => Promise<void>;
  onCancel: () => void;
}

// El username solo admite letras (a-z, sin acentos), números y puntos.
// Esto coincide con el formato de los emails internos: instructor.gregory
// → instructor.gregory@operoeducator.internal. Permitir espacios o ñ
// rompería la URL del email Firebase Auth.
const USERNAME_REGEX = /^[a-z0-9.]+$/;

export default function InstructorForm({
  initial,
  currentDirectorUsername,
  onSubmit,
  onCancel,
}: InstructorFormProps) {
  const [nombreCompleto, setNombreCompleto] = useState(
    initial?.nombreCompleto ?? ""
  );
  const [username, setUsername] = useState(initial?.username ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [sucursalActual, setSucursalActual] = useState<Sucursal>(
    initial?.sucursalActual ?? SUCURSALES[0]
  );
  const [activo, setActivo] = useState<boolean>(initial?.activo ?? true);
  const [fechaIngreso, setFechaIngreso] = useState(
    initial?.fechaIngreso ?? new Date().toISOString().split("T")[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const isEdit = Boolean(initial);

  // Sólo en modo edición cargamos alumnos para mostrar la sección de asignación.
  // Pasamos la sucursal actual para acotar la lista al alcance del instructor.
  const { alumnos } = useAlumnos(isEdit ? sucursalActual : null);
  const [alumnosSel, setAlumnosSel] = useState<Set<string>>(new Set());
  // Hidratación inicial: tildamos a los que ya tienen instructorId === initial.id.
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    if (!isEdit || !initial) return;
    if (hidratado) return;
    const init = new Set<string>();
    for (const a of alumnos) {
      if (a.instructorId === initial.id) init.add(a.id);
    }
    setAlumnosSel(init);
    setHidratado(true);
  }, [alumnos, hidratado, initial, isEdit]);

  // Mostramos sólo alumnos elegibles: activos, y que no tengan profeGuía
  // (a menos que ya estén asignados a este instructor).
  const alumnosElegibles = useMemo<Alumno[]>(() => {
    if (!isEdit || !initial) return [];
    return alumnos
      .filter((a) => a.activo !== false)
      .filter(
        (a) =>
          !a.profeGuiaId ||
          a.instructorId === initial.id ||
          alumnosSel.has(a.id)
      )
      .sort((x, y) => x.nombre.localeCompare(y.nombre));
  }, [alumnos, alumnosSel, initial, isEdit]);

  const emailCalculado = useMemo(() => {
    const u = username.trim().toLowerCase();
    if (!u) return `(se calcula al escribir el username)${INTERNAL_DOMAIN}`;
    return usernameToEmail(u);
  }, [username]);

  const toggleAlumno = (id: string) => {
    setAlumnosSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");

    const nombreLimpio = nombreCompleto.trim();
    const usernameLimpio = username.trim().toLowerCase();

    if (!nombreLimpio) {
      setFormError("El nombre completo es obligatorio.");
      return;
    }
    if (!usernameLimpio) {
      setFormError("El username es obligatorio.");
      return;
    }
    if (!USERNAME_REGEX.test(usernameLimpio)) {
      setFormError(
        "El username solo puede contener letras minúsculas, números y puntos (sin espacios ni acentos)."
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        nombreCompleto: nombreLimpio,
        username: usernameLimpio,
        email: usernameToEmail(usernameLimpio),
        telefono: telefono.trim(),
        sucursalActual,
        activo,
        fechaIngreso,
        // fechaCreacion ya NO se setea client-side: lo maneja Postgres via
        // created_at NOT NULL DEFAULT now() (ver schema 0002). Mantenemos
        // la columna en el type como derived field de created_at.
        userId: initial?.userId ?? null,
        creadoPor: initial?.creadoPor ?? currentDirectorUsername,
        // En create siempre arranca en false (el director marca a mano cuando
        // crea la cuenta de Auth). En edit preservamos lo que ya estaba.
        authVerificado: initial?.authVerificado ?? false,
      });
      // Después de actualizar el perfil, sincronizamos las asignaciones.
      // Sólo aplica en edit (necesitamos el id existente).
      if (isEdit && initial) {
        try {
          await sincronizarAlumnosDeInstructor(
            initial.id,
            Array.from(alumnosSel)
          );
        } catch (errAsig) {
          console.error("sincronizarAlumnosDeInstructor:", errAsig);
          setFormError(
            errAsig instanceof Error
              ? errAsig.message
              : "El perfil se guardó, pero falló la sincronización de alumnos."
          );
          setSubmitting(false);
          return;
        }
      }
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar el instructor."
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <Input
        label="Nombre completo"
        value={nombreCompleto}
        onChange={(e) => setNombreCompleto(e.target.value)}
        required
        disabled={submitting}
      />
      <Input
        label="Username (sin @)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        // Una vez creado, el username NO se puede cambiar: es la clave que
        // une el perfil Firestore con la cuenta Firebase Auth (creada a mano).
        // Cambiarlo dejaría al instructor sin poder iniciar sesión.
        disabled={submitting || isEdit}
        placeholder="ej: instructor.gregory"
      />
      {isEdit && (
        <p className="-mt-3 mb-3 text-[11px] text-slate-500">
          El username no se puede modificar (está vinculado a la cuenta de
          inicio de sesión).
        </p>
      )}

      <div className="mb-4 w-full">
        <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Email (calculado automáticamente)
        </label>
        <div className="w-full bg-slate-100 p-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-mono break-all">
          {emailCalculado}
        </div>
      </div>

      <Input
        label="Teléfono"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        disabled={submitting}
      />
      <Select
        label="Sucursal asignada"
        value={sucursalActual}
        onChange={(e) => setSucursalActual(e.target.value as Sucursal)}
        options={SUCURSALES.map((s) => ({ label: s, value: s }))}
        disabled={submitting || isEdit}
      />
      {isEdit && (
        <p className="-mt-3 mb-3 text-[11px] text-amber-600">
          La sucursal solo puede cambiarse desde el botón “Reasignar Sucursal”
          (queda registrado en el historial).
        </p>
      )}

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
            Instructor activo (puede iniciar sesión y ver su sucursal)
          </span>
        </label>
      </div>

      {/* Asignación de alumnos (solo edit) */}
      {isEdit && (
        <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Alumnos asignados — Sucursal {sucursalActual}
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Marca los alumnos que están a cargo de este instructor. Asignar
            uno limpia automáticamente su profe guía (son mutuamente
            excluyentes).
          </p>
          {alumnosElegibles.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              No hay alumnos elegibles en esta sucursal.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto hide-scroll space-y-1 pr-1">
              {alumnosElegibles.map((a) => {
                const checked = alumnosSel.has(a.id);
                return (
                  <label
                    key={a.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      checked
                        ? "bg-brand-50 border-brand-200"
                        : "bg-white border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-brand-500 flex-shrink-0"
                        checked={checked}
                        onChange={() => toggleAlumno(a.id)}
                        disabled={submitting}
                      />
                      <span className="truncate">
                        <b className="text-slate-900">{a.nombre}</b>
                        <span className="text-slate-400">
                          {" · "}
                          {a.curso}
                        </span>
                      </span>
                    </span>
                    {a.profeGuiaId && !checked && (
                      <span className="text-[9px] uppercase tracking-widest font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg flex-shrink-0">
                        Tiene profe
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">
            <b>{alumnosSel.size}</b> alumno{alumnosSel.size === 1 ? "" : "s"}{" "}
            seleccionado{alumnosSel.size === 1 ? "" : "s"}.
          </p>
        </div>
      )}

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
            : isEdit
              ? "Guardar cambios"
              : "Crear perfil"}
        </Button>
      </div>
    </form>
  );
}
