// Helpers para exportar tablas a XLSX usando la librería `xlsx` (ya
// instalada en el proyecto). Funciona client-side (genera un Blob y lo
// descarga). No depende de servidor.
//
// xlsx pesa ~400KB minificado; lo cargamos DINÁMICAMENTE solo cuando el
// usuario aprieta "Exportar". Esto evita meterlo en el bundle inicial de
// /alumnos /instructores /pagos /pagos-alumnos y mejora TTI notablemente.

// Sanea un nombre de archivo: quita caracteres ilegales en Windows/macOS,
// colapsa espacios y limita longitud para evitar errores al descargar.
function safeFileName(name: string): string {
  const sin = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  const limited = sin.slice(0, 80) || "export";
  return `${limited}.xlsx`;
}

export interface ExportarAExcelOptions {
  // Nombre interno de la hoja (default "Datos"). Excel limita a 31 chars.
  sheetName?: string;
  // Si quieres forzar un orden de columnas. Por defecto se infiere de la
  // primera fila.
  columnas?: string[];
}

// Descarga un .xlsx con las filas dadas. Usa el writeFile del lado cliente.
// async porque carga xlsx bajo demanda.
export async function exportarAExcel<T extends Record<string, unknown>>(
  filas: T[],
  nombreArchivo: string,
  options?: ExportarAExcelOptions
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheetName = (options?.sheetName ?? "Datos").slice(0, 31);
  // sheet vacía si no hay filas: deja headers de columnas si fueron provistas.
  const data = filas.length === 0 && options?.columnas
    ? [options.columnas.reduce<Record<string, unknown>>((acc, c) => {
        acc[c] = "";
        return acc;
      }, {})]
    : filas;

  const ws = XLSX.utils.json_to_sheet(data, {
    header: options?.columnas,
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, safeFileName(nombreArchivo));
}

// Helper para fechas/montos: convierte a string para evitar que XLSX intente
// interpretarlos como fechas/serial. Mantiene precisión y evita locale.
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}
