import notificacionModel from "../models/notificacion.model.js";
import { dbGetUsuario } from "./usuarios.services.js";

// Crea la notificación solo si el usuario tiene la opcion activa
const notificar = async ( idUsuario, tipo, mensaje ) => {
    try {
        const usuario = await dbGetUsuario( idUsuario );
        if( ! usuario || usuario.preferencias?.notificaciones === false ) return;

        await notificacionModel.create({ usuario: idUsuario, tipo, mensaje });
    } catch (error) {
        console.error( error );
    }
}

const dbListNotificaciones = async ( idUsuario, page = 1, limit = 20 ) => {
    const filtro = { usuario: idUsuario };
    const [ data, total, sinLeer ] = await Promise.all([
        notificacionModel.find( filtro ).sort({ createdAt: -1 }).skip( (page - 1) * limit ).limit( limit ),
        notificacionModel.countDocuments( filtro ),
        notificacionModel.countDocuments({ ...filtro, leida: false })
    ]);
    return { data, total, sinLeer };
}

const dbMarcarLeida = async ( id, idUsuario ) => {
    return await notificacionModel.findOneAndUpdate({ _id: id, usuario: idUsuario }, { leida: true }, { new: true });
}

const dbMarcarTodasLeidas = async ( idUsuario ) => {
    return await notificacionModel.updateMany({ usuario: idUsuario, leida: false }, { leida: true });
}

export { notificar, dbListNotificaciones, dbMarcarLeida, dbMarcarTodasLeidas }