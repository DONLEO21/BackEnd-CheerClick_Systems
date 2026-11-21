import MensualidadModel from "../models/mensualidades.model.js";
import PagosModel from "../models/pagos.model.js";
import PlanAsociadoModel from "../models/planAsociado.model.js";
import usuarioModel from "../models/usuarios.model.js";
import { notificar } from "./notificaciones.services.js";

// ── Configuración (variables de entorno, todas opcionales) ──
//   MENSUALIDADES_TZ              zona horaria que define "el mes actual"        (America/Bogota)
//   MENSUALIDAD_DIA_VENCIMIENTO   día del mes en que vence la mensualidad (1-28) (10)
export const ZONA_HORARIA = () => process.env.MENSUALIDADES_TZ || 'America/Bogota';
const diaVencimiento = () => Math.min(28, Math.max(1, Number(process.env.MENSUALIDAD_DIA_VENCIMIENTO) || 10));

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

/**
 * Genera la mensualidad del mes para cada atleta ACTIVO y aprobado que tenga plan asignado.
 *
 * Idempotente: no duplica si ya existe la mensualidad de ese atleta y periodo (verificación previa + índice
 * único usuario/periodo). Se puede ejecutar varias veces (cron, arranque del servidor, botón manual).
 *
 * @param {{ periodo?: string }} [opciones] periodo 'AAAA-MM' (por defecto, el mes actual en la zona configurada)
 * @returns {Promise<{ periodo: string, creadas: number, omitidas: number, sinPlan: number, errores: string[] }>}
 */
export const generarMensualidadesDelMes = async ({ periodo = periodoDe() } = {}) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw Object.assign(new Error('El periodo debe tener formato AAAA-MM'), { status: 400 });

    const resultado = { periodo, creadas: 0, omitidas: 0, sinPlan: 0, errores: [] };

    const atletas = await usuarioModel
        .find({ rol: 'Atleta', status: true, estadoSolicitud: 'Aprobada' })
        .select('nombre apellido codigo planAsociado')
        .lean();

    const conPlan = atletas.filter((a) => a.planAsociado);
    resultado.sinPlan = atletas.length - conPlan.length;
    if (conPlan.length === 0) return resultado;

    // El plan de un atleta se respeta aunque el administrador lo haya deshabilitado para nuevos registros
    const planes = await PlanAsociadoModel.find({ _id: { $in: [...new Set(conPlan.map((a) => String(a.planAsociado)))] } }).lean();
    const planPorId = new Map(planes.map((p) => [String(p._id), p]));

    const yaTienen = new Set(
        (await MensualidadModel.find({ periodo, usuario: { $in: conPlan.map((a) => a._id) } }).select('usuario').lean())
            .map((m) => String(m.usuario))
    );

    const fechaGeneracion = aFecha(periodo, 1);
    const fechaVencimiento = aFecha(periodo, diaVencimiento());

    for (const atleta of conPlan) {
        if (yaTienen.has(String(atleta._id))) { resultado.omitidas++; continue; }

        const plan = planPorId.get(String(atleta.planAsociado));
        if (!plan) { resultado.errores.push(`${atleta.nombre} ${atleta.apellido}: el plan asignado no existe`); continue; }

        let pago = null;
        try {
            pago = await PagosModel.create({
                estado: 'Pendiente',
                valorTotal: plan.valor,
                fechaGenera: fechaGeneracion,
                usuario: atleta._id,
            });

            await MensualidadModel.create({
                periodo,
                fechaGeneracion,
                fechaVencimiento,
                valor: plan.valor,
                numReferencia: `MS-${atleta.codigo ?? String(atleta._id).slice(-5).toUpperCase()}-${periodo.replace('-', '')}`,
                planAsociado: plan._id,
                pago: pago._id,
                usuario: atleta._id,
            });
            resultado.creadas++;

            await notificar(
                atleta._id,
                'pago',
                `Tu mensualidad de ${mesLegible(periodo)} ya está disponible. Valor: ${dinero(plan.valor)}`,
                { titulo: 'Nueva mensualidad', enlace: '/atleta/pagos' }
            );
        } catch (error) {
            // El pago huérfano se elimina para no dejar basura si la mensualidad no se pudo crear
            if (pago) await PagosModel.deleteOne({ _id: pago._id }).catch(() => {});
            if (error.code === 11000) { resultado.omitidas++; continue; }   // otra ejecución ya la creó
            console.error('No se pudo generar la mensualidad de', String(atleta._id), error);
            resultado.errores.push(`${atleta.nombre} ${atleta.apellido}: ${error.message}`);
        }
    }

    return resultado;
};
