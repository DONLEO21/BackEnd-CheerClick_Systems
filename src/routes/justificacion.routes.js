import { Router } from "express";
import {
    createJustificacion, deleteJustificacion, getJustificacion, updateJustificacion, getArchivoJustificacion
} from "../controllers/justificacion.controllers.js";
import { authMiddleware } from "../middlewares/authenticate.middlewares.js";
import { authorizationMiddleware } from "../middlewares/authorizationMiddleware.middlewares.js";

const router = Router();

// Solo el atleta justifica
router.post('/', [authMiddleware, authorizationMiddleware(['Atleta'])], createJustificacion);
router.get('/', [authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador', 'Atleta'])], getJustificacion);
router.get('/:id/archivo', [authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador', 'Atleta'])], getArchivoJustificacion);
router.patch('/:id', [authMiddleware, authorizationMiddleware(['Administrador', 'Entrenador'])], updateJustificacion);
router.delete('/:id', [authMiddleware, authorizationMiddleware(['Administrador'])], deleteJustificacion);

export default router;