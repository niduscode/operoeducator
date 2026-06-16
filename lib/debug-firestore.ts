// Diagnóstico de permisos Firestore desde la consola del browser.
//
// Uso: importar este módulo una vez desde un componente cliente
// (ej. `import "@/lib/debug-firestore";` en algún 'use client' que cargue siempre).
// Luego en la consola del navegador:
//
//   await window.debugFirestore.whoami()
//   await window.debugFirestore.testReadAlumnos()
//   await window.debugFirestore.testWriteAlumno()
//   await window.debugFirestore.testReadProfesGuias()
//   await window.debugFirestore.testWriteProfeGuia()
//
// Cada test devuelve { ok, user, error?, data? } con el código Firebase del error
// (ej. "permission-denied") para correlacionar con las rules de la Console.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { determineRole, type UserRole } from "./types";

interface DiagnosticUser {
  email: string | null;
  uid: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
}

interface DiagnosticError {
  code?: string;
  name?: string;
  message: string;
}

interface DiagnosticResult {
  ok: boolean;
  user: DiagnosticUser;
  error?: DiagnosticError;
  data?: Record<string, unknown>;
}

function snapshotUser(): DiagnosticUser {
  const u = auth.currentUser;
  if (!u || !u.email) {
    return { email: null, uid: null, role: null, isAuthenticated: false };
  }
  return {
    email: u.email,
    uid: u.uid,
    role: determineRole(u.email),
    isAuthenticated: true,
  };
}

function formatError(err: unknown): DiagnosticError {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return { code, name: err.name, message: err.message };
  }
  return { message: String(err) };
}

function logResult(test: string, result: DiagnosticResult): void {
  // console.table en una sola fila para que el resumen sea escaneable.
  console.table([
    {
      test,
      ok: result.ok,
      email: result.user.email,
      role: result.user.role,
      errorCode: result.error?.code ?? "",
      errorMessage: result.error?.message ?? "",
    },
  ]);
}

export function whoami(): DiagnosticUser {
  const info = snapshotUser();
  console.table([info]);
  return info;
}

export async function testReadAlumnos(): Promise<DiagnosticResult> {
  const user = snapshotUser();
  const result: DiagnosticResult = { ok: false, user };
  try {
    const snap = await getDocs(collection(db, "alumnos"));
    result.ok = true;
    result.data = { count: snap.size };
  } catch (err) {
    result.error = formatError(err);
  }
  logResult("testReadAlumnos", result);
  return result;
}

export async function testWriteAlumno(): Promise<DiagnosticResult> {
  const user = snapshotUser();
  const result: DiagnosticResult = { ok: false, user };
  const ref = doc(collection(db, "alumnos"));
  try {
    await setDoc(ref, {
      __debug: true,
      nombre: "DEBUG_TEST_ALUMNO",
      sucursal: "Muermos",
      curso: "Junior",
      horario: "Mañana",
      fecha: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
    });
    result.ok = true;
    result.data = { writtenId: ref.id };
    try {
      await deleteDoc(ref);
    } catch (cleanupErr) {
      console.warn("[debug-firestore] write OK pero cleanup falló:", cleanupErr);
    }
  } catch (err) {
    result.error = formatError(err);
  }
  logResult("testWriteAlumno", result);
  return result;
}

export async function testReadProfesGuias(): Promise<DiagnosticResult> {
  const user = snapshotUser();
  const result: DiagnosticResult = { ok: false, user };
  try {
    const snap = await getDocs(collection(db, "profesGuias"));
    result.ok = true;
    result.data = { count: snap.size };
  } catch (err) {
    result.error = formatError(err);
  }
  logResult("testReadProfesGuias", result);
  return result;
}

export async function testWriteProfeGuia(): Promise<DiagnosticResult> {
  const user = snapshotUser();
  const result: DiagnosticResult = { ok: false, user };
  const ref = doc(collection(db, "profesGuias"));
  try {
    await setDoc(ref, {
      __debug: true,
      nombre: "DEBUG_TEST_PROFE",
      sucursal: "Muermos",
      activo: true,
      fechaIngreso: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
    });
    result.ok = true;
    result.data = { writtenId: ref.id };
    try {
      await deleteDoc(ref);
    } catch (cleanupErr) {
      console.warn("[debug-firestore] write OK pero cleanup falló:", cleanupErr);
    }
  } catch (err) {
    result.error = formatError(err);
  }
  logResult("testWriteProfeGuia", result);
  return result;
}

interface DebugFirestoreApi {
  whoami: typeof whoami;
  testReadAlumnos: typeof testReadAlumnos;
  testWriteAlumno: typeof testWriteAlumno;
  testReadProfesGuias: typeof testReadProfesGuias;
  testWriteProfeGuia: typeof testWriteProfeGuia;
}

declare global {
  interface Window {
    debugFirestore?: DebugFirestoreApi;
  }
}

if (typeof window !== "undefined") {
  window.debugFirestore = {
    whoami,
    testReadAlumnos,
    testWriteAlumno,
    testReadProfesGuias,
    testWriteProfeGuia,
  };
}
