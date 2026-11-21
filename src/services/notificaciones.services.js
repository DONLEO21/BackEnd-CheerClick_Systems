import notificacionModel from "../models/notificacion.model.js";
import { dbGetUsuario } from "./usuarios.services.js";
import usuarioModel from "../models/usuarios.model.js";

// Crea la notificación solo si el usuario tiene la opcion activa
// extra (opcional): { titulo, enlace }
const notificar = async ( idUsuario, tipo, mensaje, extra = {} ) => {
    try {
        const usuario = await dbGetUsuario( idUsuario );
        if( ! usuario || usuario.preferencias?.notificaciones === false ) return;

        await notificacionModel.create({ usuario: idUsuario, tipo, mensaje, titulo: extra.titulo ?? '', enlace: extra.enlace ?? '' });
    } catch (error) {
        console.error( error );
    }
}

// Avisa a TODOS los administradores activos (p. ej. un pago en efectivo por confirmar)
const notificarAdministradores = async ( tipo, mensaje, extra = {} ) => {
    try {
        const admins = await usuarioModel.find({ rol: 'Administrador', status: true }).select('_id').lean();
        await Promise.all( admins.map( a => notificar( a._id, tipo, mensaje, extra ) ) );
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

const dbContarSinLeer = async ( idUsuario ) => {
    return await notificacionModel.countDocuments({ usuario: idUsuario, leida: false });
}

const dbMarcarLeida = async ( id, idUsuario ) => {
    return await notificacionModel.findOneAndUpdate({ _id: id, usuario: idUsuario }, { leida: true }, { new: true });
}

const dbMarcarTodasLeidas = async ( idUsuario ) => {
    return await notificacionModel.updateMany({ usuario: idUsuario, leida: false }, { leida: true });
}

export { notificar, notificarAdministradores, dbListNotificaciones, dbContarSinLeer, dbMarcarLeida, dbMarcarTodasLeidas }