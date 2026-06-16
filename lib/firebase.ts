// =====================================================================
// SHIM post-migración a Supabase.
//
// El proyecto ya no usa Firebase. Este archivo existe SOLO porque
// algunos componentes viejos siguen importando `db` y `storage` por
// nombre. Re-exportamos placeholders que tiran un error si alguien
// intenta hablarles directo, salvo por `db` que apunta al cliente
// supabase para el caso simple de `from("tabla").select(...)`.
//
// TODO: migrar esos componentes a importar de "@/lib/supabase" y
// borrar este archivo.
// =====================================================================

import { supabase } from "./supabase";

// `db` re-exportado como el cliente Supabase para que importadores
// viejos que hagan `db.from("alumnos")` funcionen sin cambios.
// El método `.collection()` (estilo Firestore) NO se soporta — esos
// componentes ya se reescribieron a `.from()` o usan hooks.
export const db = supabase;

// Auth y Storage: stubs explícitos que tiran si alguien los usa.
export const auth = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "Firebase Auth fue removido. Usá supabase.auth en lib/supabase.ts."
      );
    },
  }
) as unknown as never;

export const storage = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "Firebase Storage fue removido. Usá Supabase Storage (cliente supabase + .storage)."
      );
    },
  }
) as unknown as never;

export default supabase;
