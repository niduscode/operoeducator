// Lectura de verificación: muestra una muestra de los docs creados.
import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

const SA = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), ".firebase-service-account.json"), "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore();

async function main() {
  const colecciones = [
    "alumnos",
    "profesGuias",
    "instructores",
    "asistenciasAlumnos",
    "evaluacionesAlumnos",
    "asistenciasProfesGuias",
  ];
  for (const c of colecciones) {
    const snap = await db.collection(c).get();
    console.log(`${c}: ${snap.size} docs`);
  }
  console.log("\n--- 1 alumno de ejemplo ---");
  const s = await db.collection("alumnos").limit(1).get();
  if (s.size > 0) console.log(s.docs[0].id, s.docs[0].data());

  console.log("\n--- 1 asistencia de ejemplo ---");
  const a = await db.collection("asistenciasAlumnos").limit(1).get();
  if (a.size > 0) console.log(a.docs[0].id, a.docs[0].data());

  console.log("\n--- instructor.test.puertomontt ---");
  const i = await db.collection("instructores")
    .where("username", "==", "instructor.test.puertomontt").get();
  i.docs.forEach((d) => console.log(d.id, d.data()));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
