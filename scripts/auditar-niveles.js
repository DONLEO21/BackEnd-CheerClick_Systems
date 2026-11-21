// AUDITORÍA DE NIVELES (solo lectura: no modifica ni borra nada).
//   node --env-file .env scripts/auditar-niveles.js
//
// Sirve para decidir qué hacer con un nivel dudoso (p. ej. "Nivel 3" junto a "Nivel 3 Magic"): lista cada nivel con su
// estado, entrenador, # de atletas, # de horarios y fecha de creación, y marca los sospechosos:
//   · nombre repetido o muy parecido a otro (mismo texto sin tildes / uno es prefijo del otro)
//   · sin atletas y sin horarios (puede ser un registro de prueba)
//   · sin entrenador asignado
import mongoose from "mongoose";
import NivelModel from "../src/models/nivel.model.js";
import usuarioModel from "../src/models/usuarios.model.js";
import PlantillaHorarioModel from "../src/models/plantilla_horario.model.js";

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const niveles = await NivelModel.find().populate("usuario", "nombre apellido").sort({ createdAt: 1 }).lean();
const filas = [];
for (const n of niveles) {
  const [atletas, horarios] = await Promise.all([
    usuarioModel.countDocuments({ rol: "Atleta", nivel: n._id }),
    PlantillaHorarioModel.countDocuments({ nivel: n._id }),
  ]);
  filas.push({ n, atletas, horarios });
}

const nombres = filas.map((f) => norm(f.n.nombre));
console.log(`\nNiveles encontrados: ${filas.length}\n`);
for (const { n, atletas, horarios } of filas) {
  const me = norm(n.nombre);
  const avisos = [];
  if (nombres.filter((x) => x === me).length > 1) avisos.push("NOMBRE DUPLICADO");
  const parecido = filas.find((o) => o.n._id.toString() !== n._id.toString() && (norm(o.n.nombre).startsWith(me) || me.startsWith(norm(o.n.nombre))));
  if (parecido) avisos.push(`parecido a «${parecido.n.nombre}»`);
  if (atletas === 0 && horarios === 0) avisos.push("sin atletas ni horarios (¿prueba?)");
  if (!n.usuario) avisos.push("sin entrenador");
  console.log(
    `${avisos.length ? "⚠ " : "  "}${String(n.nombre).padEnd(26)} estado=${n.estado.padEnd(8)} atletas=${String(atletas).padStart(3)} horarios=${String(horarios).padStart(2)} ` +
    `entrenador=${n.usuario ? `${n.usuario.nombre} ${n.usuario.apellido}` : "—"} creado=${new Date(n.createdAt).toISOString().slice(0, 10)} id=${n._id}` +
    (avisos.length ? `\n     → ${avisos.join(" · ")}` : "")
  );
}
console.log("\nNo se borró ni se cambió nada. Para deshabilitar un nivel: PATCH /api/niveles/:id { \"estado\": \"Inactivo\" } (desde Horarios en la app).");
await mongoose.disconnect();
