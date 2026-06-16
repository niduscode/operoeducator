"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import type { Alumno, Sucursal } from "@/lib/types";
import { useCursosTerminando } from "@/hooks/useCursosTerminando";

interface CertificacionesBannerProps {
  // Si pasas una sucursal, filtra (instructor solo ve la suya).
  sucursal?: Sucursal | null;
  // Si false, oculta el botón "Ir a Pagos del Mes" (p.ej. instructor que no
  // tiene acceso a /pagos).
  mostrarBotonPagos?: boolean;
}

// Banner verde-dorado que aparece arriba cuando hay alumnos certificándose hoy
// o recién certificados (≤ 3 días). Si no hay nada relevante, no renderiza.
//
// Diseño coherente con el resto de cards de los dashboards (rounded-2xl,
// fondo gradiente sutil, texto en slate-900). NO usa un layout nuevo —
// se inserta como una card más arriba del contenido habitual.
export default function CertificacionesBanner({
  sucursal,
  mostrarBotonPagos = true,
}: CertificacionesBannerProps) {
  const {
    cursosCertificandoseHoy,
    cursosCertificadosRecientes,
    cursosProximosATerminar,
  } = useCursosTerminando(sucursal ?? null);

  const hayHoy = cursosCertificandoseHoy.length > 0;
  const hayReciente = cursosCertificadosRecientes.length > 0;
  const hayProximos = cursosProximosATerminar.length > 0;

  if (!hayHoy && !hayReciente && !hayProximos) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4 md:p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {hayHoy && (
            <Linea
              icono="🎓"
              titulo="Hoy se certifican"
              alumnos={cursosCertificandoseHoy}
              tono="emerald"
            />
          )}
          {hayReciente && (
            <Linea
              icono="🏁"
              titulo="Certificados los últimos 3 días (pendiente liquidar)"
              alumnos={cursosCertificadosRecientes}
              tono="amber"
            />
          )}
          {hayProximos && (
            <Linea
              icono="⏳"
              titulo="Próximos a terminar (≤ 7 días)"
              alumnos={cursosProximosATerminar}
              tono="slate"
            />
          )}
        </div>
        {mostrarBotonPagos && (hayHoy || hayReciente) && (
          <Link href="/pagos" className="self-start md:self-auto">
            <Button variant="primary" className="!py-2 text-xs">
              Ir a Pagos del Mes
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function Linea({
  icono,
  titulo,
  alumnos,
  tono,
}: {
  icono: string;
  titulo: string;
  alumnos: Alumno[];
  tono: "emerald" | "amber" | "slate";
}) {
  const tonoColor =
    tono === "emerald"
      ? "text-emerald-700"
      : tono === "amber"
        ? "text-amber-700"
        : "text-slate-600";
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${tonoColor}`}>
        {icono} {titulo}
      </p>
      <p className="text-sm text-slate-800 mt-1 leading-snug">
        {alumnos
          .map((a) => `${a.nombre} (${a.curso}, ${a.sucursal})`)
          .join(" · ")}
      </p>
    </div>
  );
}
