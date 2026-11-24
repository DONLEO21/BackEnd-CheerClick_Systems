import MensualidadModel from "../models/mensualidades.model.js";
import PagosModel from "../models/pagos.model.js";
import PlanAsociadoModel from "../models/planAsociado.model.js";
import usuarioModel from "../models/usuarios.model.js";
import { notificar } from "./notificaciones.services.js";

// ── Configuración (variables de entorno, todas opcionales) ──
//   MENSUALIDADES_TZ              zona horaria que define "el mes actual"        (America/Bogota)
//   MENSUALIDAD_DIA_VENCIMIENTO   día del mes en que vence la mensualidad (1-28) (10)
export const ZONA_HORARIA = () => process.env.MENSUALIDADES_TZ || 'America/Bogota';
export const diaVencimiento = () => Math.min(28, Math.max(1, Number(process.env.MENSUALIDAD_DIA_VENCIMIENTO) || 10));

const pad = (n) => String(n).padStart(2, '0');

/** Periodo 'AAAA-MM' de una fecha según la zona horaria configurada. */
export const periodoDe = (fecha = new Date()) => {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA(), year: 'numeric', month: '2-digit' }).format(fecha);
    return partes.slice(0, 7); // en-CA => 2026-12
};

const mesLegible = (periodo) => {
    const [anio, mes] = periodo.split('-').map(Number);
    const nombre = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 1)));
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
};

// Fecha a mediodía de Colombia (no se corre de día al guardarse en UTC)
const aFecha = (periodo, dia) => new Date(`${periodo}-${pad(dia)}T12:00:00-05:00`);

const dinero = (valor) => `$${Number(valor).toLocaleString('es-CO')}`;

const validarPeriodo = (periodo) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw Object.assign(new Error('El periodo debe tener formato AAAA-MM'), { status: 400 });
};

/**
 * ÚNICO camino para crear la mensualidad de un atleta en un periodo. Lo usan: la aprobación de la cuenta (y la creación por
 * el administrador), el job del día 1, la recuperación al arrancar, el cambio de plan y la apertura de "Mis pagos".
 *
 * Idempotente: no duplica si ya existe (verificación previa + índice único usuario/periodo). Guarda el plan y el VALOR
 * vigente del plan al crearla; el pago nace "Pendiente" y vence el día configurado (MENSUALIDAD_DIA_VENCIMIENTO, 10).
 * Solo genera para atletas ACTIVOS, aprobados y con plan: rechazados, inactivos o sin plan no generan nada.
 *
 * @returns {Promise<{ estado: 'creada'|'existente'|'omitida', motivo?: string, mensualidad?: object }>}
 */
export const asegurarMensualidad = async (atletaId, periodo = periodoDe(), { notificarAtleta = true } = {}) => {
    validarPeriodo(periodo);

    const atleta = await usuarioModel.findById(atletaId).select('nombre apellido codigo rol status estadoSolicitud planAsociado').lean();
    if (!atleta) return { estado: 'omitida', motivo: 'El atleta no existe' };
    if (atleta.rol !== 'Atleta') return { estado: 'omitida', motivo: 'El usuario no es atleta' };
    if (atleta.estadoSolicitud !== 'Aprobada') return { estado: 'omitida', motivo: 'La cuenta no está aprobada' };
    if (!atleta.status) return { estado: 'omitida', motivo: 'La cuenta está inactiva' };
    if (!atleta.planAsociado) return { estado: 'omitida', motivo: 'El atleta no tiene plan asignado' };

    const existente = await MensualidadModel.findOne({ usuario: atleta._id, periodo }).lean();
    if (existente) return { estado: 'existente', mensualidad: existente };

    // El plan de un atleta se respeta aunque el administrador lo haya deshabilitado para nuevos registros
    const plan = await PlanAsociadoModel.findById(atleta.planAsociado).lean();
    if (!plan) return { estado: 'omitida', motivo: 'El plan asignado no existe' };

    const fechaGeneracion = aFecha(periodo, 1);
    let fechaVencimiento = aFecha(periodo, diaVencimiento());
    // Cuenta aprobada DESPUÉS del día de corte del mes en curso: no nace ya vencida; se le da un plazo de 7 días desde hoy
    if (periodo === periodoDe() && fechaVencimiento < new Date()) {
        fechaVencimiento = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    let pago = null;
    try {
        pago = await PagosModel.create({
            estado: 'Pendiente',
            valorTotal: plan.valor,
            fechaGenera: fechaGeneracion,
            usuario: atleta._id,
        });

        const mensualidad = await MensualidadModel.create({
            periodo,
            fechaGeneracion,
            fechaVencimiento,
            valor: plan.valor,
            numReferencia: `MS-${atleta.codigo ?? String(atleta._id).slice(-5).toUpperCase()}-${periodo.replace('-', '')}`,
            planAsociado: plan._id,
            pago: pago._id,
            usuario: atleta._id,
        });

        if (notificarAtleta) {
            await notificar(
                atleta._id,
                'pago',
                `Tienes pendiente tu mensualidad de ${mesLegible(periodo)}: ${dinero(plan.valor)}`,
                { titulo: 'Mensualidad pendiente', enlace: '/atleta/pagos' }
            );
        }
        return { estado: 'creada', mensualidad };
    } catch (error) {
        // El pago huérfano se elimina para no dejar basura si la mensualidad no se pudo crear
        if (pago) await PagosModel.deleteOne({ _id: pago._id }).catch(() => {});
        if (error.code === 11000) return { estado: 'existente' };   // otra ejecución ya la creó (carrera)
        throw error;
    }
};

/** Mensualidad del mes en curso de un atleta (best-effort: nunca debe romper la petición que la dispara). */
export const asegurarMensualidadActual = async (atletaId) => {
    try {
        return await asegurarMensualidad(atletaId, periodoDe());
    } catch (error) {
        console.error('[mensualidades] no se pudo asegurar la mensualidad actual de', String(atletaId), error);
        return { estado: 'omitida', motivo: error.message };
    }
};

/**
 * Pasa a "Vencido" los pagos de mensualidad que siguen sin enviar después de su fecha de vencimiento. No toca los que ya
 * tienen método o comprobante enviado (están en verificación) ni los pagados o rechazados. Idempotente y barato.
 */
export const marcarVencidas = async () => {
    const vencidas = await MensualidadModel.find({ fechaVencimiento: { $lt: new Date() } }).select('pago').lean();
    if (vencidas.length === 0) return 0;
    const r = await PagosModel.updateMany(
        { _id: { $in: vencidas.map((m) => m.pago) }, estado: 'Pendiente', metodoPago: null, comprobante: { $in: ['', null] } },
        { estado: 'Vencido' }
    );
    return r.modifiedCount ?? 0;
};

/**
 * Cambia el plan de un atleta y ajusta su mensualidad del periodo actual:
 *  - sin mensualidad del periodo  -> se crea con el plan nuevo ('creada')
 *  - Pendiente SIN enviar          -> se actualiza plan y valor ('actualizada')
 *  - Pagada / en verificación / vencida / rechazada -> no se toca: el plan nuevo rige desde el periodo siguiente ('siguiente-periodo')
 * El historial pagado nunca se modifica. Devuelve { accion, periodo }.
 */
export const aplicarCambioDePlan = async (atletaId, plan) => {
    const periodo = periodoDe();
    const actual = await MensualidadModel.findOne({ usuario: atletaId, periodo }).lean();
    if (!actual) {
        const r = await asegurarMensualidad(atletaId, periodo);
        return { accion: r.estado === 'creada' ? 'creada' : 'sin-mensualidad', periodo };
    }
    const pago = await PagosModel.findById(actual.pago).lean();
    const sinEnviar = pago?.estado === 'Pendiente' && !pago.metodoPago && !pago.comprobante;
    if (!sinEnviar) return { accion: 'siguiente-periodo', periodo };

    await MensualidadModel.updateOne({ _id: actual._id }, { planAsociado: plan._id, valor: plan.valor });
    await PagosModel.updateOne({ _id: actual.pago, estado: 'Pendiente' }, { valorTotal: plan.valor });
    return { accion: 'actualizada', periodo };
};

/**
 * Genera la mensualidad del mes para cada atleta ACTIVO y aprobado que tenga plan asignado (job del día 1, arranque del
 * servidor, botón manual). Usa `asegurarMensualidad`, así que es idempotente.
 *
 * @param {{ periodo?: string }} [opciones] periodo 'AAAA-MM' (por defecto, el mes actual en la zona configurada)
 * @returns {Promise<{ periodo: string, creadas: number, omitidas: number, sinPlan: number, errores: string[] }>}
 */
export const generarMensualidadesDelMes = async ({ periodo = periodoDe() } = {}) => {
    validarPeriodo(periodo);
    const resultado = { periodo, creadas: 0, omitidas: 0, sinPlan: 0, errores: [] };

    const atletas = await usuarioModel
        .find({ rol: 'Atleta', status: true, estadoSolicitud: 'Aprobada' })
        .select('nombre apellido planAsociado')
        .lean();

    for (const atleta of atletas) {
        if (!atleta.planAsociado) { resultado.sinPlan++; continue; }
        try {
            const r = await asegurarMensualidad(atleta._id, periodo);
            if (r.estado === 'creada') resultado.creadas++;
            else resultado.omitidas++;
            if (r.estado === 'omitida' && r.motivo) resultado.errores.push(`${atleta.nombre} ${atleta.apellido}: ${r.motivo}`);
        } catch (error) {
            console.error('No se pudo generar la mensualidad de', String(atleta._id), error);
            resultado.errores.push(`${atleta.nombre} ${atleta.apellido}: ${error.message}`);
        }
    }

    await marcarVencidas().catch((e) => console.error('[mensualidades] marcarVencidas', e));
    return resultado;
};
