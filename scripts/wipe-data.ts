// Borra TODO en Firestore menos los instructores reales y resetea
// configPagos / preciosAlumnos a valores vacíos. Pensado para volver al
// estado "solo usuarios, nada de operación".
//
// Uso: npx tsx scripts/wipe-data.ts
//
// IRREVERSIBLE. Hace una pasada de dry-run primero (lista lo que va a borrar)
// y pide confirmación si NO se pasa --yes.

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
import * as readline from "readline";

const SA = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), ".firebase-service-account.json"), "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore();

// Colecciones que se borran COMPLETAS
const COLECCIONES_A_BORRAR = [
  "alumnos",
  "profesGuias",
  "asistenciasAlumnos",
  "asistenciasProfesGuias",
  "evaluacionesAlumnos",
  "pagosAlumnos",
  "pagosRealizados",
  "historialAsignaciones",
  "temarios",
];

// Username del instructor falso del seed: se borra también
const INSTRUCTOR_TEST_USERNAME = "instructor.test.puertomontt";

async function contar(coleccion: string): Promise<number> {
  const snap = await db.collection(coleccion).count().get();
  return snap.data().count;
}

async function borrarColeccionEnLotes(coleccion: string, batchSize = 400): Promise<number> {
  let totalBorrados = 0;
  while (true) {
    const snap = await db.collection(coleccion).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    totalBorrados += snap.size;
    if (snap.size < batchSize) break;
  }
  return totalBorrados;
}

async function borrarInstructorTest(): Promise<boolean> {
  const q = await db.collection("instructores")
    .where("username", "==", INSTRUCTOR_TEST_USERNAME).get();
  if (q.empty) return false;
  const batch = db.batch();
  for (const d of q.docs) batch.delete(d.ref);
  await batch.commit();
  return true;
}

async function resetearConfiguracion(): Promise<void> {
  // configPagos: deja el documento existente pero con todos los valores en 0
  // para que el director tenga que reconfigurar antes de operar.
  await db.collection("configPagos").doc("default").set(
    {
      tarifasInstructor: { Junior: 0, Senior: 0, Master: 0 },
      tarifasProfeGuia: { Junior: 0, Senior: 0, Master: 0 },
      montoInstructorPrimerAlumno: 0,
      montoInstructorAlumnoAdicional: 0,
      actualizadoPor: "wipe-script",
      actualizadoEn: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false }
  );

  // preciosAlumnos: precios en 0 y duraciones por defecto
  await db.collection("preciosAlumnos").doc("default").set(
    {
      Junior: 0,
      Senior: 0,
      Master: 0,
      duracionJunior: 8,
      duracionSenior: 16,
      duracionMaster: 8,
      actualizadoPor: "wipe-script",
      actualizadoEn: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false }
  );
}

function confirmar(msg: string): Promise<boolean> {
  if (process.argv.includes("--yes")) return Promise.resolve(true);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg + " ", (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "si" || ans.trim().toLowerCase() === "yes" || ans.trim() === "y");
    });
  });
}

async function main() {
  console.log("=== WIPE DATA — OperoEducator ===");
  console.log(`Proyecto: ${SA.project_id}\n`);

  console.log("Conteo actual:");
  for (const c of COLECCIONES_A_BORRAR) {
    const n = await contar(c);
    console.log(`  ${c}: ${n}`);
  }
  const inst = await db.collection("instructores").count().get();
  console.log(`  instructores (se preservan los reales): ${inst.data().count}`);
  const testQ = await db.collection("instructores")
    .where("username", "==", INSTRUCTOR_TEST_USERNAME).get();
  console.log(`  → instructor.test.puertomontt presente: ${!testQ.empty}\n`);

  const ok = await confirmar("¿Confirmas borrar todo lo de arriba + resetear config a CERO? (escribe 'si' o pásame --yes)");
  if (!ok) { console.log("Cancelado."); return; }

  console.log("\nBorrando colecciones operativas…");
  for (const c of COLECCIONES_A_BORRAR) {
    const n = await borrarColeccionEnLotes(c);
    console.log(`  ✅ ${c}: ${n} docs borrados`);
  }

  console.log("\nEliminando instructor de prueba…");
  const borrado = await borrarInstructorTest();
  console.log(`  ${borrado ? "✅ borrado" : "⏭  no existía"}: ${INSTRUCTOR_TEST_USERNAME}`);

  console.log("\nReseteando configuración a valores vacíos…");
  await resetearConfiguracion();
  console.log("  ✅ configPagos/default y preciosAlumnos/default reseteados a 0");

  console.log("\nConteo final:");
  for (const c of [...COLECCIONES_A_BORRAR, "instructores"]) {
    const n = await contar(c);
    console.log(`  ${c}: ${n}`);
  }
  console.log("\nListo. El director debe reconfigurar precios y tarifas antes de operar.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
