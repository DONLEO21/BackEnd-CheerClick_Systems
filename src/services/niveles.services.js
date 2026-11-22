import NivelModel from "../models/nivel.model.js";
import PlantillaHorarioModel from "../models/plantilla_horario.model.js";

// El authMiddleware guarda el usuario en req.userFound.
const getUserId = (user) => user?._id || user?.id;
const esEntrenador = (user) => {
    const rol = user?.rol; // puede ser texto o un objeto con nombre
    return (typeof rol === "object" ? rol?.nombre : rol) === "Entrenador";
};

const dbCreateNivel = async (newNivel) => {
    return await NivelModel.create(newNivel);
}

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

    return await NivelModel.find(filter).populate('usuario', 'nombre apellido');
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

    return await NivelModel.findOne(filter).populate('usuario', 'nombre apellido');
}

export {
    dbCreateNivel,
    dbGetNivel,
    dbUpdateNivel,
    dbGetNiveles,
    dbGetNivelesPublico
}
