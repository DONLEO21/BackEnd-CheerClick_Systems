import { rolesDe } from '../helpers/roles.helpers.js';

const authorizationMiddleware = ( allowedRoles) => {

    return (req, res, next) => {
        // 1. Extraer el rol del usuario del payload del token que valida el middleware de autenticación
        // Se autoriza por el CONJUNTO de roles guardado en la base de datos (principal + adicionales), nunca por un
        // "rol activo" que mande el cliente.
        const roles = rolesDe(req.userFound);
        const rol = roles[0];

        if ( ! rol){
            return res.status(403).json({msg: 'Error: El usuario autenticado no tiene rol definido'});
        }

        // 2. Verificar si el rol del usuario se encuentra en la lista de errores permitidos... para esta ruta
        if ( ! roles.some((r) => allowedRoles.includes(r))) {
            return res.status(403).json({
                msg: `Error: el rol ${ rol} no esta autorizado para realizar esta acción`
            })
        }
        console.log(`Usuario autorizado con roles ${roles.join(', ')}`);
        next();
    }
    
}
export {
    authorizationMiddleware
}