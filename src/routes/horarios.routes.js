import { Router } from 'express';
import { createHorario, deleteHorario, getHorario, getHorarios, getSesiones, updateHorario } from '../controllers/horarios.controllers.js';
import { authMiddleware } from "../middlewares/authenticate.middlewares.js";
import { authorizationMiddleware } from "../middlewares/authorizationMiddleware.middlewares.js";


const router = Router();

router.get('/', [authMiddleware, authorizationMiddleware(['Administrador', 'Atleta', 'Entrenador'])], getHorario);
router.post('/',[authMiddleware, authorizationMiddleware(['Administrador','Entrenador'])], createHorario);
router.patch('/:id', [authMiddleware, authorizationMiddleware(['Administrador','Entrenador'])], updateHorario);
router.delete('/:id', [authMiddleware, authorizationMiddleware(['Administrador','Entrenador'])], deleteHorario);
// Antes de '/:id' para que "sesiones" no se tome como un id
router.get('/sesiones', [authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador'])], getSesiones);
router.get('/:id', [authMiddleware, authorizationMiddleware(['Administrador', 'Atleta', 'Entrenador'])], getHorarios )

export default router;
