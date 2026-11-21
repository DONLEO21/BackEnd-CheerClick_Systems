import { Schema, model } from "mongoose";

const rendimientoSchema = new Schema(
  {
    asistencia: {
      type: Schema.Types.ObjectId,
      ref: "asistencia",
      required: [true, "La asistencia es obligatoria"],
    },
    // Atleta evaluado. Las consultas y el listado de rendimiento agrupan por este campo
    // (antes faltaba en el esquema: Mongoose lo descartaba al guardar).
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "usuario",
      index: true,
    },
    habilidad: {
      type: Schema.Types.ObjectId,
      ref: "habilidad",
      required: [true, "La habilidad es obligatoria"],
    },
    calificacion: {
      type: Boolean,
      default: false,
      required: [true, "La calificación es obligatoria"],
    },
    observaciones: {
      type: String,
      trim: true,
      maxlength: [300, "Las observaciones no pueden superar los 300 caracteres"],
      default: null,
    },
    fecha: {
      type: Date,
      default: Date.now,
      required: [true, "La fecha es obligatoria"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

rendimientoSchema.index({ asistencia: 1, habilidad: 1 }, { unique: true });

const RendimientoModel = model("rendimiento", rendimientoSchema);

export default RendimientoModel;