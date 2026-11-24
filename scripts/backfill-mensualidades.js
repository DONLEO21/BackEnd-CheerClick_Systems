// BACKFILL DE MENSUALIDADES:  npm run backfill:mensualidades -- --dry-run
// Crea la mensualidad del PERIODO ACTUAL para los atletas activos, aprobados y con plan que no la tengan (idempotente).
//   --dry-run   solo LISTA a quién se le crearía (no escribe nada)
//   sin flag    la crea de verdad (con la notificación a cada atleta)
//   --sin-notificar   la crea sin avisar por la campanita
import mongoose from "mongoose";
import usuarioModel from "../src/models/usuarios.model.js";
import MensualidadModel from "../src/models/mensualidades.model.js";
import PlanAsociadoModel from "../src/models/planAsociado.model.js";
import { asegurarMensualidad, periodoDe, diaVencimiento } from "../src/services/generacionMensualidades.services.js";

const dry = process.argv.includes("--dry-run");
const notificarAtleta = !process.argv.includes("--sin-notificar");
await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const periodo = periodoDe();
const atletas = await usuarioModel.find({ rol: "Atleta", status: true, estadoSolicitud: "Aprobada" }).select("nombre apellido codigo planAsociado").lean();
const con = new Set((await MensualidadModel.find({ periodo }).select("usuario").lean()).map((m) => String(m.usuario)));
const planes = new Map((await PlanAsociadoModel.find().lean()).map((p) => [String(p._id), p]));

const faltan = atletas.filter((a) => a.planAsociado && !con.has(String(a._id)));
const sinPlan = atletas.filter((a) => !a.planAsociado);
console.log(`Periodo ${periodo} · vence el día ${diaVencimiento()} · atletas activos: ${atletas.length} · ya tienen: ${atletas.length - faltan.length - sinPlan.length} · sin plan: ${sinPlan.length}`);
console.table(faltan.map((a) => ({ código: a.codigo ?? "—", atleta: `${a.nombre} ${a.apellido}`, plan: planes.get(String(a.planAsociado))?.nombre ?? "(plan inexistente)", valor: planes.get(String(a.planAsociado))?.valor ?? "—" })));

if (dry) {
  console.log(`\nDRY-RUN: se crearían ${faltan.length} mensualidades. No se escribió nada.`);
} else {
  let creadas = 0;
  for (const a of faltan) {
    const r = await asegurarMensualidad(a._id, periodo, { notificarAtleta });
    if (r.estado === "creada") creadas += 1;
  }
  console.log(`\nCreadas: ${creadas} de ${faltan.length}.`);
}
await mongoose.disconnect();
