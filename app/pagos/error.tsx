"use client";

// Error boundary específico para /pagos. Captura cualquier error que crashee
// la página y lo muestra en pantalla — para diagnosticar sin necesidad de
// abrir DevTools. Quitar/simplificar una vez identificada la causa.

import { useEffect } from "react";

export default function PagosErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/pagos] error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl">
          <h1 className="text-xl font-bold text-rose-700 mb-3">
            Error al cargar Pagos del Mes
          </h1>
          <div className="space-y-2 text-sm text-rose-900">
            <p>
              <b>Mensaje:</b>{" "}
              <code className="bg-white px-2 py-1 rounded">
                {error.message || "(sin mensaje)"}
              </code>
            </p>
            {error.digest && (
              <p>
                <b>Digest:</b>{" "}
                <code className="bg-white px-2 py-1 rounded">{error.digest}</code>
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-rose-600">
                Stack trace
              </summary>
              <pre className="mt-2 p-3 bg-white rounded text-[10px] leading-tight overflow-x-auto whitespace-pre-wrap break-words">
                {error.stack || "(sin stack)"}
              </pre>
            </details>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-slate-900 text-white rounded-2xl text-sm font-semibold hover:bg-slate-700 transition-all"
          >
            Intentar de nuevo
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-2xl text-sm font-semibold hover:bg-slate-200 transition-all"
          >
            Volver al panel
          </a>
        </div>
      </div>
    </div>
  );
}
