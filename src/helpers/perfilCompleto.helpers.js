// ¿Qué hace "completo" a un perfil? UNA sola definición para el backend (login, renovar-token y el guardia de negocio).
//   · Todos los roles: nombre, apellido, documento, fecha de nacimiento, género y teléfono.
//   · Atleta, además: EPS, certificado de EPS y al menos un contacto de emergencia.
// Devuelve { completo, faltantes: [{ campo, etiqueta }] } (los `campo` coinciden con los del formulario de perfil).
import perfilUsuarioModel from "../models/perfilUsuario.model.js";
import contactoEModel from "../models/contactoEmergencia.model.js";

const vacio = (v) => v === undefined || v === null || String(v).trim() === "";

export const perfilCompleto = async (usuario) => {
    const faltantes = [];
    const falta = (campo, etiqueta) => faltantes.push({ campo, etiqueta });

    if (vacio(usuario?.nombre)) falta("nombre", "Nombre");
    if (vacio(usuario?.apellido)) falta("apellido", "Apellido");

    const perfil = await perfilUsuarioModel.findOne({ perteneceA: usuario._id }).select("numDocumento fechaNacimiento genero telefono eps certificadoEps").lean();
    if (vacio(perfil?.numDocumento)) falta("numDocumento", "Número de documento");
    if (!perfil?.fechaNacimiento) falta("fechaNacimiento", "Fecha de nacimiento");
    if (vacio(perfil?.genero)) falta("genero", "Género");
    if (vacio(perfil?.telefono)) falta("telefono", "Teléfono");

    if (usuario.rol === "Atleta") {
        if (vacio(perfil?.eps)) falta("eps", "EPS");
        if (vacio(perfil?.certificadoEps)) falta("certificadoEps", "Certificado de EPS");
        const contactos = await contactoEModel.countDocuments({ createdBy: usuario._id, status: { $ne: false } });
        if (contactos < 1) falta("contactoEmergencia", "Al menos un contacto de emergencia");
    }
    return { completo: faltantes.length === 0, faltantes };
};

/** Campos que se agregan a las respuestas de login y renovar-token. */
export const estadoDePerfil = async (usuario) => {
    const { completo, faltantes } = await perfilCompleto(usuario);
    return { perfilCompleto: completo, camposFaltantes: faltantes };
};
