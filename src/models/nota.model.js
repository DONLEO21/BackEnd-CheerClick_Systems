import { Schema, model } from "mongoose";

// Nota del entrenador sobre un atleta (se guarda al registrar el rendimiento de una sesión)
const notaSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "usuario", required: [true, "El atleta es obligatorio"], index: true },
    autor: { type: Schema.Types.ObjectId, ref: "usuario", required: [true, "El autor es obligatorio"] },
    fecha: { type: String, required: [true, "La fecha es obligatoria"] }, // AAAA-MM-DD
    texto: {
      type: String,
      required: [true, "El texto de la nota es obligatorio"],
      trim: true,
      maxlength: [500, "La nota no puede superar los 500 caracteres"],
    },
  },
  { timestamps: true, versionKey: false },
);

const NotaModel = model("nota", notaSchema);

export default NotaModel;
