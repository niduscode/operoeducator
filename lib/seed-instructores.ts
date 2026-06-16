// Semilla de instructores de prueba.
//
// USO (manual, solo en desarrollo):
//   1) Importar y exponer en cualquier componente cliente con permisos de director:
//        import { seedInstructoresPrueba } from "@/lib/seed-instructores";
//        // luego, en un onClick temporal: seedInstructoresPrueba("director.christan")
//   2) O ejecutar desde la consola del navegador estando logueado como director:
//        // (window as any).seed = seedInstructoresPrueba; await seed("director.christan")
//
// NO se llama automáticamente en ningún lugar del código.
// Después de correrla, recuerda crear las cuentas de Firebase Auth manualmente
// (Authentication → Users → Add user) usando los emails que imprime en consola.

import { createInstructor } from "./firestore";
import { INTERNAL_DOMAIN, Sucursal } from "./types";

interface SeedRow {
  username: string;
  nombreCompleto: string;
  telefono?: string;
  sucursal: Sucursal;
}

const SEMILLA: SeedRow[] = [
  {
    username: "instructor.gregory",
    nombreCompleto: "Gregory Delgado",
    telefono: "+56 9 1234 5678",
    sucursal: "Temuco",
  },
  {
    username: "instructor.sofia",
    nombreCompleto: "Sofía Hernández",
    telefono: "+56 9 8765 4321",
    sucursal: "Puerto Montt",
  },
];

export async function seedInstructoresPrueba(
  creadoPor: string = "director.semilla"
): Promise<{ created: string[]; errors: string[] }> {
  const created: string[] = [];
  const errors: string[] = [];
  const fechaIngreso = new Date().toISOString().split("T")[0];
  const fechaCreacion = new Date().toISOString();

  for (const row of SEMILLA) {
    try {
      const id = await createInstructor({
        username: row.username,
        email: `${row.username}${INTERNAL_DOMAIN}`,
        nombreCompleto: row.nombreCompleto,
        telefono: row.telefono ?? "",
        sucursalActual: row.sucursal,
        activo: true,
        fechaIngreso,
        fechaCreacion,
        creadoPor,
        authVerificado: false,
      });
      created.push(`${row.username} (${id}) → ${row.sucursal}`);
      console.log(
        `[seed] ✅ ${row.username} creado. Email para Auth: ${row.username}${INTERNAL_DOMAIN}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${row.username}: ${msg}`);
      console.error(`[seed] ❌ ${row.username}: ${msg}`);
    }
  }

  console.log("[seed] Resumen:", { created, errors });
  return { created, errors };
}
