import AsistenciaModel from "../models/asistencia.model.js";
import metodoPagoModel from "../models/metodoPago.model.js";

/**
 * Índices de la colección "asistencias" (idempotente; no borra ni modifica documentos).
 *  1. Elimina el índice único antiguo { usuario, horario }: con `horario: null` solo permitía UNA asistencia por
 *     atleta en toda su vida (guardar el segundo día fallaba con E11000).
 *  2. Crea los índices del modelo: único parcial { usuario, fecha } y { nivel, fecha }.
 * Se ejecuta al arrancar el servidor y también con `node --env-file .env scripts/migrar-asistencia.js`.
 * @returns {Promise<{ eliminado: string|null, indices: string[] }>}
 */
export const migrarIndicesAsistencia = async () => {
    const coleccion = AsistenciaModel.collection;
    const indices = await coleccion.indexes().catch(() => []);   // la colección puede no existir todavía
    const viejo = indices.find((i) => i.unique && i.key?.usuario === 1 && i.key?.horario === 1 && !i.key?.fecha);

    if (viejo) await coleccion.dropIndex(viejo.name);
    await AsistenciaModel.createIndexes();

    return { eliminado: viejo?.name ?? null, indices: (await coleccion.indexes()).map((i) => i.name) };
};

/**
 * Métodos de pago (idempotente): garantiza que exista "Efectivo" (sin comprobante ni QR) y que todos los métodos
 * tengan `requiereComprobante` (digitales = true). El pedido y la mensualidad en efectivo dependen de este registro.
 */
export const asegurarMetodosPago = async () => {
    const reEfectivo = /^\s*efectivo\s*$/i;
    let creado = false;
    if (!(await metodoPagoModel.findOne({ nombre: reEfectivo }).lean())) {
        await metodoPagoModel.create({ nombre: 'Efectivo', requiereComprobante: false });
        creado = true;
    }
    await metodoPagoModel.updateMany({ nombre: reEfectivo }, { requiereComprobante: false, qr: '' });
    await metodoPagoModel.updateMany({ nombre: { $not: reEfectivo }, requiereComprobante: { $exists: false } }, { requiereComprobante: true });
    return { efectivoCreado: creado };
};
