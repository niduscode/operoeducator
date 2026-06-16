"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import SearchableTable, {
  SearchableTableColumn,
} from "@/components/ui/SearchableTable";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import ProfeGuiaForm from "@/components/alumnos/ProfeGuiaForm";
import BulkImportProfes from "@/components/profes-guias/BulkImportProfes";
import { useAuth } from "@/hooks/useAuth";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useProfesGuias } from "@/hooks/useProfesGuias";
import { ProfeGuia } from "@/lib/types";
import { ProfeGuiaInput } from "@/lib/firestore";

type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; profe: ProfeGuia }
  | { type: "import" };

export default function ProfesGuiasPage() {
  const router = useRouter();
  const { user, userRole, isLoading: authLoading } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const {
    profesGuias,
    isLoading: profesLoading,
    error: profesError,
    createProfeGuia,
    updateProfeGuia,
    deleteProfeGuia,
    reactivateProfeGuia,
    importMasivo,
  } = useProfesGuias(null, { incluirInactivos: mostrarInactivos });
  const { alumnos } = useAlumnos();

  const [modal, setModal] = useState<ModalState>({ type: "none" });

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

  // Conteo de alumnos por profeGuiaId
  const alumnosPorProfe = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of alumnos) {
      if (a.profeGuiaId) {
        map[a.profeGuiaId] = (map[a.profeGuiaId] ?? 0) + 1;
      }
    }
    return map;
  }, [alumnos]);

  const handleCreate = async (data: ProfeGuiaInput) => {
    await createProfeGuia(data);
    setModal({ type: "none" });
    toast.success("Profe guía agregado.");
  };

  const handleUpdate = async (id: string, data: ProfeGuiaInput) => {
    await updateProfeGuia(id, data);
    setModal({ type: "none" });
    toast.success("Profe guía actualizado.");
  };

  const handleDelete = async (profe: ProfeGuia) => {
    const count = alumnosPorProfe[profe.id] ?? 0;
    const ok = await confirm({
      title: "¿Desactivar profe guía?",
      message: (
        <>
          Vas a desactivar a <b>{profe.nombre}</b> ({profe.sucursal}).{" "}
          {count > 0 ? (
            <>
              ⚠️ Tiene <b>{count}</b> alumno{count === 1 ? "" : "s"} asignado
              {count === 1 ? "" : "s"} que quedarán sin profe guía. Sus pagos y
              asistencias se conservan.
            </>
          ) : (
            "Sus pagos y asistencias se conservan."
          )}
        </>
      ),
      variant: "danger",
      confirmLabel: "Desactivar",
    });
    if (!ok) return;
    try {
      await deleteProfeGuia(profe.id);
      toast.success("Profe guía desactivado.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo desactivar el profe guía.");
    }
  };

  const handleReactivate = async (profe: ProfeGuia) => {
    try {
      await reactivateProfeGuia(profe.id);
      toast.success(`${profe.nombre} fue reactivado.`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo reactivar el profe guía.");
    }
  };

  const handleImport = async (valid: ProfeGuiaInput[]) => {
    try {
      const ids = await importMasivo(valid);
      setModal({ type: "none" });
      toast.success(
        `${ids.length} profe${ids.length === 1 ? "" : "s"} guía importado${ids.length === 1 ? "" : "s"} correctamente.`
      );
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Error en la importación masiva."
      );
    }
  };

  if (authLoading || !user || userRole !== "director") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const columns: SearchableTableColumn<ProfeGuia>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (p) => (
        <>
          <b className="text-slate-900 block">{p.nombre}</b>
          <span className="text-[10px] text-slate-400">
            Ingreso: {p.fechaIngreso || "—"}
          </span>
        </>
      ),
    },
    {
      key: "telefono",
      header: "Teléfono",
      render: (p) => (
        <span className="text-slate-500 text-xs">{p.telefono || "—"}</span>
      ),
    },
    {
      key: "sucursal",
      header: "Sucursal",
      render: (p) => (
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {p.sucursal}
        </span>
      ),
    },
    {
      key: "alumnos",
      header: "Alumnos",
      render: (p) => {
        const count = alumnosPorProfe[p.id] ?? 0;
        return (
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
              count > 5
                ? "bg-amber-100 text-amber-700"
                : count === 0
                  ? "bg-slate-100 text-slate-500"
                  : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {count} asignado{count === 1 ? "" : "s"}
          </span>
        );
      },
    },
    {
      key: "estado",
      header: "Estado",
      render: (p) => (
        <span
          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
            p.activo
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-600"
          }`}
        >
          {p.activo ? "Activo" : "Inactivo"}
        </span>
      ),
    },
    {
      key: "acciones",
      header: <span className="block text-right">Acciones</span>,
      tdClassName: "text-right",
      render: (p) => (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            variant="outline"
            className="!px-3 !py-2 text-xs"
            onClick={() => setModal({ type: "edit", profe: p })}
          >
            Editar
          </Button>
          {p.activo ? (
            <Button
              variant="danger"
              className="!px-3 !py-2 text-xs"
              onClick={() => handleDelete(p)}
            >
              Desactivar
            </Button>
          ) : (
            <Button
              variant="warning"
              className="!px-3 !py-2 text-xs"
              onClick={() => handleReactivate(p)}
            >
              Reactivar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Gestión de Profes Guías
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              {profesGuias.length} profe{profesGuias.length === 1 ? "" : "s"}{" "}
              {mostrarInactivos ? "(incluyendo inactivos)" : "activos"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setModal({ type: "import" })}
            >
              Importar desde Excel/CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => setModal({ type: "create" })}
            >
              Agregar profe guía
            </Button>
          </div>
        </div>

        {profesError && (
          <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
            {profesError}
          </div>
        )}

        <Card title="Directorio" subtitle="Todos los profes guías">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={mostrarInactivos}
              onChange={(e) => setMostrarInactivos(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivos
          </label>

          {profesLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <SearchableTable
              data={profesGuias}
              columns={columns}
              rowKey={(p) => p.id}
              searchableFields={(p) =>
                `${p.nombre} ${p.telefono ?? ""} ${p.sucursal}`
              }
              searchPlaceholder="Buscar por nombre, teléfono, sucursal..."
              minWidth="780px"
              emptyMessage="Sin coincidencias."
              emptyBaseMessage="Aún no hay profes guías. Agrega el primero con el botón de arriba."
            />
          )}
        </Card>
      </div>

      {modal.type === "create" && (
        <Modal
          title="Agregar profe guía"
          onClose={() => setModal({ type: "none" })}
        >
          <ProfeGuiaForm
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {modal.type === "edit" && (
        <Modal
          title="Editar profe guía"
          onClose={() => setModal({ type: "none" })}
        >
          <ProfeGuiaForm
            initial={modal.profe}
            onSubmit={(data) => handleUpdate(modal.profe.id, data)}
            onCancel={() => setModal({ type: "none" })}
          />
        </Modal>
      )}

      {modal.type === "import" && (
        <Modal
          title="Importar profes guías desde Excel/CSV"
          onClose={() => setModal({ type: "none" })}
        >
          <BulkImportProfes
            onCancel={() => setModal({ type: "none" })}
            onImport={handleImport}
          />
        </Modal>
      )}
    </div>
  );
}
