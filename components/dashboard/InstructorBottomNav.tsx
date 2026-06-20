"use client";

// Bottom navigation bar fija para el rol instructor en MOBILE.
// Solo visible en md:hidden (oculto en desktop). Inspirado en el patrón
// de la app de barberos (app.simplifies.net): tab bar fijo con ítems
// compactos (icono + label corto) para no robar espacio vertical.
//
// Items: Inicio · Aulas · Mi Pago · Salir
// El item activo se marca con color brand (orange/amber) y el resto
// queda en slate. Los iconos son inline SVG (sin libs externas).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface ItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon: React.ReactNode;
}

function NavItem({ label, href, onClick, active, icon }: ItemProps) {
  const className = `flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 flex-1 transition-colors ${
    active ? "text-brand-500" : "text-slate-400 hover:text-slate-700"
  }`;
  const content = (
    <>
      <div className={`w-5 h-5 ${active ? "scale-110" : ""} transition-transform`}>
        {icon}
      </div>
      <span className="text-[10px] font-semibold leading-tight">{label}</span>
      {active && (
        <span className="absolute top-0 h-0.5 w-8 bg-brand-500 rounded-full" />
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`relative ${className}`}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`relative ${className}`}>
      {content}
    </button>
  );
}

export default function InstructorBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch max-w-md mx-auto px-2">
        <NavItem
          label="Inicio"
          href="/dashboard"
          active={pathname === "/dashboard"}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12l9-9 9 9" />
              <path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10" />
            </svg>
          }
        />
        <NavItem
          label="Aulas"
          href="/aulas"
          active={pathname.startsWith("/aulas")}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          }
        />
        <NavItem
          label="Mi pago"
          href="/mi-pago"
          active={pathname.startsWith("/mi-pago")}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="6" width="20" height="13" rx="2" />
              <path d="M2 11h20" />
              <path d="M6 16h4" />
            </svg>
          }
        />
        <NavItem
          label="Salir"
          onClick={handleLogout}
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          }
        />
      </div>
    </nav>
  );
}
