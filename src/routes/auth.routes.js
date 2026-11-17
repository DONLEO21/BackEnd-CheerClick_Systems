import { Router } from "express";
import { registrarUsuario, loginUsuario, renovarToken, olvideContrasena, verificarCodigo, restablecerContrasena } from "../controllers/auth.controllers.js";
import { authMiddleware } from "../middlewares/authenticate.middlewares.js";
import { loginLimiter, registerLimiter, forgotLimiter, resetLimiter } from "../middlewares/rateLimit.middlewares.js";

const router = Router();

// 1. Registro público (siempre Atleta, queda pendiente de aprobación)
router.post( '/registro', registerLimiter, registrarUsuario );

// 2. Login de usuarios
router.post( '/login', loginLimiter, loginUsuario );

// 3. Renovación de credenciales (token) -> ya exige token, sin límite
router.get( '/renovar-token', authMiddleware, renovarToken );

// 4. Recuperar contraseña (3 pasos)
router.post( '/olvide-contrasena', forgotLimiter, olvideContrasena );        // Paso 1: enviar código al correo
router.post( '/reenviar-codigo', forgotLimiter, olvideContrasena );          // Reenviar código (misma lógica)
router.post( '/verificar-codigo', resetLimiter, verificarCodigo );           // Paso 2: validar el código
router.post( '/restablecer-contrasena', resetLimiter, restablecerContrasena ); // Paso 3: nueva contraseña

export default router;