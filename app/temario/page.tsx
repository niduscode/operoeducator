"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTemario } from "@/hooks/useTemario";
import {
  Curso,
  CURSOS,
  TemaSemana,
  emailToUsername,
} from "@/lib/types";
import { actualizarPdfSemana } from "@/lib/firestore";
import {
  PDF_MAX_BYTES,
  eliminarPdfTemario,
  subirPdfTemario,
} from "@/lib/storage";

// Validación: la semana 1 SIEMPRE arranca un martes (las clases son martes
// y miércoles). new Date("YYYY-MM-DD") interpreta UTC, así que parseamos
// manualmente para evitar el shift de zona horaria.
function esMartes(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [, y, mm, d] = m;
  const date = new Date(Number(y), Number(mm) - 1, Number(d));
  return date.getDay() === 2;
}

export default function TemarioPage() {
  const router = useRouter();
  const { user, userRole, userEmail, isLoading: authLoading } = useAuth();

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

  const [curso, setCurso] = useState<Curso>("Junior");

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light tracking-tight text-slate-900 mt-1">
              Gestión de Temario
            </h1>
            <p className="text-slate-500 mt-1 text-xs md:text-sm">
              Define las semanas y temas de cada curso. Las clases son siempre
              martes y miércoles.
            </p>
          </div>
        </div>

        {/* Tabs por curso */}
        <Card className="!p-4">
          <div className="flex gap-2 overflow-x-auto hide-scroll">
            {CURSOS.map((c) => (
              <button
                key={c}
                onClick={() => setCurso(c)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  curso === c
                    ? "bg-slate-900 text-white shadow-lg"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Card>

        {/* Editor del curso seleccionado.
            Re-monto el editor cuando cambia el curso (key={curso}) para que
            se reinicie el estado local con el temario fresco del nuevo curso. */}
        <TemarioEditor
          key={curso}
          curso={curso}
          directorUsername={directorUsername}
        />
      </div>
    </div>
  );
}

interface EditorProps {
  curso: Curso;
  directorUsername: string;
}

function TemarioEditor({ curso, directorUsername }: EditorProps) {
  const { temario, isLoading, save } = useTemario(curso);
  const toast = useToast();

  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [semanas, setSemanas] = useState<TemaSemana[]>([]);
  const [hidratado, setHidratado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fechaError = useMemo(() => {
    if (!fechaInicio) return "";
    return esMartes(fechaInicio)
      ? ""
      : "La fecha de inicio debe ser un martes (las clases empiezan los martes).";
  }, [fechaInicio]);
  const fechaValida = !!fechaInicio && !fechaError;

  // Hidratar el estado local con el temario de Firestore una sola vez (o
  // cuando aparece por primera vez). No re-hidratamos en cada onSnapshot
  // para no pisar lo que el director esté editando.
  useEffect(() => {
    if (isLoading) return;
    if (hidratado) return;
    if (temario) {
      setFechaInicio(temario.fechaInicio || "");
      setSemanas(temario.semanas.length > 0 ? temario.semanas : []);
    } else {
      setFechaInicio("");
      setSemanas([]);
    }
    setHidratado(true);
  }, [temario, isLoading, hidratado]);

  const agregarSemana = () => {
    setSemanas((prev) => [
      ...prev,
      {
        semanaNumero: prev.length + 1,
        titulo: "",
        descripcion: "",
        temaMartes: "",
        temaMiercoles: "",
      },
    ]);
  };

  const eliminarSemana = (idx: number) => {
    setSemanas((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Re-numeramos por consistencia visual (semanaNumero coincide con índice+1).
      return next.map((s, i) => ({ ...s, semanaNumero: i + 1 }));
    });
  };

  const updateSemana = (idx: number, patch: Partial<TemaSemana>) => {
    setSemanas((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  };

  // Persiste solo los campos PDF de UNA semana en Firestore (sin esperar a que
  // el director presione "Guardar temario"). Esto evita que un PDF subido
  // quede huérfano si el director no termina de guardar.
  const persistirPdf = async (
    idx: number,
    dia: "martes" | "miercoles",
    pdf: { url: string; nombre: string } | null
  ) => {
    await actualizarPdfSemana({
      curso,
      semanaIdx: idx,
      dia,
      pdf,
      actualizadoPor: directorUsername,
      semanasFallback: semanas.map((s, i) => ({
        ...s,
        semanaNumero: i + 1,
        titulo: s.titulo?.trim() || "",
        descripcion: s.descripcion?.trim() || "",
        temaMartes: s.temaMartes?.trim() || "",
        temaMiercoles: s.temaMiercoles?.trim() || "",
      })),
      fechaInicioFallback: fechaInicio,
    });
    // Reflejamos el cambio en local también, para que la UI vea la url al toque
    // (sin depender del re-snapshot, aunque el snapshot vendrá igual).
    if (dia === "martes") {
      updateSemana(idx, {
        pdfMartesUrl: pdf?.url ?? "",
        pdfMartesNombre: pdf?.nombre ?? "",
      });
    } else {
      updateSemana(idx, {
        pdfMiercolesUrl: pdf?.url ?? "",
        pdfMiercolesNombre: pdf?.nombre ?? "",
      });
    }
  };

  const handleGuardar = async () => {
    // Validaciones mínimas: fechaInicio obligatoria + martes; cada semana con título.
    if (!fechaInicio) {
      toast.warning("Ingresa la fecha de inicio del curso.");
      return;
    }
    if (!esMartes(fechaInicio)) {
      toast.error(
        "La fecha de inicio debe ser un martes (las clases empiezan los martes).",
      );
      return;
    }
    const sinTitulo = semanas.findIndex((s) => !s.titulo.trim());
    if (sinTitulo >= 0) {
      toast.warning(`La semana ${sinTitulo + 1} necesita un título.`);
      return;
    }
    setSubmitting(true);
    try {
      await save({
        curso,
        semanas: semanas.map((s, i) => ({
          ...s,
          semanaNumero: i + 1,
          titulo: s.titulo.trim(),
          descripcion: s.descripcion?.trim() || "",
          temaMartes: s.temaMartes?.trim() || "",
          temaMiercoles: s.temaMiercoles?.trim() || "",
        })),
        fechaInicio,
        actualizadoPor: directorUsername,
      });
      toast.success("Temario guardado.");
    } catch (err) {
      console.error("guardar temario:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar el temario.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !hidratado) {
    return (
      <Card>
        <div className="py-12 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={`Temario — ${curso}`} subtitle="Configuración general">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Fecha de inicio del curso (primer martes)"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              disabled={submitting}
            />
            {fechaError && (
              <p className="-mt-2 mb-2 text-[11px] font-bold text-rose-600">
                ⚠️ {fechaError}
              </p>
            )}
          </div>
          <div className="flex items-end">
            <div className="text-xs text-slate-500 leading-relaxed">
              La <b>semana 1</b> arranca este día. La semana actual se calcula
              en base a la fecha de hoy y se muestra automáticamente en el aula
              virtual.
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Semanas"
        subtitle={`${semanas.length} semana${semanas.length === 1 ? "" : "s"} cargada${semanas.length === 1 ? "" : "s"}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={agregarSemana}
              disabled={submitting}
            >
              + Agregar semana
            </Button>
            <Button
              variant="primary"
              onClick={handleGuardar}
              disabled={submitting || !fechaValida}
            >
              {submitting ? "Guardando..." : "Guardar temario"}
            </Button>
          </div>
        }
      >
        {semanas.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin semanas aún. Usa el botón “+ Agregar semana” para empezar.
          </div>
        ) : (
          <div className="space-y-4">
            {semanas.map((s, i) => (
              <div
                key={i}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">
                    Semana {i + 1}
                  </span>
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => eliminarSemana(i)}
                    disabled={submitting}
                  >
                    Eliminar
                  </Button>
                </div>
                <Input
                  label="Título"
                  value={s.titulo}
                  onChange={(e) => updateSemana(i, { titulo: e.target.value })}
                  placeholder="ej: Cortes básicos"
                  disabled={submitting}
                />
                <Input
                  label="Descripción (opcional)"
                  value={s.descripcion ?? ""}
                  onChange={(e) =>
                    updateSemana(i, { descripcion: e.target.value })
                  }
                  placeholder="Resumen de la semana"
                  disabled={submitting}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Tema del martes"
                    value={s.temaMartes ?? ""}
                    onChange={(e) =>
                      updateSemana(i, { temaMartes: e.target.value })
                    }
                    placeholder="ej: corte recto"
                    disabled={submitting}
                  />
                  <Input
                    label="Tema del miércoles"
                    value={s.temaMiercoles ?? ""}
                    onChange={(e) =>
                      updateSemana(i, { temaMiercoles: e.target.value })
                    }
                    placeholder="ej: degradé clásico"
                    disabled={submitting}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <PdfUploader
                    label="PDF del martes"
                    curso={curso}
                    semanaNumero={i + 1}
                    dia="martes"
                    url={s.pdfMartesUrl}
                    nombre={s.pdfMartesNombre}
                    onPersist={(pdf) => persistirPdf(i, "martes", pdf)}
                    onSuccess={(m) => toast.success(m)}
                    onError={(m) => toast.error(m)}
                    disabled={submitting}
                  />
                  <PdfUploader
                    label="PDF del miércoles"
                    curso={curso}
                    semanaNumero={i + 1}
                    dia="miercoles"
                    url={s.pdfMiercolesUrl}
                    nombre={s.pdfMiercolesNombre}
                    onPersist={(pdf) => persistirPdf(i, "miercoles", pdf)}
                    onSuccess={(m) => toast.success(m)}
                    onError={(m) => toast.error(m)}
                    disabled={submitting}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}

interface PdfUploaderProps {
  label: string;
  curso: Curso;
  semanaNumero: number;
  dia: "martes" | "miercoles";
  url?: string;
  nombre?: string;
  // Persiste el cambio del PDF en Firestore. Recibe el nuevo PDF (o null
  // para indicar borrado). Debe lanzar si la persistencia falla, para que
  // el uploader pueda mostrar el error y revertir el progress.
  onPersist: (pdf: { url: string; nombre: string } | null) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

function PdfUploader({
  label,
  curso,
  semanaNumero,
  dia,
  url,
  nombre,
  onPersist,
  onSuccess,
  onError,
  disabled,
}: PdfUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<"idle" | "uploading">("idle");
  const confirm = useConfirm();

  const seleccionar = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.type !== "application/pdf") {
      onError("El archivo debe ser un PDF.");
      return;
    }
    if (file.size > PDF_MAX_BYTES) {
      onError("El PDF supera el límite de 5 MB.");
      return;
    }
    setProgress("uploading");
    let nuevaUrl: string | null = null;
    try {
      const res = await subirPdfTemario(curso, semanaNumero, dia, file);
      nuevaUrl = res.url;
      // Persistimos en Firestore antes de borrar el anterior.
      await onPersist({ url: res.url, nombre: res.nombre });
      // Recién después borramos el archivo viejo de Storage (si había).
      if (url && url !== res.url) {
        await eliminarPdfTemario(url);
      }
      onSuccess("PDF guardado.");
    } catch (err) {
      console.error("subir pdf:", err);
      // Si subimos al storage pero falló la persistencia, limpiamos el huérfano.
      if (nuevaUrl) {
        await eliminarPdfTemario(nuevaUrl);
      }
      onError(err instanceof Error ? err.message : "No se pudo subir el PDF.");
    } finally {
      setProgress("idle");
    }
  };

  const handleEliminar = async () => {
    if (!url) return;
    const ok = await confirm({
      title: "¿Eliminar este PDF?",
      message:
        "El archivo se borrará de Storage y la referencia se quitará del temario. Esta acción no se puede deshacer.",
      variant: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    setProgress("uploading");
    try {
      // Primero quitamos la referencia del doc; luego borramos el archivo.
      // Si falla la persistencia, no perdimos el archivo todavía.
      await onPersist(null);
      await eliminarPdfTemario(url);
      onSuccess("PDF eliminado.");
    } catch (err) {
      console.error("eliminar pdf:", err);
      onError(err instanceof Error ? err.message : "No se pudo eliminar el PDF.");
    } finally {
      setProgress("idle");
    }
  };

  return (
    <div className="w-full">
      <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
        {label}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onFile}
        className="hidden"
      />
      {progress === "uploading" ? (
        <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 text-xs text-slate-500 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500" />
          Subiendo PDF…
        </div>
      ) : url ? (
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="text-base">📄</span>
            <span className="truncate font-mono">{nombre || "documento.pdf"}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100 transition-all"
            >
              Ver
            </a>
            <Button
              variant="outline"
              className="!px-3 !py-1.5 text-xs"
              onClick={seleccionar}
              disabled={disabled}
            >
              Reemplazar
            </Button>
            <Button
              variant="danger"
              className="!px-3 !py-1.5 text-xs"
              onClick={handleEliminar}
              disabled={disabled}
            >
              Eliminar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={seleccionar}
          disabled={disabled}
          className="w-full bg-slate-50 p-3 rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-100 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          Subir PDF (máx 5 MB)
        </button>
      )}
    </div>
  );
}
