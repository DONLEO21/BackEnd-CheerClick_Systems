import { Schema, model } from "mongoose";

// Auditoría mínima de cambios administrativos: quién, cuándo y qué cambió (campo, valor anterior y nuevo).
const auditoriaSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "usuario", required: true, index: true },
    accion: { type: String, required: true, trim: true },          // 'editar-ficha' | 'reasignar-nivel' | 'reasignar-plan' | 'rol-adicional' | ...
    entidad: { type: String, required: true, trim: true },         // 'usuario'
    entidadId: { type: Schema.Types.ObjectId, required: true, index: true },
    cambios: [
      {
        _id: false,
        campo: { type: String, required: true },
        anterior: { type: Schema.Types.Mixed, default: null },
        nuevo: { type: Schema.Types.Mixed, default: null },
      },
    ],
    detalle: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false },
);

const AuditoriaModel = model("auditoria", auditoriaSchema);

export default AuditoriaModel;
