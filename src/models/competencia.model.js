import { Schema, model } from "mongoose";
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

const CompetenciaSchema = new Schema ({
    nombre: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  fechaCompetencia: {
    type: Date,
    required: true
  },
  lugar: {
    type: String,
    maxlength: 100,
    trim: true
  },
 precioinscripcion: {
    type: Number,
    required: true,
    default: 0
  },
  fechalimite: {
    type: Date
  },
  Imagen: {
    type: String,
    trim: true
  },
  
  link: {
    type: String,
    maxlength: 100,
    trim: true
  },
  preciopublico: {
    type: Number,
    required: true,
    default: 0
  },
  estado: {
    type: String,
    enum: ['Activo', 'Inactivo'],
    default: 'Activo',
    required: true
  },
  nivel: {
      type: Schema.Types.ObjectId,
      ref: 'Nivel',          
      required: true
    },
  createBy: {
      type: Schema.Types.ObjectId,
      ref: 'usuario'         
    }
}, {
    timestamps: true,                
    versionKey: false 
});

// Código visible consecutivo CP001, CP002… (el _id interno se conserva para las relaciones)
CompetenciaSchema.plugin(pluginCodigo, 'CP');

const CompetenciaModel=model(
    'Competencia',
    CompetenciaSchema
);

export default CompetenciaModel