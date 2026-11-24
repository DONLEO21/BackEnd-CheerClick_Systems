import { tieneRol } from '../helpers/roles.helpers.js';
import { validateToken } from "../helpers/jwt.helpers.js";
import { dbGetUsuario } from "../services/usuarios.services.js";
import { perfilCompleto } from "../helpers/perfilCompleto.helpers.js";

// GUARDIA 1 — contraseña temporal: mientras `debeCambiarClave` sea true, TODA ruta autenticada responde 403
// CAMBIO_CLAVE_REQUERIDO salvo estas dos ("me" = renovar-token, y cambiar la contraseña). Cerrar sesión no llama al backend.
const RUTAS_CON_CLAVE_PENDIENTE = ['/api/auth/renovar-token', '/api/auth/cambiar-contrasena'];

// GUARDIA 2 — perfil incompleto (solo atleta): bloquea las ACCIONES de negocio (no las consultas) de pagos, pedidos de
// implementos, justificaciones e inscripciones. Siempre permitidos: perfil, contacto de emergencia, contraseña y "me".
// Se activa con PERFIL_OBLIGATORIO=true (así el club decide cuándo exigirlo a los atletas que ya existen).
const PREFIJOS_DE_NEGOCIO = ['/api/pagos', '/api/mensualidades', '/api/solicitud', '/api/justificacion', '/api/inscripciones_competencias'];
const perfilObligatorio = () => String(process.env.PERFIL_OBLIGATORIO ?? '').toLowerCase() === 'true';

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('X-Token');

        if ( ! token ) {
            return res.status(401).json({msg: 'Cadena de token vacia'});
        }

        // Divide la cadena en partes usando el (.) punto como referencia
        const tokenParts = token.split('.');

        // Un token valido tiene 3 partes separadas por puntos
        if (tokenParts.length !== 3) {
            return res.status(401).json({msg: 'EL formato del token no es valido'});
        }

        const payload = validateToken(token);

        if ( ! payload) {
            return res.status(401).json({msg: 'Token invalido o inactivo'});
        }

        // Se busca por _id: el correo puede cambiar, el _id nunca
        const userFound = await dbGetUsuario( payload._id );

        if ( ! userFound || ! userFound.status ) {
            return res.status(401).json({msg: 'El usuario no esta activo o el usuario no esta registrado en el sistema'});
        }

        // Un cambio de contraseña invalida los tokens anteriores (si alguien la robó, su sesión deja de valer)
        if ( userFound.claveCambiadaEn && payload.iat * 1000 < Math.floor( userFound.claveCambiadaEn.getTime() / 1000 ) * 1000 ) {
            return res.status(401).json({msg: 'Tu contraseña cambió: inicia sesión de nuevo', code: 'SESION_CADUCADA'});
        }

        const ruta = req.originalUrl.split('?')[0].replace(/\/+$/, '');
        if ( userFound.debeCambiarClave && ! RUTAS_CON_CLAVE_PENDIENTE.includes( ruta ) ) {
            return res.status(403).json({ success: false, code: 'CAMBIO_CLAVE_REQUERIDO', msg: 'Debes cambiar tu contraseña temporal antes de continuar' });
        }

        if ( perfilObligatorio() && userFound.rol === 'Atleta' && req.method !== 'GET' && PREFIJOS_DE_NEGOCIO.some( p => ruta.startsWith( p ) ) ) {
            const { completo, faltantes } = await perfilCompleto( userFound );
            if ( ! completo ) {
                return res.status(403).json({ success: false, code: 'PERFIL_INCOMPLETO', msg: 'Completa tu perfil para continuar', camposFaltantes: faltantes });
            }
        }

        // Vista de entrenador de un administrador que también entrena: solo restringe los datos a sus niveles
        userFound.vistaEntrenador = req.get('X-Vista') === 'entrenador' && tieneRol(userFound, 'Entrenador');
        req.userFound = userFound;
        next();

    } catch (error) {
        console.error(error);
        return res.status(401).json({msg: 'Token invalido o inactivo'});
    }
}

export {
    authMiddleware
}