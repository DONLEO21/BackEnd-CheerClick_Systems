// AUDITORÍA DE FECHAS DE NACIMIENTO (solo lectura: no modifica nada):  npm run auditar:fechas
// Lista los perfiles cuya fecha de nacimiento incumple la regla (futura, inválida, administrador/entrenador menor de 18
// o atleta menor de 5). Sirve para corregirlos a mano; el sistema no los cambia en silencio.
import mongoose from "mongoose";
import perfilUsuarioModel from "../src/models/perfilUsuario.model.js";
import usuarioModel from "../src/models/usuarios.model.js";
import { validarFechaNacimiento } from "../src/helpers/fecha.helpers.js";

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const perfiles = await perfilUsuarioModel.find().select("perteneceA fechaNacimiento").lean();
const usuarios = new Map((await usuarioModel.find({ _id: { $in: perfiles.map((p) => p.perteneceA) } }).select("nombre apellido codigo rol").lean()).map((u) => [String(u._id), u]));

const invalidos = [];
for (const p of perfiles) {
  const u = usuarios.get(String(p.perteneceA));
  if (!u || !p.fechaNacimiento) continue;
  const motivo = validarFechaNacimiento(p.fechaNacimiento, u.rol);
  if (motivo) invalidos.push({ código: u.codigo ?? "—", nombre: `${u.nombre} ${u.apellido}`, rol: u.rol, nacimiento: new Date(p.fechaNacimiento).toISOString().slice(0, 10), motivo });
}

console.log(`Perfiles revisados: ${perfiles.length}`);
if (invalidos.length) console.table(invalidos);
console.log(invalidos.length ? `\n${invalidos.length} perfil(es) con fecha inválida. No se modificó nada.` : "\nTodas las fechas de nacimiento cumplen la regla.");
await mongoose.disconnect();
