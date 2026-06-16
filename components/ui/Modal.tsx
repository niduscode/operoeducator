"use client";

import { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  return (
    // Fondo con blur que cubre toda la pantalla (z-[100] para quedar sobre el resto)
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
      <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-light tracking-tight text-slate-900">
            {title}
          </h3>
          {/* Botón cerrar: equivalente visual al icono "check rotado 45°" del v1 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
