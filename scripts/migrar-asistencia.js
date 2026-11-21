// Migración de la colección "asistencias" (idempotente: se puede ejecutar varias veces).
//   node --env-file .env scripts/migrar-asistencia.js
// (el servidor ya hace lo mismo al arrancar; el script sirve para ejecutarla de forma manual)
import mongoose from "mongoose";
import { migrarIndicesAsistencia } from "../src/helpers/migraciones.helpers.js";

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");
const { eliminado, indices } = await migrarIndicesAsistencia();
console.log(eliminado ? `Índice eliminado: ${eliminado}` : "No había índice antiguo { usuario, horario } (nada que eliminar).");
console.log("Índices actuales:", indices.join(", "));
await mongoose.disconnect();
