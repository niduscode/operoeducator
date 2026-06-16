"use client";

import { ChangeEvent } from "react";

interface InputProps {
  // label es opcional: en la variante "login" no se muestra
  label?: string;
  type?: string;
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
  step?: string;
  accept?: string;
  defaultValue?: string;
  // "default": estilo formulario con label arriba (bg-slate-50, p-3)
  // "login": estilo pantalla de login sin label, bg-white y p-4
  variant?: "default" | "login";
}

export default function Input({
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  name,
  disabled = false,
  step,
  accept,
  defaultValue,
  variant = "default",
}: InputProps) {
  const isLogin = variant === "login";

  // Wrapper: en variante default mantenemos mb-4; en login el form externo
  // controla el espaciado con space-y-4 para evitar doble margen.
  const wrapperClass = isLogin ? "w-full" : "mb-4 w-full";

  // Estilos del input según variante
  const inputClass = isLogin
    ? "w-full bg-white p-4 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm placeholder:text-slate-400 disabled:opacity-50"
    : "w-full bg-slate-50 p-3 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm disabled:opacity-50";

  return (
    <div className={wrapperClass}>
      {!isLogin && label && (
        <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          {label}
        </label>
      )}
      <input
        name={name}
        type={type}
        step={step}
        accept={accept}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={inputClass}
      />
    </div>
  );
}
