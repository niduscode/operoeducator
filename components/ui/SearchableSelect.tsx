"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface SearchableSelectOption<T> {
  value: string;
  label: string;
  // Subtítulo opcional a la derecha (ej. curso · sucursal).
  hint?: string;
  // Datos completos para custom rendering.
  raw?: T;
}

interface SearchableSelectProps<T> {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  emptyMessage?: string;
  // Acceso a más campos del raw para componer el match (default: label + hint).
  searchFields?: (opt: SearchableSelectOption<T>) => string;
  // Custom render por opción (ej. con badges).
  renderOption?: (opt: SearchableSelectOption<T>) => ReactNode;
  // Limita la lista a N resultados (perf en listas grandes).
  maxResults?: number;
}

export default function SearchableSelect<T>({
  label,
  value,
  onChange,
  options,
  placeholder = "Buscar...",
  disabled,
  required,
  emptyMessage = "Sin resultados.",
  searchFields,
  renderOption,
  maxResults = 50,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const seleccionada = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const matchFn = useCallback(
    (opt: SearchableSelectOption<T>) => {
      const fields = searchFields
        ? searchFields(opt)
        : `${opt.label} ${opt.hint ?? ""}`;
      return fields.toLowerCase();
    },
    [searchFields]
  );

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxResults);
    return options.filter((o) => matchFn(o).includes(q)).slice(0, maxResults);
  }, [options, query, matchFn, maxResults]);

  // Click fuera → cerrar.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Esc → cerrar.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((v) => {
      const next = !v;
      if (next)
        setTimeout(() => inputRef.current?.focus(), 0);
      return next;
    });
  };

  const handlePick = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="mb-4 w-full" ref={containerRef}>
      {label && (
        <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`w-full bg-slate-50 p-3 rounded-2xl border text-left text-sm flex justify-between items-center gap-2 transition-all outline-none ${
          open
            ? "border-brand-400 ring-4 ring-brand-500/20"
            : "border-slate-200 hover:border-slate-300"
        } disabled:opacity-50`}
      >
        <span
          className={`truncate ${seleccionada ? "text-slate-900" : "text-slate-400"}`}
        >
          {seleccionada
            ? seleccionada.label
            : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="relative">
          <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 outline-none text-sm text-slate-900"
              />
            </div>
            <ul className="max-h-60 overflow-y-auto hide-scroll">
              {filtradas.length === 0 ? (
                <li className="px-3 py-3 text-xs text-slate-400 text-center">
                  {emptyMessage}
                </li>
              ) : (
                filtradas.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        onClick={() => handlePick(opt.value)}
                        className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center gap-2 border-b border-slate-50 last:border-b-0 transition-colors ${
                          active
                            ? "bg-brand-50 text-brand-700"
                            : "bg-white hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        {renderOption ? (
                          renderOption(opt)
                        ) : (
                          <>
                            <span className="font-semibold truncate pr-2">
                              {opt.label}
                            </span>
                            {opt.hint && (
                              <span className="text-[10px] uppercase tracking-widest text-slate-400 flex-shrink-0">
                                {opt.hint}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
