// AUDITORÍA DE IMÁGENES DE IMPLEMENTOS (solo lectura):  npm run auditar:imagenes
// Para cada implemento informa el tipo de imagen guardada (data-URL, URL http(s) o ruta del servidor), su tamaño y marca:
//   · imágenes REPETIDAS entre implementos (mismo contenido)
//   · rutas relativas que el servidor NO sirve (solo /uploads/fotos es público), que se ven rotas en la tienda
//   · imágenes vacías
import crypto from "node:crypto";
import mongoose from "mongoose";
import ImplementoModel from "../src/models/implementos.model.js";

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");
const lista = await ImplementoModel.find().select("nombre codigo imagen").sort({ createdAt: 1 }).lean();

const filas = lista.map((i) => {
  const img = String(i.imagen ?? "");
  const tipo = !img ? "vacía" : img.startsWith("data:") ? "data-URL" : /^https?:/.test(img) ? "URL externa" : "ruta del servidor";
  const servida = tipo !== "ruta del servidor" || img.startsWith("/uploads/fotos/");
  return { código: i.codigo ?? "—", nombre: i.nombre, tipo, "KB": Math.round(img.length / 1024), huella: img ? crypto.createHash("md5").update(img).digest("hex").slice(0, 8) : "-", "se sirve": servida ? "sí" : "NO (ruta no pública)" };
});
const cuenta = new Map();
for (const f of filas) if (f.huella !== "-") cuenta.set(f.huella, (cuenta.get(f.huella) ?? 0) + 1);
for (const f of filas) f.repetida = cuenta.get(f.huella) > 1 ? `SÍ (x${cuenta.get(f.huella)})` : "no";

console.table(filas);
const rotas = filas.filter((f) => f["se sirve"] !== "sí" || f.tipo === "vacía").length;
const repetidas = filas.filter((f) => f.repetida !== "no").length;
console.log(`\n${filas.length} implementos · ${rotas} con imagen que no se verá · ${repetidas} con imagen repetida. No se modificó nada.`);
await mongoose.disconnect();
