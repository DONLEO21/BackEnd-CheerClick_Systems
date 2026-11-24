// AUDITORÍA DE USUARIOS (solo lectura: no modifica ni borra nada).
//   node --env-file .env scripts/auditar-usuarios.js [--buscar=Ronald] [--niveles="Nivel 4 Blood Tigers,Nivel 3 Magic"]
//   npm run auditar:usuarios -- --buscar=Ronald
//
// Lista lo que impide guardar o asignar datos desde «Editar cuenta» y desde el selector de entrenador:
//   · fecha de nacimiento futura, inválida o que incumple la regla de edad (administrador y entrenador ≥ 18, atleta ≥ 5)
//   · correos o documentos duplicados
//   · parentescos fuera del catálogo (valores antiguos, p. ej. «Madre / Padre») y contactos incompletos
//   · atletas con nivel o plan inactivo, inexistente o ausente
//   · niveles cuyo entrenador no existe, está inactivo o no puede entrenar
//   · --buscar: ficha detallada de un usuario (por nombre, apellido, correo o código); --niveles: ficha de esos niveles
import mongoose from "mongoose";
import usuarioModel from "../src/models/usuarios.model.js";
import perfilUsuarioModel from "../src/models/perfilUsuario.model.js";
import contactoEModel from "../src/models/contactoEmergencia.model.js";
import NivelModel from "../src/models/nivel.model.js";
import PlanAsociadoModel from "../src/models/planAsociado.model.js";
import AuditoriaModel from "../src/models/auditoria.model.js";
import MensualidadModel from "../src/models/mensualidades.model.js";
import "../src/models/pagos.model.js"; // registra el modelo para el populate del pago
import { validarFechaNacimiento } from "../src/helpers/fecha.helpers.js";
import { rolesDe, puedeEntrenar } from "../src/helpers/roles.helpers.js";
import { PARENTESCOS, TELEFONO_REGEX } from "../src/helpers/validacionesUsuario.helpers.js";
import { perfilCompleto } from "../src/helpers/perfilCompleto.helpers.js";

const arg = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const buscar = arg("buscar");
const nivelesPedidos = (arg("niveles") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dia = (f) => (f ? new Date(f).toISOString().slice(0, 10) : "—");

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const usuarios = await usuarioModel.find().select("-contrasena").lean();
const perfiles = await perfilUsuarioModel.find().lean();
const contactos = await contactoEModel.find().lean();
const niveles = await NivelModel.find().lean();
const planes = await PlanAsociadoModel.find().lean();
const perfilDe = new Map(perfiles.map((p) => [String(p.perteneceA), p]));
const nivelDe = new Map(niveles.map((n) => [String(n._id), n]));
const planDe = new Map(planes.map((p) => [String(p._id), p]));
const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
const nombre = (u) => `${u.nombre} ${u.apellido} (${u.codigo ?? "sin código"}, ${rolesDe(u).join("+")})`;

const hallazgos = {};
const marcar = (tipo, texto) => { (hallazgos[tipo] ??= []).push(texto); };

for (const u of usuarios) {
  const p = perfilDe.get(String(u._id));
  if (p?.fechaNacimiento) {
    const m = validarFechaNacimiento(dia(p.fechaNacimiento), u.rol);
    if (m) marcar("Fecha de nacimiento fuera de regla", `${nombre(u)} · ${dia(p.fechaNacimiento)} · ${m}`);
  }
  if (u.rol === "Atleta" && u.estadoSolicitud === "Aprobada") {
    const n = u.nivel ? nivelDe.get(String(u.nivel)) : null;
    const pl = u.planAsociado ? planDe.get(String(u.planAsociado)) : null;
    if (!n) marcar("Atleta sin nivel válido", nombre(u));
    else if (n.estado !== "Activo") marcar("Atleta con nivel inactivo", `${nombre(u)} · ${n.nombre}`);
    if (!pl) marcar("Atleta sin plan válido", nombre(u));
    else if (pl.estado !== "Activo") marcar("Atleta con plan inactivo", `${nombre(u)} · ${pl.nombre}`);
  }
}

const duplicados = (clave, etiqueta, lista) => {
  const grupos = new Map();
  for (const x of lista) { const k = clave(x); if (k) (grupos.get(k) ?? grupos.set(k, []).get(k)).push(x); }
  for (const [k, g] of grupos) if (g.length > 1) marcar(etiqueta, `${k} → ${g.map((x) => nombre(usuarioPorId.get(String(x._id ?? x.perteneceA)) ?? x)).join(" | ")}`);
};
duplicados((u) => norm(u.email).trim(), "Correos duplicados", usuarios);
duplicados((p) => String(p.numDocumento ?? "").trim().toLowerCase(), "Documentos duplicados", perfiles);

for (const c of contactos) {
  const dueno = usuarioPorId.get(String(c.createdBy));
  const quien = dueno ? nombre(dueno) : `dueño inexistente (${c.createdBy})`;
  if (!PARENTESCOS.includes(c.parentesco)) marcar("Parentesco fuera del catálogo (valor antiguo)", `${quien} · contacto ${c.nombre} ${c.apellido} · «${c.parentesco}»`);
  if (!c.nombre?.trim() || !c.apellido?.trim() || !TELEFONO_REGEX.test(String(c.telefono ?? "").trim()))
    marcar("Contactos incompletos o con teléfono inválido", `${quien} · «${c.nombre ?? ""} ${c.apellido ?? ""}» · tel «${c.telefono ?? ""}»`);
}

const estadoEntrenador = (n) => {
  const u = usuarioPorId.get(String(n.usuario));
  if (!n.usuario) return "SIN entrenador (campo vacío)";
  if (!u) return `entrenador INEXISTENTE (id ${n.usuario}): la tarjeta mostrará «?» y no se puede guardar sin elegir otro`;
  if (!u.status || u.estadoSolicitud !== "Aprobada") return `entrenador INACTIVO: ${nombre(u)}`;
  if (!puedeEntrenar(u)) return `NO puede entrenar: ${nombre(u)} (falta rol Entrenador / «También actúa como entrenador»)`;
  return null;
};
for (const n of niveles) { const e = estadoEntrenador(n); if (e) marcar("Niveles sin entrenador resoluble", `${n.nombre} [${n.estado}] · ${e}`); }

// Perfil incompleto (obligatorio en la interfaz para todos los roles; el backend lo exige a los atletas con PERFIL_OBLIGATORIO=true):
// quiénes quedarían obligados a completarlo al iniciar sesión y qué les falta
for (const u of usuarios.filter((x) => x.status && x.estadoSolicitud === "Aprobada")) {
  const { completo, faltantes } = await perfilCompleto(u);
  if (!completo) marcar("Perfil incompleto (deberán completarlo al entrar)", `${nombre(u)} · falta: ${faltantes.map((f) => f.etiqueta).join(", ")}`);
}
const claveTemporal = usuarios.filter((u) => u.debeCambiarClave);
if (claveTemporal.length) marcar("Con contraseña temporal pendiente de cambiar", claveTemporal.map(nombre).join(" | "));

console.log("\n══════ AUDITORÍA DE USUARIOS (solo lectura) ══════");
console.log(`Usuarios: ${usuarios.length} · perfiles: ${perfiles.length} · contactos: ${contactos.length} · niveles: ${niveles.length} · planes: ${planes.length}\n`);
const tipos = Object.keys(hallazgos);
if (tipos.length === 0) console.log("✔ Sin hallazgos.");
for (const t of tipos) { console.log(`▸ ${t} (${hallazgos[t].length})`); hallazgos[t].forEach((x) => console.log(`    - ${x}`)); console.log(""); }

if (buscar) {
  const q = norm(buscar);
  const hallados = usuarios.filter((u) => norm(`${u.nombre} ${u.apellido} ${u.email} ${u.codigo}`).includes(q));
  console.log(`══════ FICHA: «${buscar}» (${hallados.length}) ══════`);
  for (const u of hallados) {
    const p = perfilDe.get(String(u._id));
    console.log(`\n${u.nombre} ${u.apellido}`);
    console.log(`  id: ${u._id} · código: ${u.codigo ?? "—"} · rol: ${u.rol} · rolesAdicionales: ${JSON.stringify(u.rolesAdicionales ?? [])}`);
    console.log(`  activo: ${u.status} · solicitud: ${u.estadoSolicitud} · correo: ${u.email}`);
    console.log(`  documento: ${p ? `${p.tipoDocumento} ${p.numDocumento}` : "sin perfil"} · nacimiento: ${p ? dia(p.fechaNacimiento) : "—"}`);
    console.log(`  aparece en el selector de entrenador: ${u.status && u.estadoSolicitud === "Aprobada" && puedeEntrenar(u) ? "SÍ" : "NO"}`);
    console.log(`  niveles a su cargo: ${niveles.filter((n) => String(n.usuario) === String(u._id)).map((n) => n.nombre).join(", ") || "ninguno"}`);
    // Historial de cambios hechos por un administrador (nivel, plan, datos, rol) y sus mensualidades: sirve para saber si un
    // cambio de nivel/plan fue una prueba y si la mensualidad siguió las reglas (pendiente se actualiza; pagada rige desde el siguiente periodo)
    const hist = await AuditoriaModel.find({ entidadId: u._id }).sort({ createdAt: -1 }).limit(10).lean();
    if (hist.length) console.log("  auditoría (más reciente primero):");
    for (const h of hist) {
      const cuando = new Date(h.createdAt).toISOString().slice(0, 16);
      const que = (h.cambios ?? []).map((c) => `${c.campo} «${c.anterior ?? "—"}» → «${c.nuevo ?? "—"}»`).join("; ");
      console.log(`    · ${cuando} ${h.accion}${h.detalle ? ` [${h.detalle}]` : ""}: ${que}`);
    }
    const mens = await MensualidadModel.find({ usuario: u._id }).sort({ periodo: -1 }).limit(6).populate("pago", "estado codigo").populate("planAsociado", "nombre").lean();
    if (mens.length) console.log("  mensualidades:", mens.map((m) => `${m.periodo} ${m.planAsociado?.nombre ?? "?"} $${m.valor} ${m.pago?.estado ?? "?"}`).join(" | "));
  }
}
if (nivelesPedidos.length) {
  console.log("\n══════ FICHA DE NIVELES ══════");
  for (const pedido of nivelesPedidos) {
    const n = niveles.find((x) => norm(x.nombre) === norm(pedido));
    if (!n) { console.log(`\n${pedido}: NO existe un nivel con ese nombre`); continue; }
    const u = usuarioPorId.get(String(n.usuario));
    console.log(`\n${n.nombre} [${n.estado}] · código ${n.codigo ?? "—"}`);
    console.log(`  entrenador (id guardado): ${n.usuario ?? "ninguno"} · existe: ${u ? "sí" : "NO (el populate devuelve null)"}${u ? ` · ${nombre(u)} · activo: ${u.status} · solicitud: ${u.estadoSolicitud}` : ""}`);
    console.log(`  entrenador válido para asignar: ${estadoEntrenador(n) ? "NO — " + estadoEntrenador(n) : "sí"}`);
  }
}
await mongoose.disconnect();
