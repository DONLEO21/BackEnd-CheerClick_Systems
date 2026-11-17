import { rateLimit } from 'express-rate-limit';

// Fábrica: evita repetir la configuración en cada limitador
const crearLimiter = ( minutos, limite, msg ) => rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: limite,
    standardHeaders: 'draft-7',   // informa al cliente cuánto falta
    legacyHeaders: false,
    message: { msg }
});

// Login: solo cuentan los intentos fallidos, así un usuario que entra bien no gasta
const loginLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { msg: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 30 minutos' }
});

// Registro de usuarios
const registerLimiter = crearLimiter( 60, 10, 'Demasiados registros desde esta red. Intenta más tarde' );

// Pedir código (olvidé contraseña y reenviar código): cada petición envía un correo
const forgotLimiter = crearLimiter( 15, 5, 'Demasiadas solicitudes de código. Intenta de nuevo en 15 minutos' );

// Verificar código y cambiar contraseña
const resetLimiter = crearLimiter( 15, 10, 'Demasiados intentos. Intenta de nuevo en 15 minutos' );

export {
    loginLimiter,
    registerLimiter,
    forgotLimiter,
    resetLimiter
}