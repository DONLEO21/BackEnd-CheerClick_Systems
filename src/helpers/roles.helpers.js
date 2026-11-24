// Roles de un usuario: `rol` es el rol PRINCIPAL y `rolesAdicionales` (p. ej. ['Entrenador'] en un administrador que también
// entrena) son permisos extra. Toda autorización se decide con el CONJUNTO de roles que guarda la base de datos (el token solo
// identifica a la persona): el cliente nunca puede declarar qué rol tiene.
export const ROLES_ADICIONALES_VALIDOS = ['Entrenador'];

/** Todos los roles del usuario, sin repetir (el principal primero). */
export const rolesDe = (usuario) => [...new Set([usuario?.rol, ...(usuario?.rolesAdicionales ?? [])].filter(Boolean))];

/** ¿El usuario tiene este rol (principal o adicional)? */
export const tieneRol = (usuario, rol) => rolesDe(usuario).includes(rol);

/**
 * ¿Debe tratarse a este usuario como entrenador para LIMITAR los datos a sus niveles? Es verdad para el entrenador y para un
 * administrador con «También actúa como entrenador» que usa la vista de entrenador (cabecera X-Vista: entrenador).
 * La cabecera solo puede RESTRINGIR lo que se ve; nunca otorga permisos (esos salen del conjunto de roles en la base de datos).
 */
export const actuaComoEntrenador = (usuario) => usuario?.rol === 'Entrenador' || usuario?.vistaEntrenador === true;

/** ¿Puede ser asignado como entrenador de un nivel? Entrenador, o administrador con el rol adicional. */
export const puedeEntrenar = (usuario) => tieneRol(usuario, 'Entrenador');
