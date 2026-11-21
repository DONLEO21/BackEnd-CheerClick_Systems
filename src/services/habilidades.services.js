import HabilidadesModel from "../models/habilidades.model.js"

// filtro.nivelId: un id (o { $in: [...] } para el entrenador). Incluye las habilidades de ese nivel Y las generales (nivel null).
const dbGetHabilidades = async ({ nivelId } = {}) => {
    const filtro = nivelId ? { $or: [{ nivel: nivelId }, { nivel: null }, { nivel: { $exists: false } }] } : {}
    return await HabilidadesModel.find(filtro)
        .populate('tipoHabilidad', 'nombre')
        .populate('nivel', 'nombre')
}

const dbCreateHabilidad = async (newHabilidad) => {
    return await HabilidadesModel.create(newHabilidad)
}

const dbDeleteHabilidad = async (id) => {
    return await HabilidadesModel.findOneAndDelete({ _id: id})
}

const dbUpdateHabilidad = async (id, habilidadUpdate) => {
    return await HabilidadesModel.findOneAndUpdate(
        {_id: id},
        habilidadUpdate,
        {new : true}
    );
}

const dbGetHabilidad = async (id) => {
    return await HabilidadesModel.findOne({ _id: id }).populate('tipoHabilidad')
}

export {
    dbGetHabilidad,
    dbGetHabilidades,
    dbCreateHabilidad,
    dbUpdateHabilidad,
    dbDeleteHabilidad
}