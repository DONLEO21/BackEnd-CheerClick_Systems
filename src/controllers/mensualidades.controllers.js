import { dbCreateMensualidad, dbGetMensualidad, dbGetMensualidades, dbUpdateMensualidad } from "../services/mensualidades.services.js";
import { generarMensualidadesDelMes, asegurarMensualidadActual, marcarVencidas, diaVencimiento, periodoDe } from "../services/generacionMensualidades.services.js";
import { dbGetUsuarioConPlan } from "../services/usuarios.services.js";
import { responderError } from "../helpers/errores.helpers.js";

const getFiltroPorRol = (user) => {
    switch (user.rol) {
        case 'Administrador':
            return {};         
        case 'Atleta':
            return { usuario: user._id };  
        default:
            return null;                 
    }
};

const CreateMensualidad = async (req, res) => {
    try {
        const { _id } = req.userFound;

        const inputData = req.body;
        inputData.createBy = _id;

        const data = await dbCreateMensualidad(inputData);

        return res.status(201).json({ msg: 'Registrar una nueva mensualidad', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'ValidationError') {
            const errors = {};

            for (const field in error.errors) {
                errors[field] = error.errors[field].message;
            }

            return res.status(400).json({ errors });
        }

        return res.status(500).json({ msg: 'Error al registrar una mensualidad' });
    }
};

// POST /api/mensualidades/generar  { periodo?: 'AAAA-MM' }  (solo administrador)
// Ejecuta la misma generación del cron (idempotente): útil para pruebas, demos o si el servidor estuvo apagado.
const GenerarMensualidades = async (req, res) => {
    try {
        const resultado = await generarMensualidadesDelMes({ periodo: req.body?.periodo || undefined });
        return res.status(200).json({
            success: true,
            msg: `Mensualidades de ${resultado.periodo}: ${resultado.creadas} creadas, ${resultado.omitidas} ya existían`,
            data: resultado
        });
    } catch (error) {
        responderError(res, error, 'No se pudieron generar las mensualidades');
    }
};

// GET /api/mensualidades/mi-plan  (atleta): su plan VIGENTE (el actual del usuario, no el de la última mensualidad), el valor
// del plan y el día de corte configurado. Con esto "Mi plan de membresía" muestra datos reales aunque aún no haya mensualidades.
const GetMiPlan = async (req, res) => {
    try {
        const usuario = await dbGetUsuarioConPlan(req.userFound._id);
        const plan = usuario?.planAsociado ?? null;
        return res.json({
            success: true,
            msg: 'Plan vigente del atleta',
            data: {
                plan: plan ? { _id: plan._id, nombre: plan.nombre, valor: plan.valor } : null,
                nivel: usuario?.nivel?.nombre ?? null,
                diaCorte: diaVencimiento(),
                periodoActual: periodoDe(),
            },
        });
    } catch (error) {
        responderError(res, error, 'No se pudo consultar tu plan');
    }
};

const GetMensualidad = async (req, res) => {
    try {
        const filter = getFiltroPorRol(req.userFound);

        if (filter === null) {
            return res.status(403).json({ msg: 'No tienes permisos para consultar las mensualidades' });
        }

        // Recuperación perezosa: un atleta activo con plan al que le falte la mensualidad del mes la recibe al abrir sus pagos;
        // y lo que sigue sin enviarse después de su vencimiento pasa a Vencido.
        if (req.userFound.rol === 'Atleta') await asegurarMensualidadActual(req.userFound._id);
        await marcarVencidas().catch((e) => console.error('[mensualidades] marcarVencidas', e));

        let data = await dbGetMensualidad(filter);

        const { buscar, estado, mes, plan, nivel } = req.query;

        if (buscar) {
            const texto = buscar.toLowerCase();
            data = data.filter(m =>
                `${m.usuario?.nombre} ${m.usuario?.apellido}`.toLowerCase().includes(texto) || (m.pago?.codigo ?? '').toLowerCase().includes(texto)
            );
        }
        if (estado) data = data.filter(m => m.pago?.estado === estado);
        if (mes)    data = data.filter(m => m.fechaGeneracion.getUTCMonth() + 1 === Number(mes));
        if (plan)   data = data.filter(m => String(m.planAsociado?._id) === plan);
        if (nivel)  data = data.filter(m => String(m.planAsociado?.nivel) === nivel);

        return res.status(200).json({ msg: 'Consultar todas las mensualidades', data });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: 'No se pudo consultar las mensualidades' });
    }
};

const UpdateMensualidad = async (req, res) => {
    const id = req.params.id;

    try {
        const inputData = req.body;

        const data = await dbUpdateMensualidad(id, inputData);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró la mensualidad a actualizar' });
        }

        return res.status(200).json({ msg: 'Actualizar los campos de la mensualidad', data: data });
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

        return res.status(500).json({ msg: 'No se pudo actualizar los campos de la mensualidad' });
    }
};

const GetMensualidades = async (req, res) => {
    const id = req.params.id;

    try {
        const filter = getFiltroPorRol(req.userFound);

        if (filter === null) {
            return res.status(403).json({ msg: 'No tienes permisos para consultar las mensualidades' });
        }

        const data = await dbGetMensualidades(id, filter);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró la mensualidad' });
        }

        return res.status(200).json({ msg: 'Consultar una de las mensualidades por su ID', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'CastError') {
            return res.status(400).json({
                msg: `Error en el formato del ID debe tener 24 caracteres el enviado tiene ${id.length}`,
                [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
            });
        }

        return res.status(500).json({ msg: 'No se pudo encontrar la mensualidad' });
    }
};

export {
    CreateMensualidad,
    GetMensualidad,
    UpdateMensualidad,
    GetMensualidades,
    GenerarMensualidades,
    GetMiPlan
};