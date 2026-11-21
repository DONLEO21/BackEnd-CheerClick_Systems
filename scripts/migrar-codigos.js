// Asigna códigos consecutivos (IM001, PG001, HA001 y SL001 para los pedidos) a los registros que todavía no los tienen.
//   node --env-file .env scripts/migrar-codigos.js
//
// Idempotente: solo toca documentos SIN código, en orden de creación, continuando desde el contador. Ejecutarlo de
// nuevo no cambia nada. Los códigos ya asignados no se modifican nunca. Al terminar deja cada contador en el valor
// correcto (el mayor número existente), de modo que los registros nuevos continúan la secuencia.
import mongoose from "mongoose";
import ImplementoModel from "../src/models/implementos.model.js";
import PagosModel from "../src/models/pagos.model.js";
import HabilidadesModel from "../src/models/habilidades.model.js";
import SolicitudModel from "../src/models/solicitud.model.js";
import contadorModel from "../src/models/contador.model.js";
import { formatearCodigo, asegurarContador } from "../src/helpers/consecutivo.helpers.js";

const ENTIDADES = [
  { nombre: "implementos", prefijo: "IM", modelo: ImplementoModel },
  { nombre: "pagos", prefijo: "PG", modelo: PagosModel },
  { nombre: "habilidades", prefijo: "HA", modelo: HabilidadesModel },
  { nombre: "pedidos (solicitudes)", prefijo: "SL", modelo: SolicitudModel },
];

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

for (const { nombre, prefijo, modelo } of ENTIDADES) {
  const coleccion = modelo.collection;
  const patron = new RegExp(`^${prefijo}(\\d+)$`);

  // Punto de partida: el mayor entre el contador actual y el mayor número ya usado en la colección
  const conCodigo = await coleccion.find({ codigo: { $type: "string" } }, { projection: { codigo: 1 } }).toArray();
  const mayorUsado = conCodigo.reduce((m, d) => Math.max(m, Number(patron.exec(d.codigo)?.[1] ?? 0)), 0);
  const contador = await contadorModel.findById(prefijo).lean();
  let siguiente = Math.max(mayorUsado, contador?.seq ?? 0);

  const pendientes = await coleccion.find({ $or: [{ codigo: { $exists: false } }, { codigo: null }, { codigo: "" }] }, { projection: { _id: 1 } })
    .sort({ createdAt: 1, _id: 1 }).toArray();

  if (pendientes.length > 0) {
    const operaciones = pendientes.map((d) => ({
      updateOne: { filter: { _id: d._id }, update: { $set: { codigo: formatearCodigo(prefijo, ++siguiente) } } },
    }));
    await coleccion.bulkWrite(operaciones, { ordered: true });
  }

  await asegurarContador(prefijo, siguiente);
  console.log(`${nombre}: ${pendientes.length} códigos asignados (${prefijo}); contador en ${siguiente}`);
}

await modeloIndices();
await mongoose.disconnect();

// Crea los índices únicos de `codigo` (después de asignar, para que no choque con documentos sin código)
async function modeloIndices() {
  for (const { modelo } of ENTIDADES) await modelo.createIndexes();
}
