import { Router } from 'express';
import { createHabilidad, deleteHabilidad, getHabilidad, getHabilidades, updateHabilidad } from '../controllers/habilidades.controllers.js';
import { authMiddleware } from "../middlewares/authenticate.middlewares.js";
import { authorizationMiddleware } from "../middlewares/authorizationMiddleware.middlewares.js";

const router = Router();

router.get('/',[authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador', 'Atleta'])], getHabilidades);

router.get('/:id',[authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador', 'Atleta'])], getHabilidad);

// Crear habilidades: solo el administrador. El entrenador puede habilitar/deshabilitar (ver updateHabilidad)
router.post('/',[authMiddleware, authorizationMiddleware(['Administrador'])], createHabilidad);

router.patch('/:id',[authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador'])], updateHabilidad);

export default router;