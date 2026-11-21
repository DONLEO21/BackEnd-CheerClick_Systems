import { Schema, model } from "mongoose";


export const TIPOS_NOVEDAD = ["Presente", "Tarde", "Inasistencia", "Justificado"];
const asistenciaSchema = new Schema(
  {
    tipoNovedad: {
      type: String,
      enum: {
        values: TIPOS_NOVEDAD,
        message: "El tipo de novedad debe ser: Presente, Tarde, Inasistencia o Justificado",
      },
      required: [true, "El tipo de novedad es obligatorio"],
    },
    // Deportista al que se le registra la asistencia. Requiere el modelo 'usuario'
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "usuario",
      required: [true, "El usuario es obligatorio"],
    },
    // Nivel en el que se toma la asistencia (la planilla se guarda por nivel y día).
    // CAUSA RAÍZ del "No se pudo guardar la asistencia del día": este campo y `fecha` faltaban en el modelo y el
    // servicio (upsert por usuario+nivel+fecha) fallaba con StrictModeError.
    nivel: {
      type: Schema.Types.ObjectId,
      ref: "Nivel",
      required: [true, "El nivel es obligatorio"],
    },
    // Día de la asistencia, texto AAAA-MM-DD (hora de Colombia): no sufre desfases de zona horaria
    fecha: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD"],
      required: [true, "La fecha es obligatoria"],
    },
    // Sesión de entrenamiento de ese día, si la hay (opcional: puede no haber sesión programada)
    horario: {
      type: Schema.Types.ObjectId,
      ref: "horario",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Un atleta tiene una sola asistencia por día. El índice es parcial para no chocar con documentos antiguos sin fecha.
// (El índice anterior { usuario, horario } se elimina con la migración: scripts/migrar-asistencia.js)
asistenciaSchema.index(
  { usuario: 1, fecha: 1 },
  { unique: true, partialFilterExpression: { fecha: { $type: "string" } } },
);
asistenciaSchema.index({ nivel: 1, fecha: 1 });

const AsistenciaModel = model("asistencia", asistenciaSchema);

export default AsistenciaModel;
