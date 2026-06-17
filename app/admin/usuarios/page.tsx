"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { getAppUsers } from "@/lib/queries";
import type { AppUser, StaffRole } from "@/lib/types";

interface CreatePayload {
  username: string;
  password: string;
  nombreCompleto: string;
  role: StaffRole;
}

// Página de gestión de directores y administradores.
//
// Sólo accesible para directores. Lee app_users vía RLS (los directores
// tienen SELECT habilitado por la migración 0009). Las mutaciones
// (crear / cambiar rol / borrar) pasan por /api/admin/users que opera
// con service_role server-side.
export default function AdminUsuariosPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  // Guard: sólo directores. Si entra un admin/instructor por URL directa,
  // lo redirigimos al dashboard.
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

  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getAppUsers()
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          toast.error(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick, toast]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Modal de creación.
  const [showCreate, setShowCreate] = useState(false);
  const [postCreate, setPostCreate] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const directores = useMemo(() => users.filter((u) => u.role === "director"), [users]);
  const admins = useMemo(() => users.filter((u) => u.role === "admin"), [users]);

  const handleCreate = useCallback(
    async (payload: CreatePayload) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "No se pudo crear el usuario.");
      }
      setShowCreate(false);
      setPostCreate({ username: payload.username, password: payload.password });
      reload();
    },
    [reload]
  );

  const handleChangeRole = useCallback(
    async (target: AppUser, newRole: StaffRole) => {
      if (newRole === target.role) return;
      const ok = await confirm({
        title: "Cambiar rol",
        message: (
          <span>
            ¿Cambiar a <b>{target.nombreCompleto}</b> de{" "}
            <b>{target.role}</b> a <b>{newRole}</b>?
          </span>
        ),
        confirmLabel: "Cambiar",
        variant: "primary",
      });
      if (!ok) return;
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: target.email, role: newRole }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error desconocido.");
        toast.success("Rol actualizado.");
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cambiar el rol.");
      }
    },
    [confirm, reload, toast]
  );

  const handleDelete = useCallback(
    async (target: AppUser) => {
      const ok = await confirm({
        title: "Eliminar usuario",
        message: (
          <span>
            Esto eliminará la cuenta de <b>{target.nombreCompleto}</b> ({target.username}).
            Esta acción no se puede deshacer.
          </span>
        ),
        confirmLabel: "Eliminar",
        variant: "danger",
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/admin/users?email=${encodeURIComponent(target.email)}`,
          { method: "DELETE" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error desconocido.");
        toast.success("Usuario eliminado.");
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    },
    [confirm, reload, toast]
  );

  if (authLoading || !user || userRole !== "director") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease]">
        <BackButton />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Usuarios staff
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              Directores y administradores con acceso al panel. Los instructores se gestionan desde{" "}
              <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-600">/instructores</code>.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + Crear usuario
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoleSection
            title="Directores"
            subtitle="Acceso total: pueden gestionar todo, incluyendo usuarios."
            users={directores}
            currentEmail={userEmail.toLowerCase()}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
            isLoading={isLoading}
            emptyMessage="No hay directores configurados."
          />
          <RoleSection
            title="Administradores"
            subtitle="Acceso operativo: registran pagos, gestionan alumnos, sin tocar usuarios."
            users={admins}
            currentEmail={userEmail.toLowerCase()}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
            isLoading={isLoading}
            emptyMessage="No hay administradores configurados."
          />
        </div>

        <Card className="!p-4 bg-amber-50 border-amber-100">
          <p className="text-xs text-amber-900 leading-relaxed">
            <b>Nota:</b> los usuarios se autentican con su <i>username</i> + contraseña en la
            pantalla de login. El sistema agrega automáticamente el dominio{" "}
            <code className="px-1 py-0.5 bg-amber-100 rounded">@operoeducator.internal</code>.
            Guarda la contraseña al momento de crear — no se puede recuperar después (sólo
            resetear desde Supabase Auth).
          </p>
        </Card>
      </div>

      {showCreate && (
        <CreateUserModal
          onCreate={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {postCreate && (
        <PostCreateCredentials
          username={postCreate.username}
          password={postCreate.password}
          onClose={() => setPostCreate(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Subcomponentes
// =====================================================================

interface RoleSectionProps {
  title: string;
  subtitle: string;
  users: AppUser[];
  currentEmail: string;
  onChangeRole: (u: AppUser, role: StaffRole) => void;
  onDelete: (u: AppUser) => void;
  isLoading: boolean;
  emptyMessage: string;
}

function RoleSection({
  title,
  subtitle,
  users,
  currentEmail,
  onChangeRole,
  onDelete,
  isLoading,
  emptyMessage,
}: RoleSectionProps) {
  return (
    <Card title={title} subtitle={subtitle}>
      {isLoading ? (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-6">{emptyMessage}</p>
      ) : (
        <div className="space-y-2 mt-2">
          {users.map((u) => {
            const isSelf = u.email.toLowerCase() === currentEmail;
            const otherRole: StaffRole = u.role === "director" ? "admin" : "director";
            return (
              <div
                key={u.email}
                className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {u.nombreCompleto}
                    {isSelf && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-brand-500">
                        Tú
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{u.username}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => onChangeRole(u, otherRole)}
                    disabled={isSelf}
                  >
                    A {otherRole}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => onDelete(u)}
                    disabled={isSelf}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

interface CreateUserModalProps {
  onCreate: (payload: CreatePayload) => Promise<void>;
  onClose: () => void;
}

function CreateUserModal({ onCreate, onClose }: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [role, setRole] = useState<StaffRole>("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9.]+$/.test(cleanUsername)) {
      setError("Username: solo minúsculas, números y puntos (ej: director.juan).");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (!nombreCompleto.trim()) {
      setError("Ingresa el nombre completo.");
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        username: cleanUsername,
        password,
        nombreCompleto: nombreCompleto.trim(),
        role,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Crear usuario staff" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-2">
        <Input
          label="Username (sin @)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="director.juan"
          required
          disabled={submitting}
        />
        <Input
          label="Nombre completo"
          value={nombreCompleto}
          onChange={(e) => setNombreCompleto(e.target.value)}
          placeholder="Juan Pérez"
          required
          disabled={submitting}
        />
        <div className="w-full mb-4">
          <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            Contraseña (mín. 6 caracteres)
          </label>
          <div className="flex gap-2">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              minLength={6}
              className="flex-1 bg-slate-50 p-3 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="px-3 py-2 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        <Select
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          options={[
            { value: "admin", label: "Administrador" },
            { value: "director", label: "Director" },
          ]}
        />

        {error && (
          <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface PostCreateCredentialsProps {
  username: string;
  password: string;
  onClose: () => void;
}

function PostCreateCredentials({
  username,
  password,
  onClose,
}: PostCreateCredentialsProps) {
  const [copied, setCopied] = useState(false);
  const text = `Username: ${username}\nContraseña: ${password}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignoramos: el usuario puede copiar a mano.
    }
  };

  return (
    <Modal title="Usuario creado" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Comparte estas credenciales con la persona. Guárdalas: la contraseña no se puede
          recuperar después, sólo resetear.
        </p>
        <div className="p-4 bg-slate-900 text-white rounded-2xl font-mono text-sm space-y-1">
          <div>
            <span className="text-slate-400">Username:</span> {username}
          </div>
          <div>
            <span className="text-slate-400">Contraseña:</span> {password}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? "Copiado ✓" : "Copiar"}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
