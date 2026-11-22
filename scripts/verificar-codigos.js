// VERIFICACIÓN DE CÓDIGOS (solo lectura):  npm run verificar:codigos   (o: node --env-file .env scripts/verificar-codigos.js)
//
// Recorre todos los modelos con código consecutivo y reporta:
//   · registros SIN código (debe ser 0)         · códigos DUPLICADOS (debe ser 0)
//   · códigos con FORMATO inválido (PREFIJO + al menos 3 dígitos)   · contador atrasado respecto al mayor código usado
// Incluye usuarios (AT/EN/AD) y PQRS (radicado PQ + número) para que el informe cubra todo. Termina con código 1 si
// encuentra algún problema (útil para CI / despliegues).
import mongoose from "mongoose";
import { ENTIDADES_CON_CODIGO } from "../src/helpers/entidadesConCodigo.js";
import usuarioModel from "../src/models/usuarios.model.js";
import PqrsModel from "../src/models/pqrs.model.js";
import contadorModel from "../src/models/contador.model.js";

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const filas = [];
let problemas = 0;

for (const { nombre, prefijo, modelo } of ENTIDADES_CON_CODIGO) {
  const col = modelo.collection;
  const patron = new RegExp(`^${prefijo}\\d{3,}$`);
  const docs = await col.find({}, { projection: { codigo: 1 } }).toArray();
  const sinCodigo = docs.filter((d) => typeof d.codigo !== "string" || d.codigo === "").length;
  const conteo = new Map();
  for (const d of docs) if (d.codigo) conteo.set(d.codigo, (conteo.get(d.codigo) ?? 0) + 1);
  const duplicados = [...conteo.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  const invalidos = docs.filter((d) => d.codigo && !patron.test(d.codigo)).map((d) => d.codigo);
  const mayor = docs.reduce((m, d) => Math.max(m, Number(patron.exec(d.codigo ?? "")?.[0]?.slice(prefijo.length) ?? 0)), 0);
  const contador = (await contadorModel.findById(prefijo).lean())?.seq ?? 0;
  const atrasado = contador < mayor;
  problemas += sinCodigo + duplicados.length + invalidos.length + (atrasado ? 1 : 0);
  filas.push({ entidad: nombre, prefijo, registros: docs.length, "sin código": sinCodigo, duplicados: duplicados.length, "formato inválido": invalidos.length, contador, "contador atrasado": atrasado ? "SÍ" : "no" });
}

// Ya personalizados antes de este cambio (solo se informan)
const usuarios = await usuarioModel.find({}, { codigo: 1, rol: 1, estadoSolicitud: 1 }).lean();
const usuariosAprobados = usuarios.filter((u) => u.estadoSolicitud !== "Pendiente" && u.estadoSolicitud !== "Rechazada");
const usuariosSin = usuariosAprobados.filter((u) => !u.codigo).length;
const usuariosMal = usuarios.filter((u) => u.codigo && !/^(AT|EN|AD)\d{3,}$/.test(u.codigo)).length;
const usuariosDup = usuarios.length - new Set(usuarios.map((u) => u.codigo).filter(Boolean)).size - usuarios.filter((u) => !u.codigo).length;
problemas += usuariosSin + usuariosMal + usuariosDup;
filas.push({ entidad: "usuarios (AT/EN/AD, ya existían)", prefijo: "AT/EN/AD", registros: usuarios.length, "sin código": usuariosSin, duplicados: usuariosDup, "formato inválido": usuariosMal, contador: "-", "contador atrasado": "-" });

const pqrs = await PqrsModel.find({}, { numero: 1 }).lean();
const numeros = pqrs.map((p) => p.numero);
const pqrsSin = numeros.filter((n) => !Number.isInteger(n)).length;
const pqrsDup = numeros.length - new Set(numeros).size;
problemas += pqrsSin + pqrsDup;
filas.push({ entidad: "PQRS (PQ0001, ya existía)", prefijo: "PQ", registros: pqrs.length, "sin código": pqrsSin, duplicados: pqrsDup, "formato inválido": 0, contador: "-", "contador atrasado": "-" });

console.table(filas);
console.log(problemas === 0 ? "\nOK: 0 registros sin código, 0 duplicados, 0 formatos inválidos." : `\nATENCIÓN: ${problemas} problema(s). Si faltan códigos ejecuta: npm run migrar:codigos`);
await mongoose.disconnect();
process.exit(problemas === 0 ? 0 : 1);
