import { Router } from "express";
import { createPerfilUsuario, updatePerfilUsuario, getMiPerfil, updateMiPerfil, updateMiFoto, updateMiCertificado, descargarMiCertificado, updateMisContactos, updateMisPreferencias } from "../controllers/perfilUsuario.controllers.js";
import { authMiddleware } from '../middlewares/authenticate.middlewares.js'
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware.middlewares.js'
import { subirFotoMiddleware, subirCertificadoMiddleware } from "../services/archivos.services.js";

const router = Router();

router.post('/', authMiddleware, createPerfilUsuario);

// Mi perfil
router.get('/me', authMiddleware, getMiPerfil);
router.patch('/me', authMiddleware, updateMiPerfil);
router.put('/me/foto', authMiddleware, subirFotoMiddleware, updateMiFoto);
router.put('/me/certificado-eps', authMiddleware, subirCertificadoMiddleware, updateMiCertificado);
router.get('/me/certificado-eps', authMiddleware, descargarMiCertificado);
router.put('/me/contactos', authMiddleware, updateMisContactos);
router.patch('/me/preferencias', authMiddleware, updateMisPreferencias);

// Solo el administrador edita el perfil de otro usuario
router.patch('/:id', [ authMiddleware, authorizationMiddleware(['Administrador']) ], updatePerfilUsuario);

export default router;