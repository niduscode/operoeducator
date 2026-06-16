// Helpers de Supabase Storage para subir/eliminar PDFs del temario y
// comprobantes de pago. Path: bucket/{tipo}/...
//
// Buckets esperados en Supabase:
//   - "temario"        (público — instructor/alumno necesitan abrir el PDF)
//   - "comprobantes"   (privado — solo director/admin)
//
// Si los buckets no existen, créalos desde el Dashboard de Supabase →
// Storage. Configuración recomendada:
//   temario: Public bucket, max file size 5MB, allowed mime application/pdf
//   comprobantes: Private bucket, max file size 5MB, allowed mime
//     image/jpeg, image/png, image/webp, application/pdf

import { supabase } from "./supabase";
import type { Curso } from "./types";

const BUCKET_TEMARIO = "temario";
const BUCKET_COMPROBANTES = "comprobantes";

export const PDF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// =====================================================================
// PDFs del temario (bucket público)
// =====================================================================

export async function subirPdfTemario(
  curso: Curso,
  semanaNumero: number,
  dia: "martes" | "miercoles",
  file: File
): Promise<{ url: string; nombre: string }> {
  if (file.type !== "application/pdf") {
    throw new Error("El archivo debe ser un PDF.");
  }
  if (file.size > PDF_MAX_BYTES) {
    throw new Error("El PDF supera el límite de 5 MB.");
  }
  const ts = Date.now();
  const path = `${curso}/${semanaNumero}-${dia}-${ts}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET_TEMARIO)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) {
    console.error("subirPdfTemario:", error);
    throw new Error(`No se pudo subir el PDF (${error.message}).`);
  }

  const { data } = supabase.storage.from(BUCKET_TEMARIO).getPublicUrl(path);
  return { url: data.publicUrl, nombre: file.name };
}

// Extrae el path interno (dentro del bucket) de una URL pública.
function extraerPathPublico(url: string, bucket: string): string | null {
  // Public URL: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

export async function eliminarPdfTemario(url: string): Promise<void> {
  if (!url) return;
  const path = extraerPathPublico(url, BUCKET_TEMARIO);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET_TEMARIO).remove([path]);
  if (error) {
    // Si el archivo ya no existe, no lo tratamos como bloqueante.
    if (error.message.toLowerCase().includes("not found")) return;
    console.error("eliminarPdfTemario:", error);
  }
}

// =====================================================================
// Comprobantes de pago (bucket privado — uso director/admin)
// =====================================================================

export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPROBANTE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function subirComprobantePago(
  alumnoId: string,
  mes: number,
  año: number,
  file: File
): Promise<{ url: string; nombre: string }> {
  if (!COMPROBANTE_MIME_TYPES.includes(file.type as (typeof COMPROBANTE_MIME_TYPES)[number])) {
    throw new Error("Formato no admitido. Sube una imagen (JPG/PNG/WEBP) o un PDF.");
  }
  if (file.size > COMPROBANTE_MAX_BYTES) {
    throw new Error("El archivo supera el límite de 5 MB.");
  }

  const ts = Date.now();
  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const mm = String(mes).padStart(2, "0");
  const path = `${alumnoId}/${año}-${mm}-${ts}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("subirComprobantePago:", error);
    throw new Error(`No se pudo subir el comprobante (${error.message}).`);
  }

  // Bucket privado: generamos URL FIRMADA con TTL largo (10 años) para
  // que se pueda visualizar desde el listado sin renovar tokens. Se
  // refresca al re-subir.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !signed) {
    console.error("subirComprobantePago signedUrl:", signErr);
    throw new Error("Comprobante subido pero no se pudo generar el link de visualización.");
  }

  return { url: signed.signedUrl, nombre: file.name };
}

export async function eliminarComprobantePago(url: string): Promise<void> {
  if (!url) return;
  // URL firmada: https://<ref>.supabase.co/storage/v1/object/sign/comprobantes/<path>?token=...
  const marker = `/storage/v1/object/sign/${BUCKET_COMPROBANTES}/`;
  const i = url.indexOf(marker);
  let path: string | null = null;
  if (i !== -1) {
    const after = url.slice(i + marker.length);
    path = decodeURIComponent(after.split("?")[0]);
  } else {
    path = extraerPathPublico(url, BUCKET_COMPROBANTES);
  }
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET_COMPROBANTES).remove([path]);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) return;
    console.error("eliminarComprobantePago:", error);
  }
}
