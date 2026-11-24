import perfilUsuarioModel from "../models/perfilUsuario.model.js";
import contactoEModel from "../models/contactoEmergencia.model.js";
import { validarFechaNacimiento } from "./fecha.helpers.js";

// Validadores COMPARTIDOS por el registro público, la creación de cuentas y la edición del administrador.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TELEFONO_REGEX = /^[0-9+\s()-]{7,15}$/;
export const DOCUMENTO_REGEX = /^[A-Za-z0-9-]{5,20}$/;

export const TIPOS_DOCUMENTO = perfilUsuarioModel.schema.path('tipoDocumento').enumValues;
export const GENEROS = perfilUsuarioModel.schema.path('genero').enumValues;
export const EPS = perfilUsuarioModel.schema.path('eps').enumValues;
export const PARENTESCOS = contactoEModel.schema.path('parentesco').enumValues;

/** Nombre, apellido y correo (los campos básicos de cualquier cuenta). `parcial`: solo valida lo que se envió. */
export const validarDatosBasicos = ({ nombre, apellido, email }, { parcial = false } = {}) => {
    const errors = {};
    const revisar = (campo, valor, etiqueta) => {
        if (parcial && valor === undefined) return;
        if (!String(valor ?? '').trim()) errors[campo] = `${etiqueta} es obligatorio`;
    };
    revisar('nombre', nombre, 'El nombre');
    revisar('apellido', apellido, 'El apellido');
    if (!(parcial && email === undefined)) {
        if (!String(email ?? '').trim()) errors.email = 'El correo es obligatorio';
        else if (!EMAIL_REGEX.test(String(email).trim())) errors.email = 'El correo no es válido';
    }
    return errors;
};

/** Datos del perfil enviados (solo lo que viene). `rol` define la edad mínima (administrador y entrenador ≥ 18; atleta ≥ 5). */
export const validarDatosPerfil = (c, rol) => {
    const errors = {};
    if (c.tipoDocumento !== undefined && !TIPOS_DOCUMENTO.includes(c.tipoDocumento)) errors.tipoDocumento = 'El tipo de documento no es válido';
    if (c.numDocumento !== undefined && !DOCUMENTO_REGEX.test(String(c.numDocumento).trim())) errors.numDocumento = 'El número de documento no es válido (5 a 20 letras o números)';
    if (c.genero !== undefined && !GENEROS.includes(c.genero)) errors.genero = 'El género no es válido';
    if (c.genero === 'Otro' && c.generoOtro !== undefined && !String(c.generoOtro ?? '').trim()) errors.generoOtro = 'Indica el género';
    if (c.telefono !== undefined && !TELEFONO_REGEX.test(String(c.telefono).trim())) errors.telefono = 'El teléfono no es válido (7 a 15 dígitos)';
    if (c.eps !== undefined && !EPS.includes(c.eps)) errors.eps = 'La EPS no es válida';
    if (c.eps === 'Otra' && c.epsOtra !== undefined && !String(c.epsOtra ?? '').trim()) errors.epsOtra = 'Indica la EPS';
    if (c.fechaNacimiento !== undefined) {
        const mensaje = validarFechaNacimiento(c.fechaNacimiento, rol);
        if (mensaje) errors.fechaNacimiento = mensaje;
    }
    return errors;
};

// Valores de parentesco antiguos o escritos distinto (p. ej. «Madre / Padre» del formulario viejo) -> valor del catálogo.
// Un valor desconocido se devuelve igual (y la validación lo rechaza con un mensaje claro).
const PARENTESCO_HEREDADO = {
    'madre / padre': 'Madre', 'madre/padre': 'Madre', 'madre-padre': 'Madre', 'madre o padre': 'Madre',
    'conyuge': 'Cónyuge', 'cónyuge / pareja': 'Cónyuge', 'conyuge / pareja': 'Cónyuge', 'conyuge-pareja': 'Cónyuge', 'pareja': 'Cónyuge',
    'madre': 'Madre', 'padre': 'Padre', 'tutor': 'Tutor', 'otro': 'Otro',
};
export const normalizarParentesco = (valor) => {
    if (valor === undefined || valor === null) return valor;
    return PARENTESCO_HEREDADO[String(valor).trim().toLowerCase()] ?? valor;
};

/** Contacto PARCIAL (edición): valida únicamente los campos que se enviaron. */
export const validarContactoParcial = (c) => {
    const errors = {};
    if (c.nombre !== undefined && !String(c.nombre ?? '').trim()) errors.nombre = 'El nombre del contacto es obligatorio';
    if (c.apellido !== undefined && !String(c.apellido ?? '').trim()) errors.apellido = 'El apellido del contacto es obligatorio';
    if (c.telefono !== undefined && !TELEFONO_REGEX.test(String(c.telefono ?? '').trim())) errors.telefono = 'El teléfono del contacto no es válido (7 a 15 dígitos)';
    if (c.parentesco !== undefined && !PARENTESCOS.includes(c.parentesco)) errors.parentesco = `El parentesco «${c.parentesco}» no es válido`;
    if (c.parentesco === 'Otro' && c.parentescoOtro !== undefined && !String(c.parentescoOtro ?? '').trim()) errors.parentescoOtro = 'Indica el parentesco';
    return errors;
};

/** Un contacto de emergencia (nombre, apellido, teléfono y parentesco válido). */
export const validarContacto = (c) => {
    const errors = {};
    if (!String(c.nombre ?? '').trim()) errors.nombre = 'El nombre del contacto es obligatorio';
    if (!String(c.apellido ?? '').trim()) errors.apellido = 'El apellido del contacto es obligatorio';
    if (!TELEFONO_REGEX.test(String(c.telefono ?? '').trim())) errors.telefono = 'El teléfono del contacto no es válido (7 a 15 dígitos)';
    if (c.parentesco !== undefined && !PARENTESCOS.includes(c.parentesco)) errors.parentesco = 'El parentesco no es válido';
    if (c.parentesco === 'Otro' && !String(c.parentescoOtro ?? '').trim()) errors.parentescoOtro = 'Indica el parentesco';
    return errors;
};
