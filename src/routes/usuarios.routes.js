import { Router } from 'express';
import { createUsuario, updateUsuario } from '../controllers/usuarios.controllers.js';
import { listSolicitudes, getDetalleUsuario, descargarCertificadoEps, aprobarSolicitud, rechazarSolicitud, listCuentas, cambiarStatus, cambiarRol } from '../controllers/cuentas.controllers.js';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware.middlewares.js'
import { authMiddleware } from '../middlewares/authenticate.middlewares.js'

const router = Router();

// Solo el administrador
const soloAdmin = [ authMiddleware, authorizationMiddleware(['Administrador']) ];

// Solicitudes de cuentas nuevas
router.get('/solicitudes', soloAdmin, listSolicitudes);
router.patch('/solicitudes/:id/aprobar', soloAdmin, aprobarSolicitud);
router.patch('/solicitudes/:id/rechazar', soloAdmin, rechazarSolicitud);

// Gestión de cuentas
router.get('/', soloAdmin, listCuentas);
router.post('/', soloAdmin, createUsuario);
router.get('/:id/detalle', soloAdmin, getDetalleUsuario);
router.get('/:id/certificado-eps', soloAdmin, descargarCertificadoEps);
router.patch('/:id/status', soloAdmin, cambiarStatus);
router.patch('/:id/rol', soloAdmin, cambiarRol);
router.patch('/:id', soloAdmin, updateUsuario);

export default router;