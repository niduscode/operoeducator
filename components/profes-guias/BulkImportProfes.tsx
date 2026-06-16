"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { SUCURSALES, Sucursal } from "@/lib/types";
import { ProfeGuiaInput } from "@/lib/firestore";

interface BulkImportProfesProps {
  onCancel: () => void;
  onImport: (valid: ProfeGuiaInput[]) => Promise<void>;
}

interface ParsedRow {
  raw: Record<string, string>;
  data: ProfeGuiaInput | null;
  errors: string[];
  rowIndex: number;
}

// Mismo patrón de aliases flexibles que BulkImport de alumnos.
const HEADER_ALIASES: Record<string, "nombre" | "telefono" | "sucursal"> = {
  nombre: "nombre",
  name: "nombre",
  "nombre completo": "nombre",
  profe: "nombre",
  "profe guia": "nombre",
  "profe guía": "nombre",

  telefono: "telefono",
  tel: "telefono",
  phone: "telefono",
  celular: "telefono",
  movil: "telefono",

  sucursal: "sucursal",
  sede: "sucursal",
  branch: "sucursal",
  ciudad: "sucursal",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeHeader(h: string): string {
  return stripAccents(h.trim().toLowerCase());
}

function normalizeSucursal(v: string): Sucursal | null {
  const n = stripAccents(v.trim().toLowerCase());
  const match = SUCURSALES.find(
    (s) => stripAccents(s.toLowerCase()) === n
  );
  return match ?? null;
}

function parseRow(raw: Record<string, string>, rowIndex: number): ParsedRow {
  const errors: string[] = [];

  const nombre = (raw.nombre ?? "").trim();
  if (!nombre) errors.push("nombre vacío");

  const telefono = (raw.telefono ?? "").trim();

  const sucursalRaw = (raw.sucursal ?? "").trim();
  const sucursal = sucursalRaw ? normalizeSucursal(sucursalRaw) : null;
  if (!sucursal) errors.push(`sucursal inválida ("${sucursalRaw}")`);

  const data: ProfeGuiaInput | null =
    errors.length === 0 && sucursal
      ? {
          nombre,
          telefono,
          sucursal,
          activo: true,
          fechaIngreso: new Date().toISOString().split("T")[0],
        }
      : null;

  return { raw, data, errors, rowIndex };
}

function parseRawSheet(rows: Record<string, string>[]): ParsedRow[] {
  return rows.map((row, i) => {
    const canonical: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      const canonKey = HEADER_ALIASES[normalizeHeader(key)];
      if (canonKey) canonical[canonKey] = String(val ?? "");
    }
    return parseRow(canonical, i + 2);
  });
}

export default function BulkImportProfes({
  onCancel,
  onImport,
}: BulkImportProfesProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const validRows = useMemo(() => rows.filter((r) => r.data), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.data), [rows]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error("Archivo vacío");
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
          raw: false,
        });
        const parsed = parseRawSheet(json);
        setRows(parsed);
        if (parsed.length === 0) {
          setParseError("El archivo no contiene filas de datos.");
        }
      } catch (err) {
        console.error("BulkImportProfes handleFile:", err);
        setParseError(
          "No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv válido."
        );
        setRows([]);
      }
    };
    reader.onerror = () => {
      setParseError("Error al leer el archivo.");
      setRows([]);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const template = [
      {
        nombre: "Carolina Soto",
        telefono: "+56 9 1234 5678",
        sucursal: "Puerto Montt",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ProfesGuias");
    XLSX.writeFile(wb, "plantilla-profes-guias.xlsx");
  };

  const handleConfirm = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(validRows.map((r) => r.data!));
    } finally {
      setImporting(false);
    }
  };

  const hasRows = rows.length > 0;
  const hasErrors = invalidRows.length > 0;

  return (
    <div className="space-y-4">
      {!hasRows && (
        <div className="space-y-3">
          <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-sm text-slate-600">
            <p className="mb-2">
              Sube un archivo <b>.xlsx</b>, <b>.xls</b> o <b>.csv</b> con las
              columnas:
            </p>
            <p className="font-mono text-xs bg-white p-2 rounded-lg border border-slate-200">
              nombre · telefono · sucursal
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Los nombres de columna aceptan variantes (mayúsculas, con o sin
              tilde). Los profes guías importados quedan{" "}
              <b>activos por defecto y sin alumnos asignados</b>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-[160px]">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFile}
              />
              <span className="block px-5 py-3 font-semibold rounded-2xl text-sm text-center bg-gradient-to-r from-brand-500 to-accent-400 text-white shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 cursor-pointer transition-all">
                Seleccionar archivo
              </span>
            </label>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              Descargar plantilla
            </Button>
          </div>

          {parseError && (
            <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
              {parseError}
            </div>
          )}
        </div>
      )}

      {hasRows && (
        <>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="text-xs text-slate-500">
              Archivo: <b className="text-slate-700">{fileName}</b> ·{" "}
              {rows.length} fila{rows.length === 1 ? "" : "s"}
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setRows([]);
                setFileName("");
                setParseError("");
              }}
              disabled={importing}
            >
              Cambiar archivo
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700">
              <p className="text-[10px] font-bold uppercase tracking-widest">
                Válidos
              </p>
              <p className="text-2xl font-light">{validRows.length}</p>
            </div>
            <div
              className={`p-3 rounded-2xl border ${
                hasErrors
                  ? "bg-rose-50 border-rose-100 text-rose-700"
                  : "bg-slate-50 border-slate-100 text-slate-500"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest">
                Con errores
              </p>
              <p className="text-2xl font-light">{invalidRows.length}</p>
            </div>
          </div>

          {hasErrors && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-700">
              <div className="flex justify-between items-center mb-2">
                <b>
                  {invalidRows.length} fila
                  {invalidRows.length === 1 ? "" : "s"} con errores
                </b>
                <button
                  type="button"
                  onClick={() => setShowAllErrors((v) => !v)}
                  className="underline font-semibold"
                >
                  {showAllErrors ? "ocultar" : "ver detalles"}
                </button>
              </div>
              {showAllErrors && (
                <ul className="space-y-1 max-h-32 overflow-y-auto hide-scroll">
                  {invalidRows.map((r) => (
                    <li key={r.rowIndex}>
                      Fila {r.rowIndex}: {r.errors.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] opacity-80">
                Al confirmar, las filas con errores se ignoran y solo se
                importan las válidas.
              </p>
            </div>
          )}

          <Card
            title="Vista previa"
            subtitle={`Mostrando ${Math.min(20, rows.length)} de ${rows.length}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 pr-2">Nombre</th>
                    <th className="pb-2 pr-2">Teléfono</th>
                    <th className="pb-2 pr-2">Sucursal</th>
                    <th className="pb-2 pr-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r) => (
                    <tr
                      key={r.rowIndex}
                      className="border-b border-slate-50 align-top"
                    >
                      <td className="py-2 pr-2 text-slate-400">{r.rowIndex}</td>
                      <td className="py-2 pr-2 text-slate-900">
                        {r.raw.nombre || (
                          <span className="text-rose-500">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-slate-500">
                        {r.raw.telefono || ""}
                      </td>
                      <td className="py-2 pr-2">{r.raw.sucursal || ""}</td>
                      <td className="py-2 pr-2">
                        {r.data ? (
                          <span className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700">
                            OK
                          </span>
                        ) : (
                          <span
                            className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700"
                            title={r.errors.join(", ")}
                          >
                            error
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={importing}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={importing || validRows.length === 0}
            >
              {importing
                ? "Importando..."
                : `Confirmar importación (${validRows.length})`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
