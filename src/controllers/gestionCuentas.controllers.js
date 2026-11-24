import mongoose from "mongoose";
import usuarioModel from "../models/usuarios.model.js";
import perfilUsuarioModel from "../models/perfilUsuario.model.js";
import contactoEModel from "../models/contactoEmergencia.model.js";
import NivelModel from "../models/nivel.model.js";
import PlanAsociadoModel from "../models/planAsociado.model.js";
import { dbGetUsuarioConPlan } from "../services/usuarios.services.js";
import { notificar } from "../services/notificaciones.services.js";
import { aplicarCambioDePlan } from "../services/generacionMensualidades.services.js";
import { registrarAuditoria, diferencias } from "../helpers/auditoria.helpers.js";
import { validarDatosBasicos, validarDatosPerfil, validarContacto, validarContactoParcial, normalizarParentesco } from "../helpers/validacionesUsuario.helpers.js";
import PerfilFoto from "../models/perfilUsuario.model.js";
import { validarFechaNacimiento } from "../helpers/fecha.helpers.js";
import { responderError, errorHttp } from "../helpers/errores.helpers.js";
import { puedeEntrenar, tieneRol } from "../helpers/roles.helpers.js";

// Gestión avanzada de cuentas. TODAS estas rutas son SOLO ADMINISTRADOR (middleware en usuarios.routes.js).

const CAMPOS_USUARIO = ['nombre', 'apellido', 'email'];
const CAMPOS_PERFIL = ['tipoDocumento', 'numDocumento', 'genero', 'generoOtro', 'fechaNacimiento', 'telefono', 'eps', 'epsOtra', 'poliza'];

// Respuesta de error ÚNICA de esta pantalla: { success:false, msg, message, errors:[{ campo, mensaje }] }
// (`msg` lo usa el cliente HTTP; `errors` permite marcar cada campo). El mapa { campo: mensaje } se convierte aquí.
const responderValidacion = (res, status, mensaje, mapa = {}) => {
    const errors = Object.entries(mapa).map(([campo, texto]) => ({ campo, mensaje: texto }));
    const generico = mensaje === 'Hay campos por corregir';
    const resumen = !generico ? mensaje : errors.length > 1 ? `Hay ${errors.length} campos por corregir` : (errors[0]?.mensaje ?? mensaje);
    return res.status(status).json({ success: false, msg: resumen, message: resumen, errors });
};

const sinClave = (u) => { const o = u.toObject ? u.toObject() : { ...u }; delete o.contrasena; return o; };

const cargarUsuario = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw errorHttp(400, 'El identificador del usuario no es válido');
    const usuario = await usuarioModel.findById(id).select('-contrasena');
    if (!usuario) throw errorHttp(404, 'Usuario no encontrado');
    return usuario;
};

// ───────────────────────── Editar datos (usuario + perfil + contactos) ─────────────────────────
// PATCH /api/usuarios/:id/ficha   { nombre?, apellido?, email?, tipoDocumento?, numDocumento?, genero?, generoOtro?,
//                                   fechaNacimiento?, telefono?, eps?, epsOtra?, poliza?, contactos?: [{ _id?, nombre, apellido, telefono, parentesco, parentescoOtro?, principal? }] }
// No editables aquí: contraseña, código, estado de la solicitud, estado activo y rol (ver sus propios endpoints).
export const editarFicha = async (req, res) => {
    try {
        const usuario = await cargarUsuario(req.params.id);
        const body = req.body ?? {};

        // Parentescos heredados («Madre / Padre»…) se traducen al catálogo antes de validar
        const contactosEnviados = (Array.isArray(body.contactos) ? body.contactos : []).map((c) => ({ ...c, parentesco: normalizarParentesco(c.parentesco) }));

        // ── 1) VALIDAR TODO antes de escribir nada (así la edición es «todo o nada») ──
        // Solo se validan los campos ENVIADOS, con las reglas del rol del usuario editado (edad de administrador/entrenador ≥ 18, atleta ≥ 5).
        const errors = {
            ...validarDatosBasicos(body, { parcial: true }),
            ...validarDatosPerfil(body, usuario.rol),
        };
        contactosEnviados.forEach((c, i) => {
            const e = c._id ? validarContactoParcial(c) : validarContacto(c);
            for (const k of Object.keys(e)) errors[`contactos.${i}.${k}`] = e[k];
        });
        if (Object.keys(errors).length > 0) return responderValidacion(res, 400, 'Hay campos por corregir', errors);

        // ── usuario (el correo único EXCLUYE al propio usuario) ──
        const datosUsuario = {};
        for (const c of ['nombre', 'apellido']) if (body[c] !== undefined) datosUsuario[c] = String(body[c]).trim();
        if (body.email !== undefined) {
            const email = String(body.email).trim().toLowerCase();
            const otro = await usuarioModel.findOne({ email, _id: { $ne: usuario._id } }).select('_id').lean();
            if (otro) return responderValidacion(res, 409, 'Este correo ya está registrado por otro usuario', { email: 'Este correo ya está registrado por otro usuario' });
            datosUsuario.email = email;
        }
        const cambiosUsuario = diferencias(usuario, datosUsuario, CAMPOS_USUARIO);

        // ── perfil (el documento único EXCLUYE al propio perfil) ──
        const hayPerfil = CAMPOS_PERFIL.some((c) => body[c] !== undefined);
        const datosPerfil = {};
        let perfil = null;
        let cambiosPerfil = [];
        if (hayPerfil) {
            perfil = await perfilUsuarioModel.findOne({ perteneceA: usuario._id });
            if (!perfil) return responderValidacion(res, 404, 'Este usuario aún no completó su perfil: solo se pueden editar nombre, apellido y correo');
            for (const c of CAMPOS_PERFIL) if (body[c] !== undefined) datosPerfil[c] = typeof body[c] === 'string' ? body[c].trim() : body[c];
            if (datosPerfil.numDocumento !== undefined) {
                const otro = await perfilUsuarioModel.findOne({ numDocumento: datosPerfil.numDocumento, _id: { $ne: perfil._id } }).select('_id').lean();
                if (otro) return responderValidacion(res, 409, 'Este número de documento ya está registrado por otro usuario', { numDocumento: 'Este número de documento ya está registrado por otro usuario' });
            }
            cambiosPerfil = diferencias(perfil, datosPerfil, CAMPOS_PERFIL);
        }

        // ── contactos: cada contacto con _id debe ser de este usuario (se comprueba ANTES de escribir) ──
        const cambiosContactos = [];
        const operacionesContactos = [];
        for (const [i, c] of contactosEnviados.entries()) {
            if (c._id) {
                const actual = await contactoEModel.findOne({ _id: c._id, createdBy: usuario._id });
                if (!actual) return responderValidacion(res, 404, 'Un contacto de emergencia no pertenece a este usuario', { [`contactos.${i}._id`]: 'Este contacto no pertenece al usuario' });
                // Solo los campos enviados; lo demás conserva su valor (un contacto heredado con otro dato inválido no bloquea)
                const datos = {};
                for (const campo of ['nombre', 'apellido', 'telefono', 'parentesco', 'principal']) {
                    if (c[campo] !== undefined) datos[campo] = typeof c[campo] === 'string' ? c[campo].trim() : c[campo];
                }
                if (c.parentesco !== undefined || c.parentescoOtro !== undefined) {
                    const parentesco = datos.parentesco ?? actual.parentesco;
                    datos.parentescoOtro = parentesco === 'Otro' ? String(c.parentescoOtro ?? actual.parentescoOtro ?? '').trim() : null;
                }
                for (const campo of Object.keys(datos)) {
                    if (String(actual[campo] ?? '') !== String(datos[campo] ?? '')) cambiosContactos.push({ campo: `contacto ${actual.nombre}: ${campo}`, anterior: actual[campo] ?? null, nuevo: datos[campo] ?? null });
                }
                operacionesContactos.push({ tipo: 'editar', actual: actual.toObject(), datos });
            } else {
                const datos = { nombre: c.nombre?.trim(), apellido: c.apellido?.trim(), telefono: String(c.telefono).trim(), parentesco: c.parentesco, parentescoOtro: c.parentesco === 'Otro' ? c.parentescoOtro?.trim() : null, principal: !!c.principal };
                operacionesContactos.push({ tipo: 'crear', datos });
                cambiosContactos.push({ campo: `contacto nuevo: ${datos.nombre} ${datos.apellido}`, anterior: null, nuevo: datos.telefono });
            }
        }

        // ── 2) ESCRIBIR. Si un paso falla se deshacen los anteriores y se dice cuál falló ──
        const deshacer = [];
        let paso = 'los datos de la cuenta';
        try {
            if (cambiosUsuario.length > 0) {
                const previo = Object.fromEntries(CAMPOS_USUARIO.map((c) => [c, usuario[c]]));
                await usuarioModel.updateOne({ _id: usuario._id }, datosUsuario, { runValidators: true });
                deshacer.push(() => usuarioModel.updateOne({ _id: usuario._id }, previo));
            }
            if (cambiosPerfil.length > 0) {
                paso = 'la información del perfil';
                const previo = Object.fromEntries(CAMPOS_PERFIL.map((c) => [c, perfil[c]]));
                await perfilUsuarioModel.updateOne({ _id: perfil._id }, datosPerfil, { runValidators: true });
                deshacer.push(() => perfilUsuarioModel.updateOne({ _id: perfil._id }, previo));
            }
            for (const op of operacionesContactos) {
                paso = 'los contactos de emergencia';
                if (op.tipo === 'editar') {
                    await contactoEModel.updateOne({ _id: op.actual._id }, op.datos, { runValidators: true });
                    deshacer.push(() => contactoEModel.replaceOne({ _id: op.actual._id }, op.actual));
                } else {
                    const nuevo = await contactoEModel.create({ ...op.datos, createdBy: usuario._id });
                    deshacer.push(() => contactoEModel.deleteOne({ _id: nuevo._id }));
                }
            }
        } catch (error) {
            for (const revertir of deshacer.reverse()) await revertir().catch(() => {});
            console.error('[editarFicha] falló en', paso, error);
            const detalle = error.name === 'ValidationError' ? Object.values(error.errors).map((e) => e.message).join('. ') : error.message;
            return responderValidacion(res, error.name === 'ValidationError' ? 400 : 500, `No se guardó nada: falló ${paso}. ${detalle}`);
        }

        const cambios = [...cambiosUsuario, ...cambiosPerfil, ...cambiosContactos];
        await registrarAuditoria({ actor: req.userFound, accion: 'editar-ficha', entidadId: usuario._id, cambios });
        if (cambios.length > 0) await notificar(usuario._id, 'perfil', 'El administrador actualizó tu información personal');

        return res.json({ success: true, msg: cambios.length > 0 ? 'Datos actualizados' : 'No había cambios para guardar', cambios: cambios.length });
    } catch (error) {
        responderError(res, error, 'No se pudieron actualizar los datos');
    }
};

// ───────────────────────── Reasignar nivel ─────────────────────────
// PATCH /api/usuarios/:id/nivel  { nivel }   (atletas; también sirve en solicitudes pendientes, antes de aprobar)
// El historial (asistencia, rendimiento, justificaciones) queda con el nivel anterior: desde ahora el atleta pertenece al nuevo.
export const reasignarNivel = async (req, res) => {
    try {
        const usuario = await cargarUsuario(req.params.id);
        if (usuario.rol !== 'Atleta') throw errorHttp(409, 'Solo se puede reasignar el nivel de un atleta');

        const { nivel } = req.body ?? {};
        if (!nivel || !mongoose.isValidObjectId(nivel)) throw errorHttp(400, 'Selecciona un nivel válido');
        const nuevo = await NivelModel.findById(nivel).select('nombre estado usuario').lean();
        if (!nuevo) throw errorHttp(400, 'El nivel seleccionado no existe');
        if (nuevo.estado !== 'Activo') throw errorHttp(400, 'El nivel seleccionado está inactivo');
        if (String(usuario.nivel) === String(nuevo._id)) throw errorHttp(409, 'El atleta ya pertenece a ese nivel');

        const anterior = usuario.nivel ? await NivelModel.findById(usuario.nivel).select('nombre usuario').lean() : null;
        await usuarioModel.updateOne({ _id: usuario._id }, { nivel: nuevo._id });

        await registrarAuditoria({
            actor: req.userFound, accion: 'reasignar-nivel', entidadId: usuario._id,
            cambios: [{ campo: 'nivel', anterior: anterior?.nombre ?? null, nuevo: nuevo.nombre }],
        });

        // Avisos (campanita): el atleta y los entrenadores de ambos niveles
        const nombre = `${usuario.nombre} ${usuario.apellido}`;
        await notificar(usuario._id, 'cuenta', `Tu nivel cambió${anterior ? ` de ${anterior.nombre}` : ''} a ${nuevo.nombre}`, { titulo: 'Cambio de nivel', enlace: '/atleta/horarios' });
        const entrenadores = new Set([anterior?.usuario, nuevo.usuario].filter(Boolean).map(String));
        for (const id of entrenadores) {
            await notificar(id, 'cuenta', `${nombre} ${String(nuevo.usuario) === id ? `ahora pertenece a ${nuevo.nombre}` : `ya no pertenece a ${anterior?.nombre ?? 'tu nivel'}`}`, { titulo: 'Cambio de nivel de un atleta' });
        }

        const data = await dbGetUsuarioConPlan(usuario._id);
        return res.json({ success: true, msg: 'Nivel reasignado', data });
    } catch (error) {
        responderError(res, error, 'No se pudo reasignar el nivel');
    }
};

// ───────────────────────── Reasignar plan ─────────────────────────
// PATCH /api/usuarios/:id/plan  { planAsociado }
// Mensualidad del periodo: Pendiente sin enviar -> se actualiza plan y valor; pagada / en verificación / vencida -> el plan nuevo rige
// desde el periodo siguiente (el historial nunca se toca).
export const reasignarPlan = async (req, res) => {
    try {
        const usuario = await cargarUsuario(req.params.id);
        if (usuario.rol !== 'Atleta') throw errorHttp(409, 'Solo se puede reasignar el plan de un atleta');

        const { planAsociado } = req.body ?? {};
        if (!planAsociado || !mongoose.isValidObjectId(planAsociado)) throw errorHttp(400, 'Selecciona un plan válido');
        const plan = await PlanAsociadoModel.findById(planAsociado).lean();
        if (!plan) throw errorHttp(400, 'El plan seleccionado no existe');
        if (plan.estado !== 'Activo') throw errorHttp(400, 'El plan seleccionado está inactivo');
        if (String(usuario.planAsociado) === String(plan._id)) throw errorHttp(409, 'El atleta ya tiene ese plan');

        const anterior = usuario.planAsociado ? await PlanAsociadoModel.findById(usuario.planAsociado).select('nombre valor').lean() : null;
        await usuarioModel.updateOne({ _id: usuario._id }, { planAsociado: plan._id });

        // Solo cuentas aprobadas y activas manejan mensualidades; una solicitud pendiente solo cambia el plan elegido.
        // Si ajustar la mensualidad falla, el plan vuelve al anterior: o se hace todo o nada.
        let mensualidad = { accion: 'sin-mensualidad' };
        try {
            if (usuario.estadoSolicitud === 'Aprobada' && usuario.status) mensualidad = await aplicarCambioDePlan(usuario._id, plan);
        } catch (error) {
            await usuarioModel.updateOne({ _id: usuario._id }, { planAsociado: usuario.planAsociado ?? null });
            console.error('[reasignarPlan] no se pudo ajustar la mensualidad', error);
            throw errorHttp(500, `No se cambió el plan: falló el ajuste de la mensualidad. ${error.message}`);
        }

        await registrarAuditoria({
            actor: req.userFound, accion: 'reasignar-plan', entidadId: usuario._id,
            cambios: [{ campo: 'planAsociado', anterior: anterior?.nombre ?? null, nuevo: plan.nombre }],
            detalle: `Mensualidad ${mensualidad.periodo ?? ''}: ${mensualidad.accion}`.trim(),
        });
        await notificar(usuario._id, 'cuenta', `Tu plan cambió${anterior ? ` de ${anterior.nombre}` : ''} a ${plan.nombre}`, { titulo: 'Cambio de plan', enlace: '/atleta/pagos' });

        const data = await dbGetUsuarioConPlan(usuario._id);
        return res.json({ success: true, msg: 'Plan reasignado', mensualidad, data });
    } catch (error) {
        responderError(res, error, 'No se pudo reasignar el plan');
    }
};

// ───────────────────────── Administrador que también es entrenador ─────────────────────────
// PATCH /api/usuarios/:id/entrenador  { activo: true|false }
export const cambiarRolEntrenador = async (req, res) => {
    try {
        const usuario = await cargarUsuario(req.params.id);
        if (usuario.rol !== 'Administrador') throw errorHttp(409, 'El rol adicional de entrenador solo aplica a administradores (un atleta o entrenador no lo necesita)');
        if (usuario.estadoSolicitud !== 'Aprobada') throw errorHttp(409, 'La cuenta debe estar aprobada');

        const { activo } = req.body ?? {};
        if (typeof activo !== 'boolean') throw errorHttp(400, 'Indica activo: true o false');
        const yaEs = tieneRol(usuario, 'Entrenador');
        if (activo === yaEs) return res.json({ success: true, msg: 'Sin cambios', data: sinClave(usuario) });

        // La regla de edad se valida donde se EDITA la fecha de nacimiento (editarFicha), no aquí: este interruptor no envía
        // ese campo y un dato antiguo inválido no debe impedir cambiar el rol. Si la fecha guardada incumple la regla, se avisa.
        let aviso = null;
        if (activo) {
            const perfil = await perfilUsuarioModel.findOne({ perteneceA: usuario._id }).select('fechaNacimiento').lean();
            const mensajeEdad = perfil?.fechaNacimiento ? validarFechaNacimiento(perfil.fechaNacimiento, 'Entrenador') : '';
            if (mensajeEdad) aviso = `Su fecha de nacimiento guardada no cumple la regla de edad (${mensajeEdad.toLowerCase()}). Corrígela en «Editar cuenta».`;
        } else {
            const niveles = await NivelModel.find({ usuario: usuario._id }).select('nombre').lean();
            if (niveles.length > 0) {
                return res.status(409).json({
                    success: false,
                    msg: `Antes de quitarle el rol de entrenador reasigna sus niveles: ${niveles.map((n) => n.nombre).join(', ')}`,
                    niveles: niveles.map((n) => ({ _id: n._id, nombre: n.nombre })),
                });
            }
        }

        const rolesAdicionales = activo ? [...new Set([...(usuario.rolesAdicionales ?? []), 'Entrenador'])] : (usuario.rolesAdicionales ?? []).filter((r) => r !== 'Entrenador');
        await usuarioModel.updateOne({ _id: usuario._id }, { rolesAdicionales });
        await registrarAuditoria({
            actor: req.userFound, accion: 'rol-adicional', entidadId: usuario._id,
            cambios: [{ campo: 'rolesAdicionales', anterior: usuario.rolesAdicionales ?? [], nuevo: rolesAdicionales }],
        });
        await notificar(usuario._id, 'cuenta', activo ? 'Ahora también actúas como entrenador' : 'Ya no actúas como entrenador', { titulo: 'Cambio de roles' });

        const data = await usuarioModel.findById(usuario._id).select('-contrasena');
        return res.json({ success: true, msg: activo ? 'Ahora también es entrenador' : 'Rol de entrenador retirado', aviso, data });
    } catch (error) {
        responderError(res, error, 'No se pudo cambiar el rol adicional');
    }
};

// ───────────────────────── Entrenadores asignables ─────────────────────────
// GET /api/usuarios/entrenadores : usuarios ACTIVOS que pueden entrenar (rol Entrenador, o Administrador con el rol adicional)
export const listarEntrenadores = async (req, res) => {
    try {
        const lista = await usuarioModel
            .find({ status: true, estadoSolicitud: 'Aprobada', $or: [{ rol: 'Entrenador' }, { rolesAdicionales: 'Entrenador' }] })   // mismo criterio que puedeEntrenar()
            .select('nombre apellido codigo rol rolesAdicionales')
            .sort({ nombre: 1, apellido: 1 })
            .lean();
        const perfiles = await PerfilFoto.find({ perteneceA: { $in: lista.map((u) => u._id) } }).select('perteneceA fotoPerfil').lean();
        const fotoDe = Object.fromEntries(perfiles.map((p) => [String(p.perteneceA), p.fotoPerfil ?? null]));
        // Etiqueta: «Nombre Apellido · Entrenador» o «Nombre Apellido · Administrador y entrenador»
        const data = lista.map((u) => ({ ...u, id: u._id, foto: fotoDe[String(u._id)] ?? null, etiqueta: `${u.nombre} ${u.apellido} · ${tieneRol(u, 'Administrador') ? 'Administrador y entrenador' : 'Entrenador'}` }));
        return res.json({ success: true, msg: 'Entrenadores asignables', data });
    } catch (error) {
        responderError(res, error, 'No se pudo listar a los entrenadores');
    }
};

/** ¿Este usuario puede ser el entrenador de un nivel? Devuelve el mensaje de error o '' si sí. */
export const validarEntrenadorAsignable = async (id) => {
    if (!id || !mongoose.isValidObjectId(id)) return 'Selecciona un entrenador válido';
    const u = await usuarioModel.findById(id).select('rol rolesAdicionales status estadoSolicitud').lean();
    if (!u) return 'El entrenador seleccionado no existe';
    if (!u.status || u.estadoSolicitud !== 'Aprobada') return 'El entrenador seleccionado no está activo';
    if (!puedeEntrenar(u)) return 'El usuario seleccionado no es entrenador (un administrador debe tener activado «También actúa como entrenador»)';
    return '';
};
