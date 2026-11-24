import NivelModel from "../models/nivel.model.js";
import { actuaComoEntrenador } from "../helpers/roles.helpers.js";
import PlantillaHorarioModel from "../models/plantilla_horario.model.js";
import PerfilUsuarioModel from "../models/perfilUsuario.model.js";
import usuarioModel from "../models/usuarios.model.js";
import { puedeEntrenar } from "../helpers/roles.helpers.js";

// El authMiddleware guarda el usuario en req.userFound.
const getUserId = (user) => user?._id || user?.id;
const esEntrenador = (user) => actuaComoEntrenador(user);

const dbCreateNivel = async (newNivel) => {
    return await NivelModel.create(newNivel);
}

// Agrega a cada nivel el entrenador (si existe), su ID guardado, si es válido y su foto de perfil
const enriquecerNiveles = async (niveles) => {
    // Sin populate: el ID guardado del entrenador se conserva SIEMPRE (con populate, un usuario inexistente dejaba `usuario: null`
    // y el formulario perdía el ID -> tarjeta con «?» y aviso «Selecciona el entrenador del nivel» al guardar).
    const ids = [...new Set(niveles.map((n) => String(n.usuario)).filter((x) => x && x !== 'undefined'))];
    const entrenadores = await usuarioModel.find({ _id: { $in: ids } }).select('nombre apellido rol rolesAdicionales status estadoSolicitud').lean();
    const porId = new Map(entrenadores.map((u) => [String(u._id), u]));

    // Foto por defecto de la tarjeta: la foto de perfil del entrenador asignado (el perfil guarda su dueño en `perteneceA`)
    const perfiles = await PerfilUsuarioModel.find({ perteneceA: { $in: entrenadores.map((u) => u._id) } }).select('perteneceA fotoPerfil').lean();
    const fotoDe = Object.fromEntries(perfiles.map((p) => [String(p.perteneceA), p.fotoPerfil]));

    return niveles.map((n) => {
        const u = porId.get(String(n.usuario)) ?? null;
        return {
            ...n,
            usuarioId: n.usuario ?? null,                                    // ID guardado (aunque el usuario ya no exista)
            usuario: u ? { _id: u._id, nombre: u.nombre, apellido: u.apellido } : null,
            // ¿el entrenador existe, está activo y puede entrenar? (si no, la pantalla lo marca)
            entrenadorValido: !!u && u.status && u.estadoSolicitud === 'Aprobada' && puedeEntrenar(u),
            fotoEntrenador: u ? (fotoDe[String(u._id)] ?? null) : null,
        };
    });
};

// CAMBIO: populate('usuario') trae al entrenador asignado (el de la tarjeta)
// Agrega en el segundo parámetro los campos que necesites (ej. la foto). Así evitamos enviar la contraseña.
const dbGetNivel = async (query = {}, user) => {
    const filter = {};
    if (['Activo', 'Inactivo'].includes(query.estado)) {
        filter.estado = query.estado;
    }

    // CAMBIO: el Entrenador solo ve los niveles que tiene asignados
    if (esEntrenador(user)) {
        filter.usuario = getUserId(user);
    }

    return enriquecerNiveles(await NivelModel.find(filter).lean());
}

// Público (registro y página de inicio): solo los niveles ACTIVOS y solo los datos que se muestran sin sesión:
// nombre, nombre del entrenador y horario semanal. No se expone ningún otro dato del entrenador (ni su id).
const dbGetNivelesPublico = async () => {
    const niveles = await NivelModel.find({ estado: 'Activo' })
        .select('nombre usuario')
        .populate('usuario', 'nombre apellido')
        .sort({ nombre: 1 })
        .lean();
    const plantillas = await PlantillaHorarioModel.find({ nivel: { $in: niveles.map((n) => n._id) } })
        .select('nivel dia horaInicio horaFin')
        .sort({ horaInicio: 1 })
        .lean();

    return niveles.map((n) => ({
        _id: n._id,
        nombre: n.nombre,
        entrenador: n.usuario ? [n.usuario.nombre, n.usuario.apellido].filter(Boolean).join(' ') : '',
        horarios: plantillas
            .filter((p) => String(p.nivel) === String(n._id))
            .map((p) => ({ dia: p.dia, horaInicio: p.horaInicio, horaFin: p.horaFin })),
    }));
}

const dbUpdateNivel = async (id, nivelUpdate) => {
    return await NivelModel.findOneAndUpdate(
        { _id: id },
        nivelUpdate,
        { new: true, runValidators: true }
    );
}

const dbGetNiveles = async (id, user) => {
    const filter = { _id: id };

    // CAMBIO: el Entrenador solo puede ver su propio nivel
    if (esEntrenador(user)) {
        filter.usuario = getUserId(user);
    }

    const nivel = await NivelModel.findOne(filter).lean();
    return nivel ? (await enriquecerNiveles([nivel]))[0] : null;
}

export {
    dbCreateNivel,
    dbGetNivel,
    dbUpdateNivel,
    dbGetNiveles,
    dbGetNivelesPublico
}
