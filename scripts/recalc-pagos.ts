// Recalcula pagos con el modelo escalado correcto
import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
const SA = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".firebase-service-account.json"), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(SA), projectId: SA.project_id });
const db = admin.firestore();

(async () => {
  const config = (await db.collection("configPagos").doc("default").get()).data()!;
  const primero = config.montoInstructorPrimerAlumno as number;
  const adicional = config.montoInstructorAlumnoAdicional as number;
  const tarifasProfe = config.tarifasProfeGuia as Record<string, number>;

  const alumnos = await db.collection("alumnos").get();
  const aluMap = new Map(alumnos.docs.map(d => [d.id, d.data()]));
  const profes = await db.collection("profesGuias").get();
  const profeMap = new Map(profes.docs.map(d => [d.id, d.data().nombre as string]));
  const instructores = await db.collection("instructores").get();
  const instrMap = new Map(instructores.docs.map(d => [d.id, d.data().username as string]));

  const asistencias = await db.collection("asistenciasAlumnos").get();
  const docs = asistencias.docs.map(d => d.data());

  // Filtrar Abril 2026 (mes con más asistencias)
  const mes = "2026-04";
  const efectivas = docs.filter(a => a.fecha?.startsWith(mes) && (a.estado === "Presente" || a.estado === "Tarde"));

  console.log(`\n=== Recalculo pagos ${mes} (modelo escalado: $${primero}/1° + $${adicional}/adic.) ===\n`);

  // Instructor: agrupar por (instructorId, fecha) y aplicar escalado
  const grupoInstr = new Map<string, Map<string, number>>();
  for (const a of efectivas) {
    const alu = aluMap.get(a.alumnoId);
    if (!alu) continue;
    const id = a.instructorIdSnapshot || alu.instructorId || "";
    if (!id) continue;
    const dias = grupoInstr.get(id) ?? new Map();
    dias.set(a.fecha, (dias.get(a.fecha) ?? 0) + 1);
    grupoInstr.set(id, dias);
  }
  let totalInstr = 0;
  console.log("--- Instructores ---");
  for (const [id, dias] of grupoInstr) {
    let sub = 0, alumnosTot = 0;
    for (const [, n] of dias) { sub += primero + Math.max(0, n - 1) * adicional; alumnosTot += n; }
    console.log(`  ${instrMap.get(id) ?? id}: ${dias.size} días, ${alumnosTot} asistencias → $${sub.toLocaleString("es-CL")}`);
    totalInstr += sub;
  }
  console.log(`  TOTAL INSTRUCTORES: $${totalInstr.toLocaleString("es-CL")}\n`);

  // Profes guías
  const totProfes = new Map<string, number>();
  for (const a of efectivas) {
    const alu = aluMap.get(a.alumnoId);
    if (!alu) continue;
    const id = a.profeGuiaIdSnapshot || alu.profeGuiaId || "";
    if (!id) continue;
    const t = a.tarifaProfeGuiaAplicada ?? tarifasProfe[a.curso] ?? 0;
    totProfes.set(id, (totProfes.get(id) ?? 0) + t);
  }
  let totalPg = 0;
  console.log("--- Profes guías ---");
  for (const [id, sub] of totProfes) {
    console.log(`  ${profeMap.get(id) ?? id}: $${sub.toLocaleString("es-CL")}`);
    totalPg += sub;
  }
  console.log(`  TOTAL PROFES GUÍAS: $${totalPg.toLocaleString("es-CL")}\n`);

  console.log(`>> TOTAL A LIQUIDAR ${mes}: $${(totalInstr + totalPg).toLocaleString("es-CL")}`);
})().then(() => process.exit(0));
