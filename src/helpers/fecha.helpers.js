export const esFechaISO = (f) =>
    typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));

// Fecha de hoy en Colombia (evita que un servidor en UTC cambie el día)
export const hoyISO = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

// 'YYYY-MM-DD' -> Date a mediodía de Colombia (no se corre de día)
export const fechaADate = (iso) => new Date(`${iso}T12:00:00-05:00`);

/**
 * Edad en años cumplidos. `nacimiento` es la fecha guardada en el perfil (Date a medianoche UTC del día de nacimiento,
 * por eso se leen sus partes en UTC) y se compara con el día de HOY en Colombia (America/Bogota), para que ni el
 * huso horario del servidor ni el del navegador adelanten o atrasen el cumpleaños. Devuelve null si no hay fecha válida.
 */
export const calcularEdad = (nacimiento, hoy = hoyISO()) => {
    if (!nacimiento) return null;
    const n = new Date(nacimiento);
    if (Number.isNaN(n.getTime())) return null;
    const [anio, mes, dia] = hoy.split('-').map(Number);
    let edad = anio - n.getUTCFullYear();
    if (mes < n.getUTCMonth() + 1 || (mes === n.getUTCMonth() + 1 && dia < n.getUTCDate())) edad -= 1;
    return edad >= 0 && edad < 120 ? edad : null;
};

export const tamanoLegible = (bytes) =>
    bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Edad mínima por rol: administrador y entrenador, mayores de edad; atleta, al menos 5 años. */
export const EDAD_MINIMA_POR_ROL = { Administrador: 18, Entrenador: 18, Atleta: 5 };

/**
 * Valida una fecha de nacimiento para el rol dado. Devuelve el mensaje de error o '' si es válida.
 *  - no puede ser futura ni inválida (ni de hace más de 120 años)
 *  - Administrador y Entrenador >= 18 años; Atleta >= 5 años
 * La edad se calcula contra el día de HOY en America/Bogota (igual que el resto del sistema).
 */
export const validarFechaNacimiento = (valor, rol, hoy = hoyISO()) => {
    const n = new Date(valor);
    if (Number.isNaN(n.getTime())) return 'La fecha de nacimiento no es válida';
    if (n.toISOString().slice(0, 10) > hoy) return 'La fecha de nacimiento no puede ser futura';
    const [anio, mes, dia] = hoy.split('-').map(Number);
    let edad = anio - n.getUTCFullYear();
    if (mes < n.getUTCMonth() + 1 || (mes === n.getUTCMonth() + 1 && dia < n.getUTCDate())) edad -= 1;
    if (edad > 120) return 'La fecha de nacimiento no es válida';
    const minima = EDAD_MINIMA_POR_ROL[rol];
    if (minima && edad < minima) {
        return rol === 'Atleta'
            ? `El atleta debe tener al menos ${minima} años`
            : `El ${rol === 'Entrenador' ? 'entrenador' : 'administrador'} debe ser mayor de edad (mínimo ${minima} años)`;
    }
    return '';
};
