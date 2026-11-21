import contadorModel from "../models/contador.model.js";

/**
 * Código visible consecutivo: prefijo + número de 3 dígitos con ceros a la izquierda (IM001, PG002, HA003…).
 * Si se superan 999 el número sigue creciendo sin romperse (IM1000, IM1001…).
 */
export const formatearCodigo = (prefijo, numero) => `${prefijo}${String(numero).padStart(3, '0')}`;

/**
 * Siguiente código de un prefijo. El incremento es ATÓMICO (findOneAndUpdate + $inc sobre la colección "contadors"),
 * así que dos creaciones simultáneas nunca repiten número. Los códigos no se reutilizan: el contador solo sube,
 * aunque el registro se elimine o se deshabilite.
 */
export const siguienteCodigo = async (prefijo) => {
    const contador = await contadorModel.findOneAndUpdate(
        { _id: prefijo },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return formatearCodigo(prefijo, contador.seq);
};

/** Deja el contador al menos en `minimo` (para la migración: nunca baja un contador que ya está más adelante). */
export const asegurarContador = async (prefijo, minimo) => {
    await contadorModel.updateOne({ _id: prefijo }, { $max: { seq: minimo } }, { upsert: true });
};

/**
 * Plugin de Mongoose: agrega el campo `codigo` (único, indexado, inmutable) y lo asigna solo al crear el documento.
 *   esquema.plugin(pluginCodigo, 'IM')
 * "sparse": los documentos anteriores a este cambio no lo tienen hasta ejecutar scripts/migrar-codigos.js.
 */
export const pluginCodigo = (esquema, prefijo) => {
    esquema.add({
        codigo: { type: String, unique: true, sparse: true, immutable: true, trim: true, index: true },
    });
    // pre('save') (y no 'validate'): el número se consume solo cuando el documento ya pasó la validación,
    // así un intento fallido (campo obligatorio vacío…) no deja huecos en la secuencia.
    esquema.pre('save', async function () {
        if (this.isNew && !this.codigo) this.codigo = await siguienteCodigo(prefijo);
    });
};
