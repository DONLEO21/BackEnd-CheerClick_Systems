import { dbListNotificaciones, dbMarcarLeida, dbMarcarTodasLeidas } from "../services/notificaciones.services.js";

// Lista las notificaciones del usuario logueado
const listarNotificaciones = async ( req, res ) => {
    try {
        const page = Math.max( Number( req.query.page ) || 1, 1 );
        const { data, total, sinLeer } = await dbListNotificaciones( req.userFound._id, page );

        res.json({ msg: 'Notificaciones', data, total, sinLeer });
    } catch (error) {
        console.error( error );
        res.status(500).json({ msg: 'No se pudieron obtener las notificaciones' });
    }
}

//Leer todas las notificacions
const marcarTodasLeidas = async ( req, res ) => {
    try {
        await dbMarcarTodasLeidas( req.userFound._id );
        res.json({ msg: 'Notificaciones marcadas como leídas' });
    } catch (error) {
        console.error( error );
        res.status(500).json({ msg: 'No se pudieron actualizar las notificaciones' });
    }
}

// Marcar una notificación como leída
const marcarLeida = async ( req, res ) => {
    try {
        const data = await dbMarcarLeida( req.params.id, req.userFound._id );
        if( ! data ) return res.status(404).json({ msg: 'Notificación no encontrada' });

        res.json({ msg: 'Notificación marcada como leída', data });
    } catch (error) {
        console.error( error );
        if( error.name === 'CastError' ) return res.status(400).json({ msg: 'El ID no tiene un formato válido' });
        res.status(500).json({ msg: 'No se pudo actualizar la notificación' });
    }
}

export { listarNotificaciones, marcarTodasLeidas, marcarLeida }