"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";

export interface SearchableTableColumn<T> {
  key: string;
  header: ReactNode;
  // Renderizado por celda. Recibe la fila completa y devuelve nodo.
  render: (row: T) => ReactNode;
  // Clase para la celda (ej. text-right, font-mono). Aplicada a <td> y <th>.
  className?: string;
  // Por defecto, tdClassName == className. Si quieres distinto en header
  // y celdas, define ambos.
  tdClassName?: string;
  thClassName?: string;
}

interface SearchableTableProps<T> {
  data: T[];
  columns: SearchableTableColumn<T>[];
  // Devuelve el "string del registro" sobre el que se busca. Se concatenan
  // los campos definidos por el caller. Hacer lowercase aquí.
  searchableFields: (row: T) => string;
  pageSize?: number;
  rowKey: (row: T) => string;
  // Mensaje si la tabla está vacía después de filtrar.
  emptyMessage?: string;
  // Mensaje si NO hay registros base (data.length === 0).
  emptyBaseMessage?: string;
  // Texto del placeholder del input. Default: "Buscar...".
  searchPlaceholder?: string;
  // Acciones extra a la derecha del search bar (ej. botón Exportar Excel).
  toolbar?: ReactNode;
  minWidth?: string;
}

const DEFAULT_PAGE_SIZE = 25;

export default function SearchableTable<T>({
  data,
  columns,
  searchableFields,
  pageSize = DEFAULT_PAGE_SIZE,
  rowKey,
  emptyMessage = "Sin resultados.",
  emptyBaseMessage,
  searchPlaceholder = "Buscar...",
  toolbar,
  minWidth = "720px",
}: SearchableTableProps<T>) {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      searchableFields(row).toLowerCase().includes(q)
    );
  }, [data, busqueda, searchableFields]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / pageSize));

  // Reset paginación si cambia la cantidad o el filtro.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, data.length, pageSize]);

  // Si la página actual queda fuera de rango (por borrado), retroceder.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const inicio = (pagina - 1) * pageSize;
  const visibles = filtradas.slice(inicio, inicio + pageSize);

  const baseEmpty = data.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full sm:max-w-xs bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-sm text-slate-900"
        />
        {toolbar && (
          <div className="flex flex-wrap gap-2 justify-end">{toolbar}</div>
        )}
      </div>

      {baseEmpty ? (
        <div className="py-12 text-center text-sm text-slate-500">
          {emptyBaseMessage ?? emptyMessage}
        </div>
      ) : visibles.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth }}>
            <thead>
              <tr className="text-left text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`pb-3 pr-3 ${col.thClassName ?? col.className ?? ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-slate-50 hover:bg-slate-50/50 align-top"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 pr-3 ${col.tdClassName ?? col.className ?? ""}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!baseEmpty && filtradas.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>
            Mostrando <b className="text-slate-700">{inicio + 1}</b>–
            <b className="text-slate-700">
              {Math.min(inicio + pageSize, filtradas.length)}
            </b>{" "}
            de <b className="text-slate-700">{filtradas.length}</b>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-xs"
            >
              ← Anterior
            </button>
            <span className="px-2">
              Página <b className="text-slate-700">{pagina}</b> de{" "}
              <b className="text-slate-700">{totalPaginas}</b>
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina === totalPaginas}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-xs"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
