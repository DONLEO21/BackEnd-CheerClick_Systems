// Reglas de los métodos de pago (comparten modelo, servicio y controlador de pagos)
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** "Efectivo" no usa comprobante ni QR. */
export const esMetodoEfectivo = (nombre) => sinTildes(nombre) === 'efectivo';

/**
 * ¿Este método exige comprobante? Se guía por el atributo `requiereComprobante` del método (true por defecto);
 * "Efectivo" nunca lo exige aunque el documento antiguo no tenga el atributo.
 */
export const requiereComprobante = (metodo) => !esMetodoEfectivo(metodo?.nombre) && metodo?.requiereComprobante !== false;

/** Estado de un pago en efectivo ya solicitado por el atleta: el administrador lo confirma al recibir el dinero. */
export const ESTADO_PENDIENTE_CONFIRMACION = 'Pendiente de confirmación';
