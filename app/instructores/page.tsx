"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import SearchableTable, {
  SearchableTableColumn,
} from "@/components/ui/SearchableTable";
import { useToast } from "@/components/ui/Toast";
import InstructorForm, {
  type InstructorCreatePayload,
} from "@/components/instructores/InstructorForm";
import { exportarAExcel } from "@/lib/export";
import { useAuth } from "@/hooks/useAuth";
import { useInstructores } from "@/hooks/useInstructores";
import {
  getHistorialPorInstructor,
  getInstructorPorEmail,
  InstructorInput,
} from "@/lib/firestore";
import {
  emailToUsername,
  HistorialAsignacion,
  Instructor,
  SUCURSALES,
  Sucursal,
} from "@/lib/types";

type SucursalFiltro = Sucursal | "Todas";

type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; instructor: Instructor }
  | { type: "reasignar"; instructor: Instructor }
  | { type: "historial"; instructor: Instructor }
  | { type: "deactivate"; instructor: Instructor }
  | { type: "activate"; instructor: Instructor }
  | { type: "post-create"; email: string; password: string };

export default function InstructoresPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const toast = useToast();

  const {
    instructores,
    isLoading: instructoresLoading,
    error: instructoresError,
    createInstructor,
    updateInstructor,
    deactivateInstructor,
    reasignarSucursal,
  } = useInstructores();

  const [filtro, setFiltro] = useState<SucursalFiltro>("Todas");
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  // Guard: director (full) o admin (read-only).
  // El admin puede consultar la tabla pero no muta nada — todos los botones
  // de acción se ocultan para `userRole === "admin"` más abajo.
  const canEdit = userRole === "director";
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (userRole !== "director" && userRole !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, userRole, authLoading, router]);

  const directorUsername = useMemo(
    () => (userEmail ? emailToUsername(userEmail) : ""),
    [userEmail]
  );

  const instructoresFiltrados = useMemo(() => {
    if (filtro === "Todas") return instructores;
    return instructores.filter((i) => i.sucursalActual === filtro);
  }, [instructores, filtro]);

  const handleCreate = async (
    data: InstructorInput | InstructorCreatePayload
  ) => {
    if (!("password" in data)) {
      throw new Error("Falta la contraseña inicial.");
    }
    // El API route hace pre-check de unicidad + crea cuenta auth + perfil
    // + historial inicial. Todo en server-side con service_role.
    const res = await fetch("/api/admin/instructores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.username,
        password: data.password,
        nombreCompleto: data.nombreCompleto,
        telefono: data.telefono,
        sucursalActual: data.sucursalActual,
        fechaIngreso: data.fechaIngreso,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.error ?? "No se pudo crear el instructor.");
    }
    toast.success("Instructor creado. Ya puede loguearse.");
    setModal({ type: "post-create", email: body.email, password: data.password });
  };

  const handleMarcarAuth = async (instructor: Instructor) => {
    try {
      await updateInstructor(instructor.id, { authVerificado: true });
      toast.success(
        `${instructor.nombreCompleto}: Auth marcado como creado.`
      );
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo marcar Auth como verificado."
      );
    }
  };

  const handleUpdate = async (id: string, data: InstructorInput) => {
    // En edit, sucursalActual NO se modifica desde acá (se hace vía reasignar);
    // mandamos el resto de campos para evitar pisar la sucursal accidentalmente.
    const { sucursalActual: _ignored, ...rest } = data;
    void _ignored;
    await updateInstructor(id, rest);
    setModal({ type: "none" });
    toast.success("Instructor actualizado.");
  };

  const handleDeactivate = async (instructor: Instructor) => {
    try {
      await deactivateInstructor(instructor.id);
      setModal({ type: "none" });
      toast.success(`${instructor.nombreCompleto} fue desactivado.`);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo desactivar el instructor."
      );
    }
  };

  const handleActivate = async (instructor: Instructor) => {
    try {
      await updateInstructor(instructor.id, { activo: true });
      setModal({ type: "none" });
      toast.success(`${instructor.nombreCompleto} fue reactivado.`);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo reactivar el instructor."
      );
    }
  };

  const handleExport = () => {
    const filas = instructoresFiltrados.map((i) => ({
      Nombre: i.nombreCompleto,
      Username: i.username,
      Email: i.email,
      Teléfono: i.telefono ?? "",
      "Sucursal actual": i.sucursalActual,
      Estado: i.activo ? "Activo" : "Inactivo",
      "Auth verificado": i.authVerificado ? "Sí" : "No",
      "Fecha ingreso": i.fechaIngreso,
      "Fecha creación": i.fechaCreacion,
      "Creado por": i.creadoPor,
    }));
    exportarAExcel(filas, "instructores");
    toast.info(`Exportadas ${filas.length} filas.`);
  };

  if (
    authLoading ||
    !user ||
    (userRole !== "director" && userRole !== "admin")
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Gestión de Instructores
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              {instructores.length} instructor
              {instructores.length === 1 ? "" : "es"} registrado
              {instructores.length === 1 ? "" : "s"}
            </p>
          </div>
          {canEdit && (
            <Button
              variant="primary"
              onClick={() => setModal({ type: "create" })}
            >
              Agregar Instructor
            </Button>
          )}
        </div>

        {instructoresError && (
          <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
            {instructoresError}
          </div>
        )}

        {/* Filtro por sucursal */}
        <Card className="!p-4">
          <div className="flex gap-2 overflow-x-auto hide-scroll">
            {(["Todas", ...SUCURSALES] as SucursalFiltro[]).map((s) => (
              <button
                key={s}
                onClick={() => setFiltro(s)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  filtro === s
                    ? "bg-slate-900 text-white shadow-lg"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* Tabla */}
        <Card
          title="Directorio"
          subtitle={`${instructoresFiltrados.length} ${
            instructoresFiltrados.length === 1 ? "instructor" : "instructores"
          }${filtro !== "Todas" ? ` en ${filtro}` : ""}`}
        >
          {instructoresLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <SearchableTable
              data={instructoresFiltrados}
              columns={buildInstructorColumns({
                canEdit,
                onMarcarAuth: handleMarcarAuth,
                onEdit: (i) => setModal({ type: "edit", instructor: i }),
                onReasignar: (i) =>
                  setModal({ type: "reasignar", instructor: i }),
                onDeactivate: (i) =>
                  setModal({ type: "deactivate", instructor: i }),
                onActivate: (i) =>
                  setModal({ type: "activate", instructor: i }),
                onHistorial: (i) =>
                  setModal({ type: "historial", instructor: i }),
              })}
              rowKey={(i) => i.id}
              searchableFields={(i) =>
                `${i.nombreCompleto} ${i.username} ${i.email} ${i.sucursalActual} ${i.telefono ?? ""}`
              }
              searchPlaceholder="Buscar por nombre, usuario, email..."
              minWidth="900px"
              emptyMessage={
                filtro === "Todas"
                  ? "Sin coincidencias."
                  : "No hay instructores con esos filtros."
              }
              emptyBaseMessage={
                instructores.length === 0
                  ? "Aún no hay instructores. Agrega el primero con el botón de arriba."
                  : undefined
              }
              toolbar={
                instructoresFiltrados.length > 0 ? (
                  <Button
                    variant="outline"
                    className="!px-3 !py-2 text-xs"
                    onClick={handleExport}
                  >
                    Exportar Excel
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      </div>

      {/* Modal CREATE */}
      {modal.type === "create" && canEdit && (
        <Modal
          title="Agregar Instructor"
          onClose={() => setModal({ type: "none" })}
        >
          <InstructorForm
            currentDirectorUsername={directorUsername}
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {/* Modal EDIT */}
      {modal.type === "edit" && canEdit && (
        <Modal
          title="Editar Instructor"
          onClose={() => setModal({ type: "none" })}
        >
          <InstructorForm
            initial={modal.instructor}
            currentDirectorUsername={directorUsername}
            onSubmit={(data) => handleUpdate(modal.instructor.id, data)}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {/* Modal REASIGNAR */}
      {modal.type === "reasignar" && canEdit && (
        <Modal
          title={`Reasignar sucursal — ${modal.instructor.nombreCompleto}`}
          onClose={() => setModal({ type: "none" })}
        >
          <ReasignarForm
            instructor={modal.instructor}
            currentDirectorUsername={directorUsername}
            onConfirm={async (nuevaSucursal, razon) => {
              await reasignarSucursal(
                modal.instructor.id,
                nuevaSucursal,
                directorUsername,
                razon
              );
              setModal({ type: "none" });
              toast.success(
                `Sucursal reasignada: ${modal.instructor.nombreCompleto} → ${nuevaSucursal}`
              );
            }}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {/* Modal HISTORIAL */}
      {modal.type === "historial" && (
        <Modal
          title={`Historial — ${modal.instructor.nombreCompleto}`}
          onClose={() => setModal({ type: "none" })}
        >
          <HistorialTimeline instructorId={modal.instructor.id} />
        </Modal>
      )}

      {/* Modal DESACTIVAR */}
      {modal.type === "deactivate" && canEdit && (
        <Modal
          title="¿Desactivar instructor?"
          onClose={() => setModal({ type: "none" })}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Vas a desactivar a <b>{modal.instructor.nombreCompleto}</b>.
            </p>
            <div className="p-3 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-xs">
              Este instructor no podrá usar el sistema hasta que lo reactives.
              Si además quieres bloquear su inicio de sesión inmediatamente,
              desactiva la cuenta correspondiente en Firebase Console →
              Authentication.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setModal({ type: "none" })}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDeactivate(modal.instructor)}
              >
                Desactivar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal REACTIVAR */}
      {modal.type === "activate" && canEdit && (
        <Modal
          title="¿Reactivar instructor?"
          onClose={() => setModal({ type: "none" })}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Vas a reactivar a <b>{modal.instructor.nombreCompleto}</b>. Si su
              cuenta de Firebase Auth fue deshabilitada, recuerda volver a
              habilitarla en Firebase Console.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setModal({ type: "none" })}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => handleActivate(modal.instructor)}
              >
                Reactivar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal POST-CREATE: instrucciones para crear la cuenta de Auth */}
      {modal.type === "post-create" && canEdit && (
        <Modal
          title="✅ Instructor creado y listo para usar"
          onClose={() => setModal({ type: "none" })}
        >
          <PostCreateCredentials
            email={modal.email}
            password={modal.password}
            onClose={() => setModal({ type: "none" })}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------- Builders ----------

interface InstructorColumnArgs {
  canEdit: boolean;
  onMarcarAuth: (i: Instructor) => void;
  onEdit: (i: Instructor) => void;
  onReasignar: (i: Instructor) => void;
  onDeactivate: (i: Instructor) => void;
  onActivate: (i: Instructor) => void;
  onHistorial: (i: Instructor) => void;
}

function buildInstructorColumns(
  args: InstructorColumnArgs
): SearchableTableColumn<Instructor>[] {
  return [
    {
      key: "nombre",
      header: "Nombre",
      render: (i) => (
        <>
          <b className="text-slate-900 block">{i.nombreCompleto}</b>
          {i.telefono && (
            <span className="text-[10px] text-slate-400">{i.telefono}</span>
          )}
        </>
      ),
    },
    {
      key: "username",
      header: "Username",
      render: (i) => (
        <span className="text-xs text-slate-600 font-mono">{i.username}</span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (i) => (
        <span className="text-[11px] text-slate-500 font-mono break-all">
          {i.email}
        </span>
      ),
    },
    {
      key: "sucursal",
      header: "Sucursal",
      render: (i) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {i.sucursalActual}
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      render: (i) => (
        <div className="flex flex-col gap-1 items-start">
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
              i.activo
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {i.activo ? "Activo" : "Inactivo"}
          </span>
          {!i.authVerificado && (
            <span
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700"
              title="El director aún no confirmó haber creado la cuenta de Firebase Auth para este perfil."
            >
              ⚠️ Auth pendiente
            </span>
          )}
        </div>
      ),
    },
    {
      key: "fecha",
      header: "Ingreso",
      render: (i) => (
        <span className="text-xs text-slate-500">{i.fechaIngreso || "—"}</span>
      ),
    },
    {
      key: "acciones",
      header: <span className="block text-right">Acciones</span>,
      tdClassName: "text-right",
      render: (i) => (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            variant="ghost"
            className="!px-3 !py-2 text-xs"
            onClick={() => args.onHistorial(i)}
          >
            Historial
          </Button>
          {args.canEdit && (
            <>
              {!i.authVerificado && (
                <Button
                  variant="warning"
                  className="!px-3 !py-2 text-xs"
                  onClick={() => args.onMarcarAuth(i)}
                >
                  Marcar Auth como creado
                </Button>
              )}
              <Button
                variant="outline"
                className="!px-3 !py-2 text-xs"
                onClick={() => args.onEdit(i)}
              >
                Editar
              </Button>
              <Button
                variant="outline"
                className="!px-3 !py-2 text-xs"
                onClick={() => args.onReasignar(i)}
              >
                Reasignar
              </Button>
              {i.activo ? (
                <Button
                  variant="danger"
                  className="!px-3 !py-2 text-xs"
                  onClick={() => args.onDeactivate(i)}
                >
                  Desactivar
                </Button>
              ) : (
                <Button
                  variant="warning"
                  className="!px-3 !py-2 text-xs"
                  onClick={() => args.onActivate(i)}
                >
                  Reactivar
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];
}

// ---------- Subcomponentes locales (mantienen el archivo cohesivo) ----------

interface ReasignarFormProps {
  instructor: Instructor;
  currentDirectorUsername: string;
  onConfirm: (nuevaSucursal: Sucursal, razon: string) => Promise<void>;
  onCancel: () => void;
}

function ReasignarForm({
  instructor,
  onConfirm,
  onCancel,
}: ReasignarFormProps) {
  const [nueva, setNueva] = useState<Sucursal>(instructor.sucursalActual);
  const [razon, setRazon] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const sinCambio = nueva === instructor.sucursalActual;

  const handle = async () => {
    setErr("");
    if (sinCambio) {
      setErr("La nueva sucursal es igual a la actual.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(nueva, razon);
    } catch (e) {
      console.error(e);
      setErr(
        e instanceof Error ? e.message : "No se pudo reasignar la sucursal."
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
        Sucursal actual:{" "}
        <b className="text-slate-900">{instructor.sucursalActual}</b>
      </div>
      <Select
        label="Nueva sucursal"
        value={nueva}
        onChange={(e) => setNueva(e.target.value as Sucursal)}
        options={SUCURSALES.map((s) => ({ label: s, value: s }))}
        disabled={submitting}
      />
      <Input
        label="Razón del cambio (opcional)"
        value={razon}
        onChange={(e) => setRazon(e.target.value)}
        placeholder="ej: cobertura por baja en Osorno"
        disabled={submitting}
      />
      {err && (
        <div className="p-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
          {err}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={handle}
          disabled={submitting || sinCambio}
        >
          {submitting ? "Reasignando..." : "Confirmar reasignación"}
        </Button>
      </div>
    </div>
  );
}

function HistorialTimeline({ instructorId }: { instructorId: string }) {
  const [historial, setHistorial] = useState<HistorialAsignacion[] | null>(
    null
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    getHistorialPorInstructor(instructorId)
      .then((rows) => {
        if (!cancelado) setHistorial(rows);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el historial."
          );
      });
    return () => {
      cancelado = true;
    };
  }, [instructorId]);

  if (error) {
    return (
      <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
        {error}
      </div>
    );
  }
  if (historial === null) {
    return (
      <div className="py-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }
  if (historial.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        Sin registros de asignación.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {historial.map((h) => {
        const activo = h.fechaFin === null;
        return (
          <li
            key={h.id}
            className={`p-3 rounded-2xl border text-xs ${
              activo
                ? "bg-emerald-50 border-emerald-100"
                : "bg-slate-50 border-slate-100"
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <b className="text-slate-900 text-sm">{h.sucursal}</b>
              <span
                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                  activo
                    ? "bg-emerald-200/60 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {activo ? "Activa" : "Cerrada"}
              </span>
            </div>
            <div className="text-slate-600">
              {h.fechaInicio} → {h.fechaFin ?? "actualidad"}
            </div>
            {h.razonCambio && (
              <div className="text-slate-500 mt-1 italic">“{h.razonCambio}”</div>
            )}
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">
              Por: {h.cambiadoPor || "—"}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Post-create: el instructor ya tiene cuenta auth (la creó la API route).
// Solo mostramos las credenciales para que el director se las comparta.
function PostCreateCredentials({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const username = email.split("@")[0];
  const [copiado, setCopiado] = useState<"" | "username" | "password" | "todo">("");

  const copiar = async (texto: string, key: "username" | "password" | "todo") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(key);
      setTimeout(() => setCopiado(""), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold uppercase tracking-widest">
        Listo — el instructor ya puede iniciar sesión
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Usuario
          </p>
          <div className="flex gap-2">
            <div className="flex-1 p-2 bg-slate-100 rounded-xl font-mono text-sm break-all">
              {username}
            </div>
            <Button variant="outline" onClick={() => copiar(username, "username")}>
              {copiado === "username" ? "✓" : "Copiar"}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Contraseña inicial
          </p>
          <div className="flex gap-2">
            <div className="flex-1 p-2 bg-slate-100 rounded-xl font-mono text-sm break-all">
              {password}
            </div>
            <Button variant="outline" onClick={() => copiar(password, "password")}>
              {copiado === "password" ? "✓" : "Copiar"}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Compártele estas credenciales al instructor por un canal privado
        (WhatsApp directo, no grupo). El instructor entra a{" "}
        <b>operoeducator.vercel.app</b>, escribe su usuario y contraseña,
        y puede cambiarla desde su perfil.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => copiar(`Usuario: ${username}\nContraseña: ${password}`, "todo")}
        >
          {copiado === "todo" ? "Copiado ✓" : "Copiar ambos"}
        </Button>
        <Button variant="primary" onClick={onClose}>
          Listo
        </Button>
      </div>
    </div>
  );
}
