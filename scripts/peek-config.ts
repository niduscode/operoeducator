import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
const SA = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".firebase-service-account.json"), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore();

(async () => {
  const c = await db.collection("configPagos").doc("default").get();
  console.log("configPagos/default:", JSON.stringify(c.data(), null, 2));
  console.log("\n--- Alumno corrupto dBIjYitgHLRSG015uJNC ---");
  const a = await db.collection("alumnos").doc("dBIjYitgHLRSG015uJNC").get();
  console.log(a.exists ? JSON.stringify(a.data(), null, 2) : "no existe");
  console.log("\n--- Asistencias del 2026-04-30 ---");
  const ax = await db.collection("asistenciasAlumnos").where("fecha", "==", "2026-04-30").get();
  ax.docs.forEach(d => console.log(d.id, JSON.stringify({ alumnoId: d.data().alumnoId, sucursal: d.data().sucursal, curso: d.data().curso, registradaPor: d.data().registradaPor })));
  console.log("\n--- Asistencia profe guía fuera de día ---");
  const apg = await db.collection("asistenciasProfesGuias").get();
  apg.docs.forEach(d => {
    const f = d.data().fecha;
    const dt = new Date(f + "T12:00:00Z");
    if (dt.getUTCDay() !== 2 && dt.getUTCDay() !== 3) {
      console.log(d.id, "fecha=", f, "dow=", dt.getUTCDay(), JSON.stringify(d.data()));
    }
  });
})().then(() => process.exit(0));
