import { Schema, model } from "mongoose";
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

const solicitudeSchema = new Schema(
  {
    fecha: {
      type: Date,
      default: Date.now,
      required: [true, "La fecha es obligatoria"],
    },
    condicion: {
      type: String,
      enum: ["Pendiente", "Aprobado", "Entregado", "Cancelado", "Rechazado"],
      default: "Pendiente",
    },
    motivoRechazo: {
      type: String,
      trim: true,
      default: "",
    },
    pago: {
      type: Schema.Types.ObjectId,
      ref: "pagos",
      required: [true, "El pago es obligatorio"],
      unique: true,
      sparce: true
    },
    usuario: {
      type: Schema.Types.ObjectId,
      ref: "usuario",
      required: [true, "El usuario es obligatorio"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Código visible consecutivo SL001, SL002… (el _id interno se conserva para las relaciones)
solicitudeSchema.plugin(pluginCodigo, "SL");

const SolicitudModel = model("solicitud", solicitudeSchema);

export default SolicitudModel;