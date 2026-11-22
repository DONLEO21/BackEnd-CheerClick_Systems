import ImplementoModel from "../models/implementos.model.js";
import PagosModel from "../models/pagos.model.js";
import HabilidadesModel from "../models/habilidades.model.js";
import SolicitudModel from "../models/solicitud.model.js";
import NivelModel from "../models/nivel.model.js";
import PlanAsociadoModel from "../models/planAsociado.model.js";
import metodoPagoModel from "../models/metodoPago.model.js";
import HorarioModel from "../models/horario.model.js";
import JustificacionModel from "../models/justificacion.model.js";
import ResenaModel from "../models/resena.model.js";
import RendimientoModel from "../models/rendimiento.models.js";
import notificacionModel from "../models/notificacion.model.js";
import CompetenciaModel from "../models/competencia.model.js";
import Inscripciones_competenciasModel from "../models/inscripcion_competencia.model.js";

/**
 * Entidades cuyo código consecutivo (prefijo + número) lo asigna el plugin `pluginCodigo`.
 * Ya existían (se conservan tal cual): usuarios (AT/EN/AD, con contador propio) y PQRS (PQ0001, derivado de `numero`).
 * Excluidos a propósito (tablas de unión o de registro, sin identidad propia para el usuario): asistencia,
 * solicitudImplementos, implementoTalla, contactoEmergencia, perfilUsuario, plantilla_horario, respuesta_pqrs, nota,
 * contador y mensualidades (se identifica con el código del pago asociado, PG###).
 */
export const ENTIDADES_CON_CODIGO = [
    { nombre: "implementos", prefijo: "IM", modelo: ImplementoModel },
    { nombre: "pagos", prefijo: "PG", modelo: PagosModel },
    { nombre: "habilidades", prefijo: "HA", modelo: HabilidadesModel },
    { nombre: "pedidos (solicitudes)", prefijo: "SL", modelo: SolicitudModel },
    { nombre: "niveles", prefijo: "NV", modelo: NivelModel },
    { nombre: "planes asociados", prefijo: "PL", modelo: PlanAsociadoModel },
    { nombre: "métodos de pago", prefijo: "MP", modelo: metodoPagoModel },
    { nombre: "horarios (sesiones)", prefijo: "HR", modelo: HorarioModel },
    { nombre: "justificaciones", prefijo: "JU", modelo: JustificacionModel },
    { nombre: "reseñas", prefijo: "RS", modelo: ResenaModel },
    { nombre: "rendimiento", prefijo: "RD", modelo: RendimientoModel },
    { nombre: "notificaciones", prefijo: "NT", modelo: notificacionModel },
    { nombre: "competencias", prefijo: "CP", modelo: CompetenciaModel },
    { nombre: "inscripciones a competencias", prefijo: "IC", modelo: Inscripciones_competenciasModel },
];
