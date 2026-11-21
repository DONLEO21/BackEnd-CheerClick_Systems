import cron from "node-cron";
import { generarMensualidadesDelMes, ZONA_HORARIA } from "../services/generacionMensualidades.services.js";

// Programación de la generación automática de mensualidades.
//   MENSUALIDADES_CRON   expresión cron (por defecto "5 0 1 * *" = día 1 de cada mes a las 00:05)
//   MENSUALIDADES_TZ     zona horaria (por defecto America/Bogota)
//   MENSUALIDADES_AUTO   "false" desactiva el job y la recuperación al arrancar (útil en pruebas)
const EXPRESION = () => process.env.MENSUALIDADES_CRON || '5 0 1 * *';

const ejecutar = async (origen) => {
    try {
        const r = await generarMensualidadesDelMes();
        console.log(`[mensualidades] (${origen}) periodo ${r.periodo}: ${r.creadas} creadas, ${r.omitidas} ya existían, ${r.sinPlan} atletas sin plan, ${r.errores.length} errores`);
        r.errores.forEach((e) => console.error('[mensualidades]', e));
    } catch (error) {
        console.error(`[mensualidades] (${origen}) no se pudo generar`, error);
    }
};

/**
 * Registra el cron mensual y, al arrancar, genera el mes actual si faltó (por si el servidor estuvo
 * apagado el día 1). La generación es idempotente, así que repetirla no duplica nada.
 */
export const iniciarJobMensualidades = () => {
    if (process.env.MENSUALIDADES_AUTO === 'false') {
        console.log('[mensualidades] generación automática desactivada (MENSUALIDADES_AUTO=false)');
        return null;
    }
    if (!cron.validate(EXPRESION())) {
        console.error(`[mensualidades] expresión cron inválida: ${EXPRESION()}`);
        return null;
    }

    const tarea = cron.schedule(EXPRESION(), () => ejecutar('cron'), { timezone: ZONA_HORARIA() });
    console.log(`[mensualidades] programada "${EXPRESION()}" (${ZONA_HORARIA()})`);

    ejecutar('arranque');   // recuperación
    return tarea;
};
