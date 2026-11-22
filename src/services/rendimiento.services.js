import mongoose from "mongoose";
import RendimientoModel from "../models/rendimiento.models.js";
import AsistenciaModel from "../models/asistencia.model.js";
import HabilidadesModel from "../models/habilidades.model.js";
import NotaModel from "../models/nota.model.js";
import usuarioModel from "../models/usuarios.model.js";
import perfilUsuarioModel from "../models/perfilUsuario.model.js";
import { validarAccesoAtleta, validarAccesoNivel } from "../helpers/acceso.helpers.js";
import { errorHttp } from "../helpers/errores.helpers.js";
import { calcularEdad, esFechaISO, fechaADate, hoyISO } from "../helpers/fecha.helpers.js";
import { esDiaDeSesion } from "../helpers/sesiones.helpers.js";
import { reservarCodigos } from "../helpers/consecutivo.helpers.js";

const MAX_NOTA = 250;

// Estado actual = la última evaluación de cada habilidad por atleta
// Si la evaluación no trae `usuario` (documentos antiguos) se toma de su asistencia.
const ultimaCalificacion = (match = {}) => [
    { $lookup: { from: AsistenciaModel.collection.name, localField: 'asistencia', foreignField: '_id', as: '_asis' } },
    { $addFields: { usuario: { $ifNull: ['$usuario', { $arrayElemAt: ['$_asis.usuario', 0] }] } } },
    { $match: match },
    { $sort: { fecha: -1, createdAt: -1 } },
    {
        $group: {
            _id: { usuario: '$usuario', habilidad: '$habilidad' },
            calificacion: { $first: '$calificacion' },
            observaciones: { $first: '$observaciones' },
            fecha: { $first: '$fecha' },
        },
    },
];

const dbGetRendimiento = async (query = {}, restriccion = {}) => {
    const filtro = {};
    if (query.usuario) filtro.usuario = query.usuario;
    if (query.asistencia) filtro.asistencia = query.asistencia;
    if (query.habilidad) filtro.habilidad = query.habilidad;

    return await RendimientoModel.find({ ...filtro, ...restriccion })
        .populate('habilidad', 'nombre estado nivel')
        .sort({ fecha: -1 })
        .lean();
};

// Habilidades con el estado del atleta + resumen + notas (lo que pide "Mi Rendimiento")
const dbGetRendimientoAtleta = async (atletaId) => {
    if (!mongoose.isValidObjectId(atletaId)) throw errorHttp(400, 'ID de atleta inválido');

    const [habilidades, ultimas] = await Promise.all([
        HabilidadesModel.find({ estado: 'Activo' }).populate('tipoHabilidad').lean(),
        RendimientoModel.aggregate(ultimaCalificacion({ usuario: new mongoose.Types.ObjectId(String(atletaId)) })),
    ]);

    const porHabilidad = new Map(ultimas.map((u) => [String(u._id.habilidad), u]));
    const items = habilidades.map((h) => {
        const u = porHabilidad.get(String(h._id));
        return {
            ...h,
            completado: u?.calificacion ?? false,
            observaciones: u?.observaciones ?? null,
            fechaEvaluacion: u?.fecha ?? null,
        };
    });

    const completadas = items.filter((i) => i.completado).length;
    const porCategoria = {};
    for (const i of items) {
        const categoria = i.tipoHabilidad?.nombre ?? 'Sin tipo';
        porCategoria[categoria] ??= { total: 0, completadas: 0 };
        porCategoria[categoria].total++;
        if (i.completado) porCategoria[categoria].completadas++;
    }

    return {
        habilidades: items,
        resumen: {
            total: items.length,
            completadas,
            porcentaje: items.length ? Math.round((completadas / items.length) * 100) : 0,
            porCategoria,
        },
    };
};

// Listado de rendimiento: TODOS los atletas activos (equivalente a un LEFT JOIN atletas -> rendimiento).
// Los atletas sin ninguna evaluación se devuelven con `rendimiento: null` (el frontend los muestra como
// "Sin rendimiento registrado"). `nivel` puede ser un id o un filtro Mongo ({ $in: [...] }) para el entrenador.
const dbGetResumenRendimiento = async (nivel) => {
    const filtro = { rol: 'Atleta', status: true, estadoSolicitud: 'Aprobada' };
    if (nivel) filtro.nivel = nivel;

    const atletas = await usuarioModel
        .find(filtro)
        .select('nombre apellido codigo nivel')
        .populate('nivel', 'nombre')
        .sort({ apellido: 1, nombre: 1 })
        .lean();
    if (atletas.length === 0) return [];

    const ids = atletas.map((a) => a._id);
    const activas = await HabilidadesModel.distinct('_id', { estado: 'Activo' });

    // Edad: se calcula aquí a partir de la fecha de nacimiento del perfil (null si el atleta aún no la registró)
    const perfiles = await perfilUsuarioModel.find({ perteneceA: { $in: ids } }).select('perteneceA fechaNacimiento').lean();
    const nacimientoPorUsuario = new Map(perfiles.map((p) => [String(p.perteneceA), p.fechaNacimiento]));

    // Última calificación por atleta y habilidad (solo habilidades activas)
    const ultimas = await RendimientoModel.aggregate([
        ...ultimaCalificacion({ usuario: { $in: ids }, habilidad: { $in: activas } }),
        {
            $group: {
                _id: '$_id.usuario',
                evaluadas: { $sum: 1 },
                completadas: { $sum: { $cond: ['$calificacion', 1, 0] } },
                ultimaFecha: { $max: '$fecha' },
            },
        },
    ]);
    const porUsuario = new Map(ultimas.map((u) => [String(u._id), u]));

    return atletas.map((a) => {
        const u = porUsuario.get(String(a._id));
        return {
            ...a,
            edad: calcularEdad(nacimientoPorUsuario.get(String(a._id))),
            rendimiento: u
                ? {
                    completadas: u.completadas,
                    total: activas.length,
                    porcentaje: activas.length ? Math.round((u.completadas / activas.length) * 100) : 0,
                    ultimaFecha: u.ultimaFecha,
                }
                : null,
        };
    });
};

// Guarda de una vez los cambios del entrenador sobre un atleta 
const dbGuardarRendimientoAtleta = async (usuarioSesion, atletaId, { fecha, habilidades, nota } = {}) => {
    fecha = fecha ?? hoyISO();
    if (!esFechaISO(fecha)) throw errorHttp(400, 'La fecha debe tener formato AAAA-MM-DD');

    const lista = Array.isArray(habilidades) ? habilidades : [];
    const texto = nota?.trim() ?? '';
    if (lista.length === 0 && !texto) throw errorHttp(400, 'No hay cambios para guardar');
    if (texto.length > MAX_NOTA) throw errorHttp(400, `La nota no puede superar los ${MAX_NOTA} caracteres`);

    await validarAccesoAtleta(usuarioSesion, atletaId);

    // La fecha debe ser un día de sesión del nivel del atleta y no futura. Un rendimiento antiguo (ya existe uno
    // en esa fecha) se puede seguir editando aunque su fecha ya no cumpla la regla.
    if (fecha > hoyISO()) throw errorHttp(400, 'No se puede registrar rendimiento de una fecha futura');
    const atleta = await usuarioModel.findById(atletaId).select('nivel').lean();
    if (atleta?.nivel) {
        const yaExiste = await RendimientoModel.exists({ usuario: atletaId, fecha: fechaADate(fecha) });
        if (!yaExiste && !(await esDiaDeSesion(atleta.nivel, fecha))) {
            throw errorHttp(400, `El ${fecha} no es un día de sesión del nivel de este atleta. Elige uno de los días de entrenamiento.`);
        }
    }

    if (lista.length > 0) {
        // La evaluación se relaciona con la asistencia de ese día
        const asistencia = await AsistenciaModel.findOne({ usuario: atletaId, fecha });
        if (!asistencia) {
            throw errorHttp(400, `El atleta no tiene asistencia registrada el ${fecha}. Registra primero la asistencia.`);
        }
        if (['Inasistencia', 'Justificado'].includes(asistencia.tipoNovedad)) {
            throw errorHttp(400, 'No se puede evaluar a un atleta que no asistió ese día');
        }
        await validarAccesoNivel(usuarioSesion, asistencia.nivel);

        const ids = lista.map((h) => h.habilidad);
        if (ids.some((id) => !mongoose.isValidObjectId(id))) throw errorHttp(400, 'Hay una habilidad con ID inválido');
        if (lista.some((h) => typeof h.calificacion !== 'boolean')) throw errorHttp(400, 'La calificación debe ser true o false');

        const activas = await HabilidadesModel.countDocuments({ _id: { $in: ids }, estado: 'Activo' });
        if (activas !== new Set(ids.map(String)).size) {
            throw errorHttp(400, 'Hay habilidades que no existen o están inactivas');
        }

        // bulkWrite + upsert NO ejecuta los hooks de save: el código (RD001…) de los registros NUEVOS se reserva aquí
        // (una sola reserva atómica) y se escribe con $setOnInsert; los que ya existen conservan el suyo.
        const existentes = new Set((await RendimientoModel.find({ asistencia: asistencia._id, habilidad: { $in: ids } }).select('habilidad').lean())
            .map((r) => String(r.habilidad)));
        const nuevos = lista.filter((h) => !existentes.has(String(h.habilidad)));
        const codigos = new Map(nuevos.map((h, i) => [String(h.habilidad), null]));
        (await reservarCodigos('RD', nuevos.length)).forEach((c, i) => codigos.set(String(nuevos[i].habilidad), c));

        await RendimientoModel.bulkWrite(lista.map((h) => ({
            updateOne: {
                filter: { asistencia: asistencia._id, habilidad: h.habilidad },
                update: {
                    $set: {
                        usuario: atletaId,
                        calificacion: h.calificacion,
                        observaciones: h.observaciones?.trim() || null,
                        fecha: fechaADate(fecha),
                    },
                    ...(codigos.get(String(h.habilidad)) ? { $setOnInsert: { codigo: codigos.get(String(h.habilidad)) } } : {}),
                },
                upsert: true,
            },
        })));
    }

    if (texto) {
        await NotaModel.create({ usuario: atletaId, autor: usuarioSesion._id, fecha, texto });
    }

    return await dbGetRendimientoAtleta(atletaId);
};

const dbCreateRendimiento = async (usuarioSesion, { asistencia: asistenciaId, habilidad, calificacion, observaciones } = {}) => {
    const asistencia = await AsistenciaModel.findById(asistenciaId);
    if (!asistencia) throw errorHttp(404, 'La asistencia no existe');
    if (['Inasistencia', 'Justificado'].includes(asistencia.tipoNovedad)) {
        throw errorHttp(400, 'No se puede evaluar a un atleta que no asistió');
    }
    await validarAccesoNivel(usuarioSesion, asistencia.nivel);

    const existe = await HabilidadesModel.exists({ _id: habilidad, estado: 'Activo' });
    if (!existe) throw errorHttp(400, 'La habilidad no existe o está inactiva');

    return await RendimientoModel.create({
        asistencia: asistencia._id,
        usuario: asistencia.usuario,
        habilidad,
        calificacion,
        observaciones,
        fecha: fechaADate(asistencia.fecha),
    });
};

const dbUpdateRendimiento = async (usuarioSesion, id, { calificacion, observaciones } = {}) => {
    const rendimiento = await RendimientoModel.findById(id);
    if (!rendimiento) return null;

    const asistencia = await AsistenciaModel.findById(rendimiento.asistencia);
    if (asistencia) await validarAccesoNivel(usuarioSesion, asistencia.nivel);

    if (calificacion !== undefined) rendimiento.calificacion = calificacion;
    if (observaciones !== undefined) rendimiento.observaciones = observaciones;
    return await rendimiento.save();
};

const dbDeleteRendimiento = async (usuarioSesion, id) => {
    const rendimiento = await RendimientoModel.findById(id);
    if (!rendimiento) return null;

    const asistencia = await AsistenciaModel.findById(rendimiento.asistencia);
    if (asistencia) await validarAccesoNivel(usuarioSesion, asistencia.nivel);

    await rendimiento.deleteOne();
    return rendimiento;
};

export {
    dbCreateRendimiento,
    dbGetRendimiento,
    dbGetRendimientoAtleta,
    dbGetResumenRendimiento,
    dbGuardarRendimientoAtleta,
    dbDeleteRendimiento,
    dbUpdateRendimiento
}