// MIGRACIÓN DE ROLES (idempotente):  npm run migrar:roles
//  1. Deja `rolesAdicionales: []` en los usuarios que no lo tienen (por defecto, sin roles adicionales).
//  2. Revisa que el entrenador de cada nivel pueda entrenar (rol Entrenador, o Administrador con el rol adicional) y
//     REPORTA los niveles cuyo entrenador no sea válido (no cambia nada: hay que reasignarlos desde Horarios).
// Los niveles guardan al entrenador por ID (campo `usuario`), así que no hay nombres que convertir a ID.
import mongoose from "mongoose";
import usuarioModel from "../src/models/usuarios.model.js";
import NivelModel from "../src/models/nivel.model.js";
import { puedeEntrenar } from "../src/helpers/roles.helpers.js";

await mongoose.connect(process.env.URI_MONGO || "mongodb://localhost:27017/db-CheerClick");

const r = await usuarioModel.updateMany({ rolesAdicionales: { $exists: false } }, { $set: { rolesAdicionales: [] } });
console.log(`Usuarios actualizados con rolesAdicionales: ${r.modifiedCount ?? 0}`);

const niveles = await NivelModel.find().populate("usuario", "nombre apellido rol rolesAdicionales status estadoSolicitud").lean();
const dudosos = niveles.filter((n) => !n.usuario || !puedeEntrenar(n.usuario) || !n.usuario.status || n.usuario.estadoSolicitud !== "Aprobada");
if (dudosos.length) {
  console.table(dudosos.map((n) => ({ código: n.codigo ?? "—", nivel: n.nombre, entrenador: n.usuario ? `${n.usuario.nombre} ${n.usuario.apellido}` : "(sin entrenador)", rol: n.usuario?.rol ?? "—" })));
  console.log(`\n${dudosos.length} nivel(es) con un entrenador que no puede entrenar: reasígnalos desde Horarios.`);
} else {
  console.log("Todos los niveles tienen un entrenador válido.");
}
await mongoose.disconnect();
