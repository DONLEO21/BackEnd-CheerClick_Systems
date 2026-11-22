import PlantillaHorarioModel from "../models/plantilla_horario.model.js";
import { hoyISO } from "./fecha.helpers.js";

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Día de la semana ('Lunes'…) de una fecha 'AAAA-MM-DD' (sin depender del huso horario del servidor). */
export const diaDeLaSemana = (fechaISO) => DIAS[new Date(`${fechaISO}T00:00:00Z`).getUTCDay()];

const restarDias = (fechaISO, n) => {
    const d = new Date(`${fechaISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
};

/**
 * Sesiones (días de entrenamiento) de un nivel, de la más reciente a la más antigua, nunca posteriores a `hasta`
 * (por defecto hoy en America/Bogota). Salen de la plantilla semanal del nivel (plantilla_horario).
 * @returns {Promise<{ sinHorario: boolean, sesiones: { fecha: string, dia: string, horaInicio: string, horaFin: string }[] }>}
 */
export const listarSesionesNivel = async (nivelId, { hasta = hoyISO(), limite = 12, ventanaDias = 90 } = {}) => {
    const plantillas = await PlantillaHorarioModel.find({ nivel: nivelId }).sort({ horaInicio: 1 }).lean();
    if (plantillas.length === 0) return { sinHorario: true, sesiones: [] };

    const sesiones = [];
    for (let i = 0; i <= ventanaDias && sesiones.length < limite; i += 1) {
        const fecha = restarDias(hasta, i);
        const dia = diaDeLaSemana(fecha);
        for (const p of plantillas.filter((x) => x.dia === dia)) {
            sesiones.push({ fecha, dia, horaInicio: p.horaInicio, horaFin: p.horaFin });
        }
    }
    return { sinHorario: false, sesiones: sesiones.slice(0, limite) };
};

/**
 * ¿La fecha es un día de sesión del nivel? Si el nivel no tiene horario cargado no se puede decidir y se acepta
 * (supuesto: solo se exige que no sea futura, lo valida quien llama).
 */
export const esDiaDeSesion = async (nivelId, fechaISO) => {
    const plantillas = await PlantillaHorarioModel.find({ nivel: nivelId }).select('dia').lean();
    if (plantillas.length === 0) return true;
    const dia = diaDeLaSemana(fechaISO);
    return plantillas.some((p) => p.dia === dia);
};
