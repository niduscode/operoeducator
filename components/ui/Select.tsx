"use client";

import { ChangeEvent } from "react";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  required?: boolean;
  name?: string;
  disabled?: boolean;
}

export default function Select({
  label,
  value,
  onChange,
  options,
  required,
  name,
  disabled = false,
}: SelectProps) {
  return (
    <div className="mb-4 w-full">
      <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="w-full bg-slate-50 p-3 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm disabled:opacity-50"
      >
        {options.map((opt, i) => (
          <option key={i} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
