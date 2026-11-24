// PRUEBA DE INTEGRACIÓN: un administrador (Ronald) actúa como entrenador de un nivel.
//   node tests/admin-entrenador.integracion.mjs
// Requiere el backend corriendo (BASE_URL, por defecto http://127.0.0.1:3995) y su MISMA base de datos (URI_MONGO).
// SEGURIDAD: crea usuarios y niveles de prueba con el prefijo "ZZ-prueba" y los borra al terminar; se niega a correr si
// URI_MONGO no es una base LOCAL (nunca debe ejecutarse contra Atlas).
import mongoose from "mongoose";
import usuarioModel from "../src/models/usuarios.model.js";
import NivelModel from "../src/models/nivel.model.js";
import { generarPassword } from "../src/helpers/bcrypt.helpers.js";

const URI = process.env.URI_MONGO || "";
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3995").replace(/\/$/, "") + "/api";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI)) {
  console.error("Se niega a correr: URI_MONGO debe apuntar a una base LOCAL (mongodb://127.0.0.1…).");
  process.exit(2);
}

const CLAVE = "ClaveSegura123";
const PREFIJO = "ZZ-prueba";
let fallos = 0;
const paso = (n, texto, ok, detalle = "") => { if (!ok) fallos++; console.log(`${ok ? "✔" : "✘"} ${n}. ${texto}${detalle ? `  → ${detalle}` : ""}`); };

const http = async (token, metodo, ruta, cuerpo, cabeceras = {}) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { "X-Token": token } : {}), ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: j };
};
const login = async (email) => (await http(null, "POST", "/auth/login", { email, contrasena: CLAVE })).body?.token;

await mongoose.connect(URI);
const db = mongoose.connection.db;
const limpiar = async () => {
  const us = await usuarioModel.find({ email: new RegExp(`^${PREFIJO.toLowerCase()}`) }).select("_id").lean();
  const ids = us.map((u) => u._id);
  await db.collection("perfilusuarios").deleteMany({ perteneceA: { $in: ids } });
  await db.collection("perfilusuarios").deleteMany({ numDocumento: new RegExp(`^${PREFIJO}`) }); // por si una corrida anterior quedó a medias
  await NivelModel.deleteMany({ nombre: new RegExp(`^${PREFIJO}`) });
  await usuarioModel.deleteMany({ _id: { $in: ids } });
};
await limpiar();

// ── Datos de prueba ──
const crear = async (rol, sufijo, extra = {}) => {
  const email = `${PREFIJO.toLowerCase()}-${sufijo}@club.co`;
  const u = new usuarioModel({ nombre: `ZZ ${sufijo}`, apellido: "Prueba", email, contrasena: generarPassword(CLAVE), rol, codigo: `${PREFIJO}-${sufijo}`.toUpperCase().slice(0, 14), status: true, estadoSolicitud: "Aprobada", ...extra });
  await u.save({ validateBeforeSave: false });
  return u;
};
const adminA = await crear("Administrador", "adminA");
const entrenador = await crear("Entrenador", "entrenador");
const atleta = await crear("Atleta", "atleta");
// Ronald: administrador SIN rol adicional y con la fecha de nacimiento futura que tiene en la base real
const ronald = await crear("Administrador", "ronald");
await db.collection("perfilusuarios").insertOne({ tipoDocumento: "Cédula de Ciudadanía", numDocumento: `${PREFIJO}-1`, genero: "Masculino", telefono: "3001112233", eps: "SURA", fechaNacimiento: new Date("2026-11-19T00:00:00Z"), perteneceA: ronald._id, createdAt: new Date(), updatedAt: new Date() });
const nivelBase = await NivelModel.create({ nombre: `${PREFIJO} Nivel base`, diasEntreno: 2, usuario: entrenador._id });

const tA = await login(adminA.email), tR = await login(ronald.email), tE = await login(entrenador.email), tAt = await login(atleta.email);
console.log("\nFlujo: administrador A activa el rol de entrenador de Ronald y lo asigna a un nivel\n");

// 1. Antes de activar: Ronald NO aparece y asignarlo es un 400 claro
let r = await http(tA, "GET", "/usuarios/entrenadores");
paso("0a", "Antes de activar el rol, Ronald no aparece en el selector", !r.body.data.some((u) => u.id === String(ronald._id)));
r = await http(tA, "POST", "/niveles", { nombre: `${PREFIJO} Nivel 4 Blood Tigers`, diasEntreno: 2, usuario: String(ronald._id) });
paso("0b", "Asignarlo sin el rol adicional se rechaza (400)", r.status === 400, `HTTP ${r.status} ${JSON.stringify(r.body?.errors ?? r.body?.msg)}`);

// (1) admin A activa rolesAdicionales: ['Entrenador'] en Ronald
r = await http(tA, "PATCH", `/usuarios/${ronald._id}/entrenador`, { activo: true });
paso(1, "El administrador A activa «También actúa como entrenador» en Ronald (aunque su fecha de nacimiento guardada sea inválida)", r.status === 200, `HTTP ${r.status} ${r.body?.msg ?? ""}`);
const enBd = await usuarioModel.findById(ronald._id).select("rolesAdicionales").lean();
paso("1b", "Se persistió (lectura directa a la base): rolesAdicionales = ['Entrenador']", JSON.stringify(enBd.rolesAdicionales) === '["Entrenador"]', JSON.stringify(enBd.rolesAdicionales));

// (2) aparece en el listado de entrenadores disponibles
r = await http(tA, "GET", "/usuarios/entrenadores");
const fila = r.body?.data?.find((u) => u.id === String(ronald._id));
paso(2, "Ronald aparece en el listado de entrenadores disponibles con la etiqueta correcta", fila?.etiqueta === "ZZ ronald Prueba · Administrador y entrenador", fila?.etiqueta ?? "no aparece");

// (3) se asigna como entrenador de «Nivel 4 Blood Tigers»
r = await http(tA, "POST", "/niveles", { nombre: `${PREFIJO} Nivel 4 Blood Tigers`, diasEntreno: 2, usuario: String(ronald._id) });
paso(3, "Se asigna a Ronald como entrenador de un nivel nuevo (POST /niveles)", r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.body?.errors ?? r.body?.msg)}`);
const nivelId = r.body?.data?._id;
r = await http(tA, "PATCH", `/niveles/${nivelBase._id}`, { usuario: String(ronald._id) });
paso("3b", "También se puede reasignar un nivel existente a Ronald (PATCH /niveles/:id)", r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.body?.errors ?? r.body?.msg)}`);

// (4) GET de niveles lo devuelve resuelto
r = await http(tA, "GET", "/niveles");
const n = r.body?.data?.find((x) => x._id === nivelId);
paso(4, "GET /niveles devuelve al entrenador resuelto (id, nombre, válido)", n?.usuarioId === String(ronald._id) && n?.usuario?.nombre === "ZZ ronald" && n?.entrenadorValido === true, JSON.stringify({ usuarioId: n?.usuarioId, usuario: n?.usuario?.nombre, valido: n?.entrenadorValido }));

// (5) Ronald consulta sus niveles como entrenador (vista de entrenador)
r = await http(tR, "GET", "/niveles", null, { "X-Vista": "entrenador" });
const suyos = (r.body?.data ?? []).map((x) => x.nombre);
paso(5, "Con la vista de entrenador, Ronald solo ve los niveles que dirige", r.status === 200 && suyos.length === 2 && suyos.every((x) => x.startsWith(PREFIJO)), suyos.join(" | "));
r = await http(tR, "GET", "/auth/renovar-token");
paso("5b", "renovar-token devuelve todos sus roles sin cerrar sesión", r.status === 200 && r.body?.data?.rolesAdicionales?.includes("Entrenador"), JSON.stringify(r.body?.data?.rolesAdicionales));

// Restricciones (1.3)
console.log("\nRestricciones\n");
r = await http(tE, "PATCH", `/usuarios/${ronald._id}/entrenador`, { activo: false });
paso("6a", "Un entrenador no puede cambiar roles adicionales (403)", r.status === 403, `HTTP ${r.status}`);
r = await http(tAt, "PATCH", `/usuarios/${ronald._id}/entrenador`, { activo: false });
paso("6b", "Un atleta no puede cambiar roles adicionales (403)", r.status === 403, `HTTP ${r.status}`);
r = await http(tR, "PATCH", `/usuarios/${ronald._id}/rol`, { rol: "Atleta" });
paso("6c", "Un administrador no puede quitarse su propio rol de administrador (400)", r.status === 400, `HTTP ${r.status} ${r.body?.msg ?? ""}`);
r = await http(tA, "PATCH", `/usuarios/${ronald._id}/entrenador`, { activo: false });
paso("6d", "No se quita el rol de entrenador a quien tiene niveles (409 con la lista)", r.status === 409 && r.body?.niveles?.length === 2, `HTTP ${r.status} ${r.body?.msg ?? ""}`);

await limpiar();
await mongoose.disconnect();
console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallaron` : "\n✔ Todas las comprobaciones pasaron");
process.exit(fallos ? 1 : 0);
