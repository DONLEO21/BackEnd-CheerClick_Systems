import AsistenciaModel from "../models/asistencia.model.js";

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
