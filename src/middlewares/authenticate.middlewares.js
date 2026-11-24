import { validateToken } from "../helpers/jwt.helpers.js";
import { dbGetUsuario } from "../services/usuarios.services.js";

const rutaActual = ( req ) => `${ req.method } ${ ( req.baseUrl + req.path ).replace( /\/+$/, '' ) }`;

// Lo único permitido mientras el usuario no cambie la contraseña que le asignó el admin
const RUTAS_CAMBIO_CONTRASENA = [
    'GET /api/auth/renovar-token',
    'PATCH /api/auth/cambiar-contrasena'
];

// Perfil incompleto: solo podra usar su perfil, y sus notificaciones
const permitidaSinPerfil = ( req ) => {
    const ruta = rutaActual( req );
    return ruta === 'POST /api/perfilusuario'
        || RUTAS_CAMBIO_CONTRASENA.includes( ruta )
        || ( req.baseUrl + req.path ).startsWith( '/api/perfilusuario/me' )
        || req.baseUrl === '/api/notificaciones';
};

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

        // Contraseña asignada por el admin: hasta cambiarla, solo puede hacer eso (o renovar el token)
        if ( userFound.debeCambiarContrasena && ! RUTAS_CAMBIO_CONTRASENA.includes( rutaActual( req ) ) ) {
            return res.status(403).json({
                msg: 'Debes cambiar tu contraseña antes de continuar',
                codigo: 'CAMBIO_CONTRASENA_REQUERIDO'
            });
        }

        // Cuenta nueva: hasta completar el perfil solo ve su perfil (y el dashboard sin datos)
        if ( userFound.debeCompletarPerfil && ! permitidaSinPerfil( req ) ) {
            return res.status(403).json({
                msg: 'Debes completar tu perfil antes de continuar',
                codigo: 'PERFIL_INCOMPLETO'
            });
        }

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