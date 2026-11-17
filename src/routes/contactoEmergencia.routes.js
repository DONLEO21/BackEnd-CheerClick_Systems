import { Router } from 'express';
import { updateContactoEmergencia } from '../controllers/contactoEmergencia.controllers.js';
import { authMiddleware } from '../middlewares/authenticate.middlewares.js';
import { authorizationMiddleware } from '../middlewares/authorizationMiddleware.middlewares.js';

const router = Router();

// Solo el administrador edita los contactos de otro usuario
router.patch('/:id', [ authMiddleware, authorizationMiddleware(['Administrador']) ], updateContactoEmergencia);

export default router;