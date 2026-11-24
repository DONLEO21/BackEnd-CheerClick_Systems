import mongoose from "mongoose";
import PagosModel from "../models/pagos.model.js";
import MensualidadModel from "../models/mensualidades.model.js";
import metodoPagoModel from "../models/metodoPago.model.js";
import { errorHttp } from "../helpers/errores.helpers.js";
import { esMetodoEfectivo, requiereComprobante, ESTADO_PENDIENTE_CONFIRMACION } from "../helpers/metodoPago.helpers.js";
import { notificarAdministradores } from "./notificaciones.services.js";

// Campos que un ATLETA puede enviar al pagar. Nunca `estado`, `valorTotal` ni `usuario`: eso lo decide el sistema.
const CAMPOS_ATLETA = ['metodoPago', 'fechaPago', 'comprobante', 'observaciones'];

const buscarMetodo = async (id) => {
    if (!id || !mongoose.isValidObjectId(id)) throw errorHttp(400, 'Selecciona un método de pago válido');
    const metodo = await metodoPagoModel.findById(id).lean();
    if (!metodo) throw errorHttp(400, 'El método de pago seleccionado no existe');
    return metodo;
};

/**
 * Reglas comunes cuando el ATLETA solicita/envía un pago (crear o completar el suyo):
 *  - Comprobante obligatorio SOLO si el método lo requiere (Efectivo no lo pide).
 *  - Pago en efectivo: sin comprobante y estado "Pendiente de confirmación" (el administrador lo marca Pagado
 *    al recibir el dinero).
 *  - El atleta nunca puede dejar un pago como "Pagado".
 * Devuelve los campos ya depurados para guardar y si es efectivo.
 */
const aplicarReglasAtleta = async (entrada, pagoActual = null) => {
    const datos = Object.fromEntries(CAMPOS_ATLETA.filter((c) => entrada[c] !== undefined).map((c) => [c, entrada[c]]));
    const metodo = await buscarMetodo(datos.metodoPago ?? pagoActual?.metodoPago);
    datos.metodoPago = metodo._id;

    const efectivo = esMetodoEfectivo(metodo.nombre);
    if (requiereComprobante(metodo)) {
        const comprobante = String(datos.comprobante ?? pagoActual?.comprobante ?? '').trim();
        if (!comprobante) throw errorHttp(400, `El comprobante es obligatorio para pagar con ${metodo.nombre}`);
        datos.comprobante = comprobante;
    } else {
        datos.comprobante = '';   // sin archivo: no se guarda nada
    }
    if (efectivo) datos.estado = ESTADO_PENDIENTE_CONFIRMACION;
    return { datos, efectivo, metodo };
};

/** Pago en efectivo solicitado: avisa a los administradores por la campanita. */
const avisarEfectivo = async (pago, usuario) => {
    const nombre = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() || 'Un atleta';
    const valor = Number(pago.valorTotal).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    await notificarAdministradores(
        'pago',
        `${nombre} solicitó un pago en efectivo por ${valor}. Confírmalo cuando recibas el dinero.`,
        { titulo: 'Pago en efectivo por confirmar', enlace: '/admin/pagos' }
    );
};

/**
 * ¿El atleta ya NO puede pagar/enviar este pago? Devuelve el mensaje del 409 o null si puede.
 *  - Pagado: ya fue confirmado.
 *  - En verificación: ya envió método/comprobante (o pidió pagar en efectivo) y el administrador aún no lo revisa.
 *  - Puede pagar: un pago generado sin envío (Pendiente/Vencido sin método) o uno RECHAZADO (reintento).
 */
const motivoBloqueo = (pago, esMensualidad) => {
    if (pago.estado === 'Pagado') return esMensualidad ? 'Esta mensualidad ya fue pagada' : 'Este pago ya fue pagado';
    if (pago.estado === ESTADO_PENDIENTE_CONFIRMACION) return 'Ya hay un pago en verificación';
    if (['Pendiente', 'Vencido'].includes(pago.estado) && (pago.metodoPago || pago.comprobante)) return 'Ya hay un pago en verificación';
    return null;
};

/**
 * PATCH de un pago hecho por un atleta (solo el suyo). La defensa real contra el doble pago vive AQUÍ:
 *  1. se valida el estado (409 con mensaje claro) y
 *  2. la escritura es una actualización condicional ATÓMICA: solo se aplica si el pago sigue "sin enviar" o "rechazado".
 *     Dos envíos simultáneos (doble clic, dos pestañas) -> uno pasa y el otro recibe 409.
 */
export const dbAtletaActualizaPago = async (id, usuario, entrada) => {
    const pago = await PagosModel.findOne({ _id: id, usuario: usuario._id }).lean();
    if (!pago) throw errorHttp(404, 'No se encontró el pago o no te pertenece');
    const esMensualidad = !!(await MensualidadModel.exists({ pago: id }));
    const bloqueo = motivoBloqueo(pago, esMensualidad);
    if (bloqueo) throw errorHttp(409, bloqueo);

    const { datos, efectivo } = await aplicarReglasAtleta(entrada, pago);
    // Reenviar un pago RECHAZADO lo devuelve a revisión (el administrador lo verifica de nuevo)
    // Enviar un pago atrasado (Vencido) también lo deja pendiente de verificación
    if (!datos.estado && pago.estado === 'Vencido') datos.estado = 'Pendiente';
    if (!datos.estado && pago.estado === 'Rechazado') { datos.estado = 'Pendiente'; if (datos.observaciones === undefined) datos.observaciones = ''; }

    const actualizado = await PagosModel.findOneAndUpdate(
        {
            _id: id,
            usuario: usuario._id,
            $or: [
                { estado: 'Rechazado' },
                { estado: { $in: ['Pendiente', 'Vencido'] }, metodoPago: null, comprobante: { $in: ['', null] } },
            ],
        },
        datos,
        { returnDocument: 'after', runValidators: true }
    );
    if (!actualizado) {
        // Otro envío se adelantó entre la lectura y la escritura
        const actual = await PagosModel.findById(id).lean();
        throw errorHttp(409, motivoBloqueo(actual ?? pago, esMensualidad) ?? 'Ya hay un pago en verificación');
    }

    if (efectivo) await avisarEfectivo(actualizado, usuario);
    return actualizado;
};

/** POST de un pago hecho por un atleta (p. ej. inscripción a una competencia): siempre a su nombre y no confirmado. */
export const dbAtletaCreaPago = async (usuario, entrada) => {
    const { datos, efectivo } = await aplicarReglasAtleta(entrada);
    const nuevo = await PagosModel.create({
        ...datos,
        valorTotal: entrada.valorTotal,
        fechaGenera: entrada.fechaGenera ?? new Date(),
        estado: efectivo ? ESTADO_PENDIENTE_CONFIRMACION : 'Pendiente',
        usuario: usuario._id,
    });
    if (efectivo) await avisarEfectivo(nuevo, usuario);
    return nuevo;
};

/**
 * Pago de un PEDIDO de implementos (solicitud). Mismas reglas que el resto de pagos (una sola fuente de verdad):
 *  - Método obligatorio y existente.
 *  - Comprobante obligatorio solo si el método lo requiere (Efectivo no).
 *  - Efectivo: queda "Pendiente de confirmación"; los digitales, "Pendiente" hasta que el administrador revise.
 * NO notifica: se avisa con `avisarPedidoEfectivo` cuando la solicitud ya quedó guardada.
 */
export const dbCrearPagoPedido = async (usuario, { metodoPago, comprobante, fechaPago, observaciones } = {}, valorTotal) => {
    const metodo = await buscarMetodo(metodoPago);
    const efectivo = esMetodoEfectivo(metodo.nombre);
    const archivo = String(comprobante ?? '').trim();
    if (requiereComprobante(metodo) && !archivo)
        throw errorHttp(400, `El comprobante es obligatorio para pagar con ${metodo.nombre}`);

    const pago = await PagosModel.create({
        valorTotal,
        fechaGenera: new Date(),
        estado: efectivo ? ESTADO_PENDIENTE_CONFIRMACION : 'Pendiente',
        metodoPago: metodo._id,
        comprobante: requiereComprobante(metodo) ? archivo : '',
        ...(fechaPago ? { fechaPago } : {}),
        ...(observaciones ? { observaciones: String(observaciones).slice(0, 100) } : {}),
        usuario: usuario._id ?? usuario,
    });
    return { pago, efectivo };
};

/** Avisa a los administradores (campanita) de que hay un pedido en efectivo por confirmar. */
export const avisarPedidoEfectivo = async (usuario, solicitud, valorTotal) => {
    const nombre = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() || 'Un atleta';
    const valor = Number(valorTotal).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    await notificarAdministradores(
        'pago',
        `${nombre} hizo el pedido ${solicitud.codigo ?? ''} para pagar en efectivo (${valor}). Confírmalo al entregarlo.`.replace('  ', ' '),
        { titulo: 'Pedido en efectivo por confirmar', enlace: '/admin/implementos' }
    );
};

/** Al ENTREGAR un pedido, un pago en efectivo pendiente se da por recibido (se confirma el dinero). */
export const dbConfirmarPagoEfectivoPedido = async (pagoId) => {
    await PagosModel.updateOne(
        { _id: pagoId, estado: ESTADO_PENDIENTE_CONFIRMACION },
        { estado: 'Pagado', fechaPago: new Date() }
    );
};
