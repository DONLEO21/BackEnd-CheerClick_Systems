// AUDITORÍA DE COMPETENCIAS (solo lectura):  npm run auditar:competencias
// Lista las competencias y marca las sospechosas de ser duplicadas o de prueba (mismo nombre, nombre casi igual, letras
// repetidas tipo "Buenasssss", nombres muy cortos o sin inscripciones y ya pasadas). No modifica ni borra nada.
import mongoose from "mongoose";
import CompetenciaModel from "../src/models/competencia.model.js";
import "../src/models/nivel.model.js";   // registra el modelo Nivel para el populate
import Inscripciones_competenciasModel from "../src/models/inscripcion_competencia.model.js";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const lista = await CompetenciaModel.find().populate("nivel", "nombre").sort({ createdAt: 1 }).lean();
const conteo = new Map((await Inscripciones_competenciasModel.aggregate([{ $group: { _id: "$competencia", n: { $sum: 1 } } }])).map((x) => [String(x._id), x.n]));
const nombres = lista.map((c) => norm(c.nombre));

const filas = lista.map((c) => {
  const n = norm(c.nombre);
  const avisos = [];
  if (nombres.filter((x) => x === n).length > 1) avisos.push("NOMBRE REPETIDO");
  if (/(.)\1{3,}/.test(n)) avisos.push("letras repetidas (¿prueba?)");
  if (n.length < 5) avisos.push("nombre muy corto");
  if ((conteo.get(String(c._id)) ?? 0) === 0 && new Date(c.fechaCompetencia) < new Date()) avisos.push("pasada y sin inscripciones");
  return {
    código: c.codigo ?? "—", nombre: c.nombre, nivel: c.nivel?.nombre ?? "—", fecha: new Date(c.fechaCompetencia).toISOString().slice(0, 10),
    estado: c.estado, inscritos: conteo.get(String(c._id)) ?? 0, id: String(c._id), avisos: avisos.join(" · "),
  };
});
console.table(filas);
console.log(`\n${filas.filter((f) => f.avisos).length} de ${filas.length} competencias con avisos. No se modificó ni borró nada.`);
await mongoose.disconnect();
