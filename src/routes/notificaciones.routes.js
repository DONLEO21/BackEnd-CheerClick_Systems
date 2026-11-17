import { Router } from 'express';
import { listarNotificaciones, marcarTodasLeidas, marcarLeida } from '../controllers/notificaciones.controllers.js';
import { authMiddleware } from '../middlewares/authenticate.middlewares.js';

const router = Router();

router.get('/', authMiddleware, listarNotificaciones);
router.patch('/leer-todas', authMiddleware, marcarTodasLeidas);  
router.patch('/:id/leida', authMiddleware, marcarLeida);

export default router;