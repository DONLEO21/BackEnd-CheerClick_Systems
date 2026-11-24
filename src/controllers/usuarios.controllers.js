import { dbCreateUsuario, dbGetUsuario, dbUpdateUsuario, dbFindUserByEmail, dbGenerarCodigo, dbValidarNivelYPlan, REQUISITOS_ROL, PREFIJOS } from "../services/usuarios.services.js";
import { generarPassword } from "../helpers/bcrypt.helpers.js";
import { sendCorreoCambiadoEmail, sendCambioCuentaEmail, sendCuentaCreadaEmail } from "../services/email.services.js";
import { notificar } from "../services/notificaciones.services.js";

const responderError = (res, error, msg) => {
    console.error(error);

    if (error.code === 11000) {
        return res.status(409).json({ errors: { email: 'Este correo ya está registrado' } });
    }
    if (error.name === 'ValidationError') {
        const errors = {};
        for (const field in error.errors) errors[field] = error.errors[field].message;
        return res.status(400).json({ errors });
    }
    if (error.name === 'CastError') {
        return res.status(400).json({ msg: 'El ID no tiene un formato válido' });
    }
    res.status(500).json({ msg });
}

// Nunca devuelve el hash
const sinContrasena = (doc) => {
    const obj = doc.toObject();
    delete obj.contrasena;
    return obj;
}

// Crear ub usuario por el admin
const createUsuario = async (req, res) => {
    try {
        const usuario = req.body;

        // El admin elige el rol, pero debe ser uno válido
        if (usuario.rol && !PREFIJOS[usuario.rol]) {
            return res.status(400).json({ errors: { rol: 'Rol no válido' } });
        }
        usuario.rol = usuario.rol || 'Atleta';

        usuario.createdBy = req.userFound._id;
        usuario.status = true;
        usuario.estadoSolicitud = 'Aprobada';
        delete usuario.codigo;
        delete usuario.resetCodeHash;
        delete usuario.resetCodeExpires;
        delete usuario.resetAttempts;

        if (!usuario.contrasena || usuario.contrasena.length < 8) {
            return res.status(400).json({ errors: { contrasena: 'La contraseña debe tener mínimo 8 caracteres' } });
        }

        // Nivel y plan según el rol (lo que no se exige, si viene, se valida igual)
        const errorsNP = await dbValidarNivelYPlan(usuario, REQUISITOS_ROL[usuario.rol]);
        if (errorsNP) return res.status(400).json({ errors: errorsNP });

        if (usuario.email) usuario.email = String(usuario.email).trim().toLowerCase();

        // Sin filtrar por status: un correo de cuenta inhabilitada sigue ocupado
        if (usuario.email && await dbFindUserByEmail(usuario.email)) {
            return res.status(409).json({ errors: { email: 'Este correo ya está registrado' } });
        }

        // Se guarda en texto plano solo por envio al correo; en la BD queda encriptada
        const contrasenaTemporal = usuario.contrasena;

        usuario.contrasena = generarPassword(usuario.contrasena);
        usuario.codigo = await dbGenerarCodigo(usuario.rol);
        // La contraseña la eligió el admin, asi que el usuario debe cambiarla al ingresar
        usuario.debeCambiarContrasena = true;
        usuario.debeCompletarPerfil = true;

        const nuevo = await dbCreateUsuario(usuario);

        // Si el correo falla, la cuenta igual queda creada
        let correoEnviado = true;
        try {
            await sendCuentaCreadaEmail(nuevo.email, nuevo.nombre, nuevo.rol, contrasenaTemporal);
        } catch (error) {
            console.error(error);
            correoEnviado = false;
        }

        res.status(201).json({ msg: 'Registra usuario', correoEnviado, data: sinContrasena(nuevo) });
    }
    catch (error) {
        responderError(res, error, 'Error al registrar usuario');
    }
}

// actualizar un usuario por el admin
const updateUsuario = async (req, res) => {
    try {
        const id = req.params.id;
        const inputData = req.body;

        const actual = await dbGetUsuario(id);
        if (!actual) {
            return res.status(404).json({ msg: 'Usuario no encontrado' });
        }

        // Campos que nunca se cambian desde aquí
        delete inputData.contrasena;
        delete inputData.createdBy;
        delete inputData.resetCodeHash;
        delete inputData.resetCodeExpires;
        delete inputData.resetAttempts;
        delete inputData.codigo;
        delete inputData.estadoSolicitud;
        delete inputData.rol;
        delete inputData.status;
        delete inputData.debeCambiarContrasena;
        delete inputData.debeCompletarPerfil;

        // Correo: en minúscula y sin repetir
        if (inputData.email) {
            inputData.email = String(inputData.email).trim().toLowerCase();

            if (inputData.email !== actual.email) {
                const existente = await dbFindUserByEmail(inputData.email);
                if (existente && String(existente._id) !== String(id)) {
                    return res.status(409).json({ errors: { email: 'Este correo ya está registrado' } });
                }
            }
        }

        // Si el admin cambia nivel o plan, se validan igual
        if (inputData.nivel !== undefined || inputData.planAsociado !== undefined) {
            const errorsNP = await dbValidarNivelYPlan(
                { nivel: inputData.nivel ?? actual.nivel, planAsociado: inputData.planAsociado ?? actual.planAsociado },
                REQUISITOS_ROL[actual.rol]
            );
            if (errorsNP) return res.status(400).json({ errors: errorsNP });
        }

        const data = await dbUpdateUsuario(id, inputData);

        const correoCambio = inputData.email && inputData.email !== actual.email;

        // Avisar al correo anterior (si falla, el cambio igual queda guardado)
        if (correoCambio) {
            try {
                await sendCorreoCambiadoEmail(actual.email, actual.nombre, inputData.email);
            } catch (error) {
                console.error(error);
            }
            await notificar(id, 'seguridad', 'El correo de tu cuenta fue cambiado');
        }

        // El usuario se entera de los demás cambios hechos por el administrador
        const campos = Object.keys(inputData).filter(c => c !== 'email').join(', ');
        if (campos) {
            const mensaje = `El administrador actualizó tus datos: ${campos}`;
            await notificar(id, 'perfil', mensaje);

            if (actual.preferencias?.correos !== false) {
                try {
                    await sendCambioCuentaEmail(correoCambio ? inputData.email : actual.email, actual.nombre, `${mensaje}.`);
                } catch (error) {
                    console.error(error);
                }
            }
        }

        res.json({ msg: 'Usuario actualizado', data: sinContrasena(data) });
    }
    catch (error) {
        responderError(res, error, 'No se ha podido actualizar el usuario');
    }
}

export { createUsuario, updateUsuario }