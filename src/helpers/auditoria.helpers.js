import AuditoriaModel from "../models/auditoria.model.js";

const comparable = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === undefined || v === null ? null : String(v));

/**
 * Compara dos objetos campo a campo (solo los campos indicados) y devuelve [{ campo, anterior, nuevo }] de lo que cambió.
 * `nuevo` undefined = ese campo no se envió (no cuenta como cambio).
 */
export const diferencias = (antes, despues, campos) =>
    campos
        .filter((c) => despues[c] !== undefined && comparable(despues[c]) !== comparable(antes?.[c]))
        .map((c) => ({ campo: c, anterior: antes?.[c] ?? null, nuevo: despues[c] }));

/** Guarda un registro de auditoría. Nunca rompe la operación principal: si falla, solo lo informa en consola. */
export const registrarAuditoria = async ({ actor, accion, entidadId, cambios = [], detalle = "", entidad = "usuario" }) => {
    try {
        if (cambios.length === 0 && !detalle) return null;
        return await AuditoriaModel.create({ actor: actor._id ?? actor, accion, entidad, entidadId, cambios, detalle });
    } catch (error) {
        console.error("[auditoria] no se pudo registrar", error);
        return null;
    }
};
