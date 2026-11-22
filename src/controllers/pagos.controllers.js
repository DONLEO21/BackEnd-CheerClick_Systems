import {dbgetPagos, dbInsertPago, dbReadPagos, dbUpdatePago } from "../services/pagos.services.js";
import { dbAtletaActualizaPago, dbAtletaCreaPago } from "../services/solicitudPago.services.js";
import { responderError } from "../helpers/errores.helpers.js";
import { notificar } from "../services/notificaciones.services.js";

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

const getPagos = async (req, res) => {
    try {
        const filter = getFiltroPorRol(req.userFound);

        if (filter === null) {
            return res.status(403).json({ msg: 'No tienes permisos para consultar los pagos' });
        }

        let data = await dbReadPagos(filter);

        const { buscar, estado, mes } = req.query;

        if (buscar) {
            const texto = buscar.toLowerCase();
            data = data.filter(p =>
                `${p.usuario?.nombre} ${p.usuario?.apellido}`.toLowerCase().includes(texto) || (p.codigo ?? '').toLowerCase().includes(texto)
            );
        }
        if (estado) data = data.filter(p => p.estado === estado);
        if (mes)    data = data.filter(p => p.fechaGenera.getUTCMonth() + 1 === Number(mes));

        return res.status(200).json({ msg: 'Consultar los pagos registrados', data });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: 'No se pudo consultar los pagos registrados' });
    }
};

const getPago = async (req, res) => {
    const id = req.params.id;

    try {
        const filter = getFiltroPorRol(req.userFound);

        if (filter === null) {
            return res.status(403).json({ msg: 'No tienes permisos para consultar los pagos' });
        }

        const data = await dbgetPagos(id, filter);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró el pago' });
        }

        return res.status(200).json({ msg: 'Consultar uno de los pagos por ID', data: data });
    } catch (error) {
        console.error(error);

        if (error.name == 'CastError') {
            return res.status(400).json({
                msg: `Error en el formato del ID debe tener 24 caracteres el enviado tiene ${id.length}`,
                [error.path]: `El identificador ${error.value} no tiene el formato valido que requiere MongoDB`
            });
        }

        return res.status(500).json({ msg: 'No se pudo consultar el pago por su ID' });
    }
};

const createPago = async (req, res) => {
    try {
        const inputData = req.body;

        // El atleta solo crea pagos propios y no confirmados; el comprobante depende del método (Efectivo no lo pide)
        if (req.userFound.rol === 'Atleta') {
            const nuevo = await dbAtletaCreaPago(req.userFound, inputData);
            return res.status(201).json({ success: true, msg: nuevo.estado === 'Pendiente de confirmación' ? 'Solicitud de pago en efectivo registrada' : 'Registrar Pagos', data: nuevo });
        }

        const data = await dbInsertPago(inputData);

        return res.status(201).json({ msg: 'Registrar Pagos', data: data });
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

        if (error.status) return responderError(res, error, 'Error al registrar pago');

        return res.status(500).json({ msg: 'Error al registrar pago' });
    }
};

const updatePagoPatch = async (req, res) => {
    const id = req.params.id;

    try {
        const inputData = req.body;

        // Atleta: solo su propio pago, con campos limitados y sin poder marcarlo como Pagado (ver solicitudPago.services)
        if (req.userFound.rol === 'Atleta') {
            const propio = await dbAtletaActualizaPago(id, req.userFound, inputData);
            return res.status(200).json({ success: true, msg: propio.estado === 'Pendiente de confirmación' ? 'Pago en efectivo solicitado: queda pendiente de confirmación' : 'Pago enviado', data: propio });
        }

        const data = await dbUpdatePago(id, inputData);

        if (!data) {
            return res.status(404).json({ msg: 'No se encontró el pago a actualizar' });
        }

        // Confirmar o rechazar un pago avisa al atleta (campanita)
        if (['Pagado', 'Rechazado'].includes(inputData.estado) && data.usuario) {
            const confirmado = inputData.estado === 'Pagado';
            await notificar(data.usuario, 'pago',
                `Tu pago ${data.codigo ?? ''} fue ${confirmado ? 'confirmado' : 'rechazado'}${!confirmado && data.observaciones ? `: ${data.observaciones}` : '.'}`.replace('  ', ' '),
                { titulo: confirmado ? 'Pago confirmado' : 'Pago rechazado', enlace: '/atleta/pagos' });
        }

        return res.status(200).json({ msg: 'Actualizar los campos del pago', data: data });
    } catch (error) {
        console.error(error);

        // Errores de las reglas del atleta (400/403/404/409 con mensaje claro)
        if (error.status) return responderError(res, error, 'Error al actualizar los campos de pago');

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

        return res.status(500).json({ msg: 'Error al actualizar los campos de pago' });
    }
};

export {
    getPagos,
    createPago,
    updatePagoPatch,
    getPago
};