import crypto from "node:crypto";
import { verifyPassword, generarPassword } from "../helpers/bcrypt.helpers.js";
import { dbGetUserByEmail, dbGetUserForReset, dbUpdateUsuario, dbCreateUsuario, dbFindUserByEmail, dbValidarNivelYPlan } from "../services/usuarios.services.js";
import { generateToken } from "../helpers/jwt.helpers.js";
import { rolesDe } from "../helpers/roles.helpers.js";
import { EMAIL_REGEX } from "../helpers/validacionesUsuario.helpers.js";
import { sendResetCodeEmail, sendContrasenaCambiadaEmail } from "../services/email.services.js";
import { notificar } from "../services/notificaciones.services.js";
import usuarioModel from "../models/usuarios.model.js";
import { estadoDePerfil } from "../helpers/perfilCompleto.helpers.js";

// Registro público
const registrarUsuario = async (req, res) => {
  try {
    // Se toman estos campos; todo lo demás del body se ignora
    const { nombre, apellido, contrasena, nivel, planAsociado } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    const errors = {};

    if (!nombre?.trim()) errors.nombre = 'El nombre es obligatorio';
    if (!apellido?.trim()) errors.apellido = 'El apellido es obligatorio';
    if (!email) errors.email = 'El correo es obligatorio';
    else if (!EMAIL_REGEX.test(email)) errors.email = 'El correo no es válido';

    if (!contrasena || contrasena.length < 8) {
      errors.contrasena = 'La contraseña debe tener mínimo 8 caracteres';
    }

    // Nivel y plan: obligatorios, existentes y activos
    Object.assign(errors, await dbValidarNivelYPlan({ nivel, planAsociado }) ?? {});

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    if (await dbFindUserByEmail(email)) {
      return res.status(409).json({
        errors: { email: 'Este correo ya está registrado' }
      });
    }

    const nuevo = await dbCreateUsuario({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email,
      contrasena: generarPassword(contrasena),
      nivel,
      planAsociado,
      rol: 'Atleta',
      estadoSolicitud: 'Pendiente',
      status: true
    });

    // Sin token: no puede ingresar hasta que el admin apruebe
    res.status(201).json({
      msg: 'Solicitud registrada. Un administrador validará tu cuenta',
      data: {
        _id: nuevo._id,
        nombre: nuevo.nombre,
        apellido: nuevo.apellido,
        email: nuevo.email
      }
    });

  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res.status(409).json({
        errors: { email: 'Este correo ya está registrado' }
      });
    }

    if (error.name === 'ValidationError') {
      const errors = {};
      for (const field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      return res.status(400).json({ errors });
    }

    res.status(500).json({ msg: 'No se pudo registrar la solicitud' });
  }
};

const loginUsuario = async (req, res) => {
  try {
    // Paso 1: Obtener las credenciales del usuario
    const inputData = req.body;

    if (!inputData.email) {
      return res.status(400).json({
        msg: "Olvido pasar el correo en el campo correo electrónico",
      });
    }

    if (!inputData.contrasena) {
      return res.status(400).json({
        msg: "Olvido pasar la contraseña en el campo contraseña",
      });
    }

    // Paso 2: Verificar si usuario existe, si el email esta registrado en la BD
    const userFound = await dbFindUserByEmail( inputData.email );

    if (!userFound) {
      return res.status(404).json({
        msg: "El usuario no existe. Por favor registrese",
      });
    }

    // Paso 3: Verificar si la contraseña es valida
    const isvalid = verifyPassword(inputData.contrasena, userFound.contrasena);
    if (!isvalid) {
      return res.status(401).json({ msg: "Contraseña incorrecta" });
    }

    // Paso 3.1: Verificar el estado de la cuenta (después de la contraseña, para no revelarlo a extraños)
    if( userFound.estadoSolicitud === 'Pendiente' ) {
      return res.status(403).json({ msg: 'Tu cuenta está pendiente de validación por el administrador' });
    }

    if( userFound.estadoSolicitud === 'Rechazada' ) {
      return res.status(403).json({ msg: 'Tu solicitud fue rechazada. Contacta al club.' });
    }

    if( ! userFound.status ) {
      return res.status(403).json({ msg: 'Tu cuenta está desactivada. Contacta al club.' });
    }

    // Paso 4: Generar el Token (Tarjeta que presento que Autentica y Autoriza)
    const payload = {
      _id: userFound._id,
      nombre: userFound.nombre,
      apellido: userFound.apellido,
      email: userFound.email,
      rol: userFound.rol,
      roles: rolesDe(userFound),
      status: userFound.status,
    };
    const token = generateToken(payload);

    // Paso 5: Responder al cliente (Enviar el Token, IMPORTANTE: No devolver el password)
    const jsonObj = userFound.toObject();
    delete jsonObj.contrasena;

    res.json({
      msg: "Login de usuario",
      token: token,
      data: { ...jsonObj, ...(await estadoDePerfil(userFound)) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "No se pudo autenticar el usuario" });
  }
};

const renovarToken = async (req, res) => {
  try {
    const userFound = req.userFound;

    const newPayload = {
      _id: userFound._id,
      nombre: userFound.nombre,
      apellido: userFound.apellido,
      email: userFound.email,
      rol: userFound.rol,
      roles: rolesDe(userFound),
      status: userFound.status,
    };
    const newToken = generateToken(newPayload);

    // Eliminar las propiedades sensibles del objeto retornado al usuario
    const jsOb = userFound.toObject();
    delete jsOb.contrasena;

    res.json({
      msg: "Autenticidad de Token verficada con exito",
      token: newToken,
      data: { ...jsOb, ...(await estadoDePerfil(userFound)) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "No se pudo autenticar el usuario" });
  }
};

// ---------- Recuperar contraseña ----------
const RESET_TTL_MIN = Number(process.env.RESET_CODE_TTL_MIN) || 10;
const MAX_ATTEMPTS = 5;

// Revisa el código ingresado
const checkResetCode = async (email, code) => {
  const user = await dbGetUserForReset(email);

  // No hay código pendiente o ya venció
  if (!user || !user.resetCodeHash || user.resetCodeExpires < new Date()) {
    return { status: 400, msg: "El código expiró. Solicita uno nuevo" };
  }

  // Demasiados intentos fallidos: hay que pedir otro código
  if (user.resetAttempts >= MAX_ATTEMPTS) {
    return {
      status: 429,
      msg: "Demasiados intentos. Solicita un código nuevo",
    };
  }

  // El código no coincide: se cuenta el intento
  if (!verifyPassword(code, user.resetCodeHash)) {
    await dbUpdateUsuario(user._id, { $inc: { resetAttempts: 1 } });
    return { status: 400, msg: "¡Código incorrecto!" };
  }

  return { user };
};

// Paso 1 y "Reenviar código": genera un código nuevo e invalida el anterior
const olvideContrasena = async (req, res) => {
  try {
    // Paso 1: Obtener el correo
    const email = req.body.email?.trim().toLowerCase();

    if (!email) {
      return res
        .status(400)
        .json({ msg: "Olvidó pasar el correo en el campo correo electrónico" });
    }

    // Paso 2: Verificar que el correo esté registrado en la BD
    const userFound = await dbGetUserByEmail(email);

    if (!userFound || userFound.estadoSolicitud !== 'Aprobada') {
      return res
        .status(404)
        .json({ msg: "El usuario no existe. Por favor registrese" });
    }

    // Paso 3: Generar el código de 6 dígitos y guardarlo ENCRIPTADO con su vencimiento
    const code = String(crypto.randomInt(100000, 1000000));

    await dbUpdateUsuario(userFound._id, {
      resetCodeHash: generarPassword(code),
      resetCodeExpires: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
      resetAttempts: 0,
    });

    // Paso 4: Enviar el código al correo
    await sendResetCodeEmail(
      userFound.email,
      userFound.nombre,
      code,
      RESET_TTL_MIN,
    );

    res.json({ msg: `Código enviado a ${userFound.email}` });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ msg: "No se pudo enviar el código. Intenta de nuevo" });
  }
};

// Paso 2: Verificar el código (solo comprueba, no lo gasta)
const verificarCodigo = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const code = String(req.body.code ?? "").trim();

    if (!email || !code) {
      return res
        .status(400)
        .json({ msg: "Se olvido pasar el correo o el código" });
    }

    const result = await checkResetCode(email, code);

    if (!result.user) {
      return res.status(result.status).json({ msg: result.msg });
    }

    res.json({ msg: "¡Código correcto!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "No se pudo verificar el código" });
  }
};

// Paso 3: Guardar la nueva contraseña
const restablecerContrasena = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const code = String(req.body.code ?? "").trim();
    const { contrasena, confirmarContrasena } = req.body;

    // Validar las contraseñas antes de tocar el código
    if (!contrasena || contrasena.length < 8) {
      return res
        .status(400)
        .json({ msg: "La contraseña debe tener mínimo 8 caracteres" });
    }

    if (contrasena !== confirmarContrasena) {
      return res.status(400).json({ msg: "Las contraseñas no coinciden." });
    }

    // Volver a comprobar el código: así nadie cambia contraseñas sin haberlo recibido
    const result = await checkResetCode(email, code);

    if (!result.user) {
      return res.status(result.status).json({ msg: result.msg });
    }

    // Guardar la nueva contraseña encriptada y borrar el código para que no se reutilice
    await dbUpdateUsuario(result.user._id, {
      $set: { contrasena: generarPassword(contrasena), resetAttempts: 0, debeCambiarClave: false, claveCambiadaEn: new Date() },
      $unset: { resetCodeHash: 1, resetCodeExpires: 1 },
    });

    // Aviso de seguridad: siempre por correo, sin importar las preferencias
    try {
      await sendContrasenaCambiadaEmail(result.user.email, result.user.nombre);
    } catch (error) {
      console.error(error);
    }
    await notificar(result.user._id, 'seguridad', 'Tu contraseña fue cambiada');

    res.json({ msg: "¡Contraseña actualizada!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "No se pudo actualizar la contraseña" });
  }
};

// PATCH /api/auth/cambiar-contrasena { actual, nueva, confirmar }
// Política: mínimo 8 caracteres (la misma del registro) y distinta de la actual. Al cambiarla se quita la marca de contraseña
// temporal, se invalidan los tokens anteriores y se entrega uno nuevo para seguir en esta sesión.
const cambiarContrasena = async (req, res) => {
  try {
    const { actual, nueva, confirmar } = req.body ?? {};
    const errors = {};
    if (!actual) errors.actual = "Escribe tu contraseña actual";
    if (!nueva || String(nueva).length < 8) errors.nueva = "La contraseña debe tener mínimo 8 caracteres";
    else if (actual && nueva === actual) errors.nueva = "La contraseña nueva debe ser distinta de la actual";
    if (nueva && confirmar !== nueva) errors.confirmar = "Las contraseñas no coinciden";
    if (Object.keys(errors).length) return res.status(400).json({ success: false, msg: Object.values(errors)[0], errors });

    const usuario = await usuarioModel.findById(req.userFound._id);
    if (!verifyPassword(actual, usuario.contrasena)) {
      return res.status(400).json({ success: false, msg: "La contraseña actual no es correcta", errors: { actual: "La contraseña actual no es correcta" } });
    }

    usuario.contrasena = generarPassword(nueva);
    usuario.debeCambiarClave = false;
    usuario.claveCambiadaEn = new Date();
    await usuario.save({ validateModifiedOnly: true });

    try { await sendContrasenaCambiadaEmail(usuario.email, usuario.nombre); } catch (error) { console.error(error); }
    await notificar(usuario._id, "seguridad", "Tu contraseña fue cambiada");

    const token = generateToken({ _id: usuario._id, nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, rol: usuario.rol, roles: rolesDe(usuario), status: usuario.status });
    const jsonObj = usuario.toObject();
    delete jsonObj.contrasena;
    res.json({ msg: "Contraseña actualizada", token, data: { ...jsonObj, ...(await estadoDePerfil(usuario)) } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "No se pudo cambiar la contraseña" });
  }
};

export {
  registrarUsuario, loginUsuario, renovarToken, cambiarContrasena,
  olvideContrasena, verificarCodigo, restablecerContrasena,
};