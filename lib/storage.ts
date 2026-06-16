// Helpers de Firebase Storage para subir/eliminar PDFs del temario.
// Path convencionado: temario/{curso}/{semana}-{dia}-{timestamp}.pdf
//
// El nombre original del archivo se guarda en Firestore (TemaSemana.pdfXxxNombre)
// y se muestra en la UI; el path en Storage es interno y no se expone.

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "./firebase";
import type { Curso } from "./types";

export const PDF_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
  try {
    const ts = Date.now();
    const path = `temario/${curso}/${semanaNumero}-${dia}-${ts}.pdf`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: "application/pdf" });
    const url = await getDownloadURL(fileRef);
    return { url, nombre: file.name };
  } catch (err) {
    console.error("subirPdfTemario:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo subir el PDF.");
  }
}

// Borra un PDF a partir de su download URL. Si la URL no apunta a Storage
// o ya fue eliminada, ignoramos el error para no bloquear la UI (la URL
// se va a sobreescribir en el documento de Firestore igual).
export async function eliminarPdfTemario(url: string): Promise<void> {
  if (!url) return;
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch (err) {
    // object-not-found es esperable si el archivo ya no existe.
    const code = (err as { code?: string })?.code;
    if (code === "storage/object-not-found") return;
    console.error("eliminarPdfTemario:", err);
    // No relanzamos: el caller seguirá actualizando Firestore con url vacío.
  }
}

// ============================================================
// COMPROBANTES DE PAGO DE ALUMNOS
// ============================================================

export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
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

// Sube el comprobante a Storage y devuelve la URL pública + el nombre original.
// Path: comprobantes/{alumnoId}/{año}-{mes}-{timestamp}.{ext}
export async function subirComprobantePago(
  alumnoId: string,
  mes: number,
  año: number,
  file: File
): Promise<{ url: string; nombre: string }> {
  if (!COMPROBANTE_MIME_TYPES.includes(file.type as (typeof COMPROBANTE_MIME_TYPES)[number])) {
    throw new Error(
      "Formato no admitido. Sube una imagen (JPG/PNG/WEBP) o un PDF."
    );
  }
  if (file.size > COMPROBANTE_MAX_BYTES) {
    throw new Error("El archivo supera el límite de 5 MB.");
  }
  try {
    const ts = Date.now();
    const ext = EXT_BY_MIME[file.type] ?? "bin";
    const mm = String(mes).padStart(2, "0");
    const path = `comprobantes/${alumnoId}/${año}-${mm}-${ts}.${ext}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    const url = await getDownloadURL(fileRef);
    return { url, nombre: file.name };
  } catch (err) {
    console.error("subirComprobantePago:", err);
    if (err instanceof Error) throw err;
    throw new Error("No se pudo subir el comprobante.");
  }
}

// Borrado tolerante a errores: si el archivo ya no está en Storage, no
// relanzamos para no bloquear la eliminación del doc en Firestore.
export async function eliminarComprobantePago(url: string): Promise<void> {
  if (!url) return;
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "storage/object-not-found") return;
    console.error("eliminarComprobantePago:", err);
  }
}
