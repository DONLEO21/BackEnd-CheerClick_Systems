import fs from "fs";
import path from "path";
import { errorHttp } from "./errores.helpers.js";
import { tamanoLegible } from "./fecha.helpers.js";

// Soportes de justificaciones. Viajan en JSON: archivo = { nombre, contenido } con contenido en base64 (data-URL o solo base64).
// (En este proyecto multer solo se usa para la foto y el certificado del perfil; aquí no hay multipart.)
export const DESTINO_JUSTIFICACIONES = path.join(process.cwd(), 'uploads', 'justificaciones');
export const EXTENSIONES = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
export const MAX_BYTES = 5 * 1024 * 1024;

// Tipo MIME permitido por extensión (si el data-URL trae un tipo, debe coincidir con la extensión)
const MIME_POR_EXTENSION = {
    '.pdf': ['application/pdf'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** Crea las carpetas de archivos si faltan (se llama al arrancar el servidor). */
export const asegurarCarpetasDeArchivos = async () => {
    await fs.promises.mkdir(DESTINO_JUSTIFICACIONES, { recursive: true });
    await fs.promises.mkdir(path.join(process.cwd(), 'uploads', 'fotos'), { recursive: true });
};

// archivo: { nombre: 'soporte.pdf', contenido: 'data:application/pdf;base64,JVBERi0...' }
// Guarda el soporte en /uploads/justificaciones y devuelve sus datos (o null si no hay archivo).
// Errores con mensaje claro: 400 (formato / vacío / datos incompletos) y 413 (más de 5 MB), nunca un 500.
export const guardarArchivoBase64 = async (archivo) => {
    if (!archivo) return null;

    const { nombre, contenido } = archivo;
    if (typeof nombre !== 'string' || typeof contenido !== 'string' || !nombre.trim()) {
        throw errorHttp(400, 'El archivo debe incluir nombre y contenido');
    }

    const extension = path.extname(nombre).toLowerCase();
    if (!EXTENSIONES.includes(extension)) {
        throw errorHttp(400, 'Formato no permitido. Use PDF, JPG, PNG, DOC o DOCX');
    }

    const cabecera = /^data:([^;,]+)[;,]/i.exec(contenido);
    if (cabecera && !MIME_POR_EXTENSION[extension].includes(cabecera[1].toLowerCase())) {
        throw errorHttp(400, `El tipo de archivo (${cabecera[1]}) no corresponde a la extensión ${extension}`);
    }

    const base64 = contenido.includes(',') ? contenido.split(',')[1] : contenido;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw errorHttp(400, 'El archivo está vacío');
    if (buffer.length > MAX_BYTES) throw errorHttp(413, 'El archivo no puede superar los 5 MB');

    await fs.promises.mkdir(DESTINO_JUSTIFICACIONES, { recursive: true });
    const guardado = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    const rutaFisica = path.join(DESTINO_JUSTIFICACIONES, guardado);
    await fs.promises.writeFile(rutaFisica, buffer);

    return {
        ruta: `/uploads/justificaciones/${guardado}`,
        nombre: path.basename(nombre),
        tamano: tamanoLegible(buffer.length),
        rutaFisica,
    };
};

// Si algo falla después de guardar, no deja archivos huérfanos
export const borrarArchivo = (archivo) => {
    if (archivo?.rutaFisica) fs.unlink(archivo.rutaFisica, () => {});
};

/** Ruta física de un soporte a partir de su ruta guardada ('/uploads/justificaciones/x.pdf'); null si no existe. */
export const rutaFisicaDeSoporte = (ruta) => {
    if (typeof ruta !== 'string') return null;
    const nombre = path.basename(ruta);   // basename evita salir de la carpeta (../)
    const fisica = path.join(DESTINO_JUSTIFICACIONES, nombre);
    return fs.existsSync(fisica) ? fisica : null;
};
