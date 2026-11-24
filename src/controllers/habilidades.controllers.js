import { dbCreateHabilidad, dbDeleteHabilidad, dbGetHabilidad, dbGetHabilidades, dbUpdateHabilidad } from "../services/habilidades.services.js";
import { nivelesDelEntrenador, validarAccesoNivel } from "../helpers/acceso.helpers.js";
import { responderError } from "../helpers/errores.helpers.js";
import { actuaComoEntrenador } from "../helpers/roles.helpers.js";

const getHabilidades = async (req, res) => {
    try {
        const { buscar, estado, tipo, nivelId } = req.query;

        // ?nivelId= filtra por nivel. El entrenador solo puede consultar SUS niveles (validado aquí, no en el frontend):
        // sin nivelId se le devuelven las habilidades de todos sus niveles.
        let filtroNivel = nivelId || undefined;
        if (actuaComoEntrenador(req.userFound)) {
            if (nivelId) await validarAccesoNivel(req.userFound, nivelId);
            else filtroNivel = { $in: await nivelesDelEntrenador(req.userFound._id) };
        }

        let data = await dbGetHabilidades({ nivelId: filtroNivel });

        if (buscar) {
            const texto = buscar.toLowerCase();
            data = data.filter(h => h.nombre.toLowerCase().includes(texto) || (h.codigo ?? '').toLowerCase().includes(texto));
        }
        if (estado) data = data.filter(h => h.estado === estado);
        if (tipo)   data = data.filter(h => String(h.tipoHabilidad?._id) === tipo);

        return res.status(200).json({ msg: 'Consultar todas las habilidades registradas', data });
    } catch (error) {
        console.error(error);

        // Errores con código (403 de nivel ajeno, ID mal formado…) con su mensaje real
        if (error.status || error.name === 'CastError') return responderError(res, error, 'No se pudo consultar las habilidades registradas');

        return res.status(500).json({ msg: 'No se pudo consultar las habilidades registradas' });
    }
};

const getHabilidad = async (req, res) => {
    const id = req.params.id;

    try {
        const data = await dbGetHabilidad(id);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró la habilidad' });
        }

        return res.status(200).json({ msg: 'Consultar una de las habilidades por ID', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'CastError') {
            return res.status(400).json({
                msg: `Error en el formato del ID debe tener 24 caracteres el enviado tiene ${id.length}`,
                [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
            });
        }

        return res.status(500).json({ msg: 'No se pudo consultar la habilidad registrada' });
    }
};

const createHabilidad = async (req, res) => {
    try {
        const inputData = req.body;

        const data = await dbCreateHabilidad(inputData);

        return res.status(201).json({ msg: 'Registrar habilidad', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'ValidationError') {
            const errors = {};

            for (const field in error.errors) {
                errors[field] = error.errors[field].message;
            }

            return res.status(400).json({ errors });
        }

        if (error.code == 11000) {
            const field = Object.keys(error.keyValue)[0];

            return res.status(409).json({
                [field]: `El '${field}' con el valor '${error.keyValue[field]}' ya se encuentra registrado`
            });
        }

        return res.status(500).json({ msg: 'Error al registrar la habilidad' });
    }
};

const updateHabilidad = async (req, res) => {
    const id = req.params.id;

    try {
        const inputData = req.body;

        // El entrenador solo puede habilitar o deshabilitar (cambiar `estado`); el resto es del administrador.
        // TODO: la habilidad no guarda a qué nivel pertenece, por eso no se puede limitar al nivel del entrenador.
        if (req.userFound?.rol === 'Entrenador') {
            const campos = Object.keys(inputData ?? {});
            if (campos.length === 0 || campos.some((c) => c !== 'estado')) {
                return res.status(403).json({ msg: 'El entrenador solo puede habilitar o deshabilitar habilidades' });
            }
        }

        const data = await dbUpdateHabilidad(id, inputData);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró la habilidad a actualizar' });
        }

        return res.status(200).json({ msg: 'Actualizar los campos de la habilidad', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'ValidationError') {
            const errors = {};

            for (const field in error.errors) {
                errors[field] = error.errors[field].message;
            }

            return res.status(400).json({ errors });
        }

        if (error.name == 'CastError') {
            return res.status(400).json({
                msg: `Error en el formato del ID debe tener 24 caracteres el enviado tiene ${id.length}`,
                [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
            });
        }

        if (error.code == 11000) {
            const field = Object.keys(error.keyValue)[0];

            return res.status(409).json({
                [field]: `El '${field}' con el valor '${error.keyValue[field]}' ya se encuentra registrado`
            });
        }

        return res.status(500).json({ msg: 'Error al actualizar los campos de la habilidad' });
    }
};

const deleteHabilidad = async (req, res) => {
    const id = req.params.id;

    try {
        const data = await dbDeleteHabilidad(id);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró la habilidad a eliminar' });
        }

        return res.status(200).json({ msg: 'Eliminar una habilidad', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'CastError') {
            return res.status(400).json({
                msg: `Error en el formato del ID debe tener 24 caracteres el enviado tiene ${id.length}`,
                [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
            });
        }

        return res.status(500).json({ msg: 'No se pudo eliminar la habilidad' });
    }
};

export {
    getHabilidad,
    getHabilidades,
    updateHabilidad,
    deleteHabilidad,
    createHabilidad
};