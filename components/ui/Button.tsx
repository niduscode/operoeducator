"use client";

import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "danger" | "warning" | "ghost";
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export default function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
}: ButtonProps) {
  const base =
    "px-5 py-3 font-semibold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:active:scale-100 flex-shrink-0";

  const variants = {
    primary:
      "bg-gradient-to-r from-brand-500 to-accent-400 text-white shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50",
    outline:
      "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50",
    danger:
      "bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100",
    warning:
      "bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
