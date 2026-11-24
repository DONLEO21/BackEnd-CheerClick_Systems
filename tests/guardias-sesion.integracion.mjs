// PRUEBA DE INTEGRACIÓN: guardias de sesión (contraseña temporal → perfil completo → acceso normal).
//   PERFIL_OBLIGATORIO=true (en el backend que se prueba)   node tests/guardias-sesion.integracion.mjs
// Requiere el backend corriendo (BASE_URL, por defecto http://127.0.0.1:3995) con la MISMA base de datos (URI_MONGO) y con
// PERFIL_OBLIGATORIO=true. Crea datos "ZZ-prueba" y los borra al terminar. Se niega a correr contra una base que no sea local.
import mongoose from "mongoose";
import usuarioModel from "../src/models/usuarios.model.js";
import NivelModel from "../src/models/nivel.model.js";
import PlanAsociadoModel from "../src/models/planAsociado.model.js";
import { generarPassword } from "../src/helpers/bcrypt.helpers.js";

const URI = process.env.URI_MONGO || "";
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3995").replace(/\/$/, "") + "/api";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI)) { console.error("Se niega a correr: URI_MONGO debe ser una base LOCAL."); process.exit(2); }

const PREFIJO = "ZZ-prueba";
const TEMPORAL = "Temporal123";
let fallos = 0;
const paso = (n, texto, ok, detalle = "") => { if (!ok) fallos++; console.log(`${ok ? "✔" : "✘"} ${n}. ${texto}${detalle ? `  → ${detalle}` : ""}`); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const http = async (token, metodo, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { "X-Token": token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  let j = null; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, body: j };
};
const resumen = (r) => `HTTP ${r.status} ${r.body?.code ?? ""} ${r.body?.msg ?? ""} ${r.body?.errors ? JSON.stringify(r.body.errors) : ""}`.trim();

await mongoose.connect(URI);
const db = mongoose.connection.db;
const limpiar = async () => {
  const us = await usuarioModel.find({ email: new RegExp(`^${PREFIJO.toLowerCase()}`) }).select("_id").lean();
  const ids = us.map((u) => u._id);
  await db.collection("perfilusuarios").deleteMany({ perteneceA: { $in: ids } });
  await db.collection("perfilusuarios").deleteMany({ numDocumento: new RegExp(`^${PREFIJO}`) }); // por si una corrida anterior quedó a medias
  await db.collection("contactoemergencias").deleteMany({ createdBy: { $in: ids } });
  await NivelModel.deleteMany({ nombre: new RegExp(`^${PREFIJO}`) });
  await PlanAsociadoModel.deleteMany({ nombre: new RegExp(`^${PREFIJO}`) });
  await usuarioModel.deleteMany({ _id: { $in: ids } });
};
await limpiar();

const admin = new usuarioModel({ nombre: "ZZ Admin", apellido: "Prueba", email: `${PREFIJO.toLowerCase()}-admin@club.co`, contrasena: generarPassword("ClaveSegura123"), rol: "Administrador", codigo: "ZZ-ADM", status: true, estadoSolicitud: "Aprobada" });
await admin.save({ validateBeforeSave: false });
const entrenador = new usuarioModel({ nombre: "ZZ Ent", apellido: "Prueba", email: `${PREFIJO.toLowerCase()}-ent@club.co`, contrasena: generarPassword("ClaveSegura123"), rol: "Entrenador", codigo: "ZZ-ENT", status: true, estadoSolicitud: "Aprobada" });
await entrenador.save({ validateBeforeSave: false });
const nivel = await NivelModel.create({ nombre: `${PREFIJO} Nivel`, diasEntreno: 2, usuario: entrenador._id });
const plan = await PlanAsociadoModel.create({ nombre: `${PREFIJO} Plan`, valor: 50000, estado: "Activo" });

const login = (email, contrasena) => http(null, "POST", "/auth/login", { email, contrasena });
const tAdmin = (await login(admin.email, "ClaveSegura123")).body.token;

console.log("\nCuenta creada por el administrador con contraseña asignada\n");
const emailNuevo = `${PREFIJO.toLowerCase()}-atleta@club.co`;
let r = await http(tAdmin, "POST", "/usuarios", { nombre: "ZZ Atleta", apellido: "Prueba", email: emailNuevo, contrasena: TEMPORAL, rol: "Atleta", nivel: String(nivel._id), planAsociado: String(plan._id) });
paso(1, "El administrador crea un atleta con contraseña asignada (201)", r.status === 201, resumen(r));
const idNuevo = r.body?.data?._id;
paso("1b", "La respuesta de creación no incluye la contraseña", r.body?.data && !("contrasena" in r.body.data));

r = await login(emailNuevo, TEMPORAL);
let token = r.body?.token;
paso(2, "El login devuelve debeCambiarClave: true y perfilCompleto: false", r.body?.data?.debeCambiarClave === true && r.body?.data?.perfilCompleto === false, `debeCambiarClave=${r.body?.data?.debeCambiarClave} perfilCompleto=${r.body?.data?.perfilCompleto} faltan=${r.body?.data?.camposFaltantes?.map((c) => c.campo).join(",")}`);

console.log("\nGuardia 1: cambio de contraseña obligatorio\n");
r = await http(token, "GET", "/niveles");
paso("3a", "GET /niveles → 403 CAMBIO_CLAVE_REQUERIDO", r.status === 403 && r.body?.code === "CAMBIO_CLAVE_REQUERIDO", resumen(r));
r = await http(token, "POST", "/justificacion", {});
paso("3b", "POST /justificacion → 403 CAMBIO_CLAVE_REQUERIDO", r.status === 403 && r.body?.code === "CAMBIO_CLAVE_REQUERIDO", resumen(r));
r = await http(token, "GET", "/perfilusuario/me");
paso("3c", "GET /perfilusuario → 403 CAMBIO_CLAVE_REQUERIDO (primero la contraseña)", r.status === 403 && r.body?.code === "CAMBIO_CLAVE_REQUERIDO", resumen(r));
r = await http(token, "GET", "/auth/renovar-token");
paso("3d", "«me» (renovar-token) sí responde (200) y trae las marcas", r.status === 200 && r.body?.data?.debeCambiarClave === true, resumen(r));
r = await http(token, "PATCH", "/auth/cambiar-contrasena", { actual: TEMPORAL, nueva: TEMPORAL, confirmar: TEMPORAL });
paso("4a", "La nueva contraseña no puede ser igual a la temporal (400)", r.status === 400, resumen(r));
r = await http(token, "PATCH", "/auth/cambiar-contrasena", { actual: "otra-cosa-123", nueva: "NuevaClave456", confirmar: "NuevaClave456" });
paso("4b", "Con la contraseña actual incorrecta (400)", r.status === 400 && r.body?.errors?.actual, resumen(r));
r = await http(token, "PATCH", "/auth/cambiar-contrasena", { actual: TEMPORAL, nueva: "corta", confirmar: "corta" });
paso("4c", "Contraseña de menos de 8 caracteres (400)", r.status === 400 && r.body?.errors?.nueva, resumen(r));
r = await http(token, "PATCH", "/auth/cambiar-contrasena", { actual: TEMPORAL, nueva: "NuevaClave456", confirmar: "Distinta456" });
paso("4d", "Confirmación distinta (400)", r.status === 400 && r.body?.errors?.confirmar, resumen(r));

const tokenViejo = token;
await dormir(1200); // los tokens llevan la hora en segundos: se espera para que el viejo quede estrictamente antes del cambio
r = await http(token, "PATCH", "/auth/cambiar-contrasena", { actual: TEMPORAL, nueva: "NuevaClave456", confirmar: "NuevaClave456" });
paso(5, "Cambio correcto (200): debeCambiarClave pasa a false y entrega un token nuevo", r.status === 200 && r.body?.data?.debeCambiarClave === false && !!r.body?.token && !("contrasena" in r.body.data), resumen(r));
token = r.body?.token;
r = await http(tokenViejo, "GET", "/auth/renovar-token");
paso("5b", "El token anterior queda invalidado (401)", r.status === 401, resumen(r));
r = await login(emailNuevo, TEMPORAL);
paso("5c", "La contraseña temporal ya no sirve para entrar (401)", r.status === 401, resumen(r));
r = await login(emailNuevo, "NuevaClave456");
token = r.body?.token;
paso("5d", "Entra con la nueva contraseña y debeCambiarClave es false", r.status === 200 && r.body?.data?.debeCambiarClave === false, resumen(r));

console.log("\nGuardia 2: perfil completo (atleta)\n");
r = await http(token, "GET", "/niveles");
paso("6a", "Las consultas siguen permitidas con el perfil incompleto (GET /niveles 200)", r.status === 200, resumen(r));
r = await http(token, "GET", "/perfilusuario/me");
paso("6b", "El perfil siempre es accesible (no responde PERFIL_INCOMPLETO)", r.body?.code !== "PERFIL_INCOMPLETO" && r.status !== 403, resumen(r));
for (const [nombre, metodo, ruta] of [["justificación", "POST", "/justificacion"], ["pedido de implementos", "POST", "/solicitudImplementos"], ["pago", "POST", "/pagos"], ["inscripción a competencia", "POST", "/inscripciones_competencias"]]) {
  r = await http(token, metodo, ruta, {});
  paso("7", `${metodo} ${ruta} (${nombre}) → 403 PERFIL_INCOMPLETO`, r.status === 403 && r.body?.code === "PERFIL_INCOMPLETO", `${resumen(r)} · faltan: ${(r.body?.camposFaltantes ?? []).map((c) => c.campo).join(", ")}`);
}
const tAdminOtraVez = (await login(admin.email, "ClaveSegura123")).body.token;
r = await http(tAdminOtraVez, "POST", "/pagos", {});
paso("7b", "El guardia de perfil NO aplica a administradores (no responde PERFIL_INCOMPLETO)", r.body?.code !== "PERFIL_INCOMPLETO", resumen(r));

// El atleta completa su perfil (se escribe directo: la subida del certificado se prueba desde la interfaz)
await db.collection("perfilusuarios").insertOne({ tipoDocumento: "Cédula de Ciudadanía", numDocumento: `${PREFIJO}-2`, genero: "Femenino", telefono: "3001112233", eps: "SURA", certificadoEps: "uploads/certificado.pdf", fechaNacimiento: new Date("2010-05-10T00:00:00Z"), perteneceA: new mongoose.Types.ObjectId(idNuevo), status: true, createdAt: new Date(), updatedAt: new Date() });
await db.collection("contactoemergencias").insertOne({ nombre: "Madre", apellido: "Prueba", telefono: "3001112233", parentesco: "Madre", createdBy: new mongoose.Types.ObjectId(idNuevo), status: true, createdAt: new Date(), updatedAt: new Date() });
r = await http(token, "GET", "/auth/renovar-token");
paso(8, "Con el perfil completo, «me» devuelve perfilCompleto: true", r.body?.data?.perfilCompleto === true, `perfilCompleto=${r.body?.data?.perfilCompleto} faltan=${(r.body?.data?.camposFaltantes ?? []).map((c) => c.campo).join(",")}`);
r = await http(token, "POST", "/justificacion", {});
paso(9, "Ya no se bloquea: la acción llega a su validación normal (no es 403)", r.status !== 403, resumen(r));

await limpiar();
await mongoose.disconnect();
console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallaron` : "\n✔ Todas las comprobaciones pasaron");
process.exit(fallos ? 1 : 0);
