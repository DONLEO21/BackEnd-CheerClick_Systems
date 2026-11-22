import mongoose from "mongoose";
import { responderError, errorHttp } from "../helpers/errores.helpers.js";
import { validarAccesoNivel } from "../helpers/acceso.helpers.js";
import { esFechaISO, hoyISO } from "../helpers/fecha.helpers.js";
import { listarSesionesNivel } from "../helpers/sesiones.helpers.js";
import { dbCreateHorario, dbdeleteHorario, dbgetdHorario, dbGetHorarios, dbupdateHorario } from "../services/horarios.services.js";

// Respuestas repetidas, para no copiar el mismo código en cada función
const sinPermiso = (res, error) => res.status(403).json({ msg: error.message });

const idInvalido = (res, id, error) => res.status(400).json({
    msg: `El ID debe tener 24 caracteres y el enviado tiene ${id?.length}`,
    [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
});

const erroresValidacion = (error) => {
    const errors = {};
    for (const field in error.errors) {
        errors[field] = error.errors[field].message;
    }
    return errors;
};

const getHorario = async (req, res) => {
    try {
        // CAMBIO: se envía req.userFound para que el Entrenador solo vea sus niveles
        const data = await dbgetdHorario(req.query, req.userFound);
        res.json({ msg: 'Consulte los horarios', data: data });

    } catch (error) {
        console.error(error);
        if (error.status === 403) return sinPermiso(res, error);
        if (error.name == 'CastError') return idInvalido(res, error.value, error);
        res.status(500).json({ msg: 'No se pudo consultar los horarios' });
    }
}

const createHorario = async (req, res) => {
    try {
        const data = await dbCreateHorario(req.body, req.userFound);
        res.status(201).json({ msg: 'Registre un horario', data: data });

    } catch (error) {
        console.error(error);
        if (error.status === 403) return sinPermiso(res, error);
        if (error.name == 'CastError') return idInvalido(res, error.value, error);

        if (error.name == 'ValidationError') {
            return res.status(400).json({ errors: erroresValidacion(error) });
        }

        if (error.code == 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                msg: `Error por duplicidad en el campo '${field}'`,
                [field]: `El '${field}' de '${error.keyValue[field]}' ya se encuentra registrado`
            });
        }

        res.status(500).json({ msg: 'No se pudo registrar un horario' });
    }
}

const updateHorario = async (req, res) => {
    const id = req.params.id;
    try {
        const data = await dbupdateHorario(id, req.body, req.userFound);
        if (!data) return res.status(404).json({ msg: 'Horario no encontrado' });

        res.json({ msg: 'Actualiza un horario', data: data });

    } catch (error) {
        console.error(error);
        if (error.status === 403) return sinPermiso(res, error);
        if (error.name == 'CastError') return idInvalido(res, id, error);

        if (error.name == 'ValidationError') {
            return res.status(400).json({ errors: erroresValidacion(error) });
        }

        if (error.code == 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                msg: `Error por duplicidad en el campo '${field}'`,
                [field]: `El '${field}' de '${error.keyValue[field]}' ya se encuentra registrado`
            });
        }

        res.status(500).json({ msg: 'No se pudo actualizar un horario' });
    }
}

const deleteHorario = async (req, res) => {
    const id = req.params.id;
    try {
        const data = await dbdeleteHorario(id, req.userFound);
        if (!data) return res.status(404).json({ msg: 'Horario no encontrado' });

        res.json({ msg: 'Elimine un horario', data: data });

    } catch (error) {
        console.error(error);
        if (error.status === 403) return sinPermiso(res, error);
        if (error.name == 'CastError') return idInvalido(res, id, error);
        res.status(500).json({ msg: 'No se pudo eliminar un horario' });
    }
}

const getHorarios = async (req, res) => {
    const id = req.params.id;
    try {
        const data = await dbGetHorarios(id, req.userFound);
        if (!data) return res.status(404).json({ msg: 'Horario no encontrado' });

        res.json({ msg: 'Obtiene un horario', data: data });

    } catch (error) {
        console.error(error);
        if (error.status === 403) return sinPermiso(res, error);
        if (error.name == 'CastError') return idInvalido(res, id, error);
        res.status(500).json({ msg: 'No se puede obtener un horario' });
    }
}

export {
    getHorario,
    createHorario,
    updateHorario,
    deleteHorario,
    getHorarios
}

// GET /api/horarios/sesiones?nivelId=&hasta=AAAA-MM-DD|hoy&limite=12
// Días de sesión del nivel (según su plantilla semanal), del más reciente al más antiguo y nunca futuros.
// El entrenador solo consulta sus niveles. Sirve para elegir la fecha al registrar el rendimiento.
const getSesiones = async (req, res) => {
    try {
        const { nivelId, hasta, limite } = req.query;
        if (!nivelId || !mongoose.isValidObjectId(nivelId)) throw errorHttp(400, 'Se requiere un nivelId válido');
        await validarAccesoNivel(req.userFound, nivelId);

        const hoy = hoyISO();
        let tope = !hasta || hasta === 'hoy' ? hoy : hasta;
        if (!esFechaISO(tope)) throw errorHttp(400, 'El parámetro hasta debe ser "hoy" o AAAA-MM-DD');
        if (tope > hoy) tope = hoy;   // nunca sesiones futuras

        const cantidad = Math.min(Math.max(parseInt(limite, 10) || 12, 1), 60);
        const data = await listarSesionesNivel(nivelId, { hasta: tope, limite: cantidad });
        res.status(200).json({ success: true, msg: 'Sesiones del nivel', hoy, ...data });
    } catch (error) {
        responderError(res, error, 'No se han podido listar las sesiones');
    }
};

export { getSesiones };
