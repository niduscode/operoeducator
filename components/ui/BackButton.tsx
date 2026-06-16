"use client";

import Link from "next/link";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export default function BackButton({
  href = "/dashboard",
  label = "Volver al panel",
  className = "",
}: BackButtonProps) {
  return (
    <div className={`sticky top-2 z-40 flex ${className}`}>
      <Link href={href}>
        <button
          type="button"
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 text-base font-bold rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-800 active:scale-95 transition-all"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {label}
        </button>
      </Link>
    </div>
  );
}
