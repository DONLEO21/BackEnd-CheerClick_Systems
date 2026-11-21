import {Schema, model} from "mongoose";
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

const HabilidadesSchema = new Schema(
    {
    nombre : {
        type: String, 
        required : [true, 'El nombre de la habilidad es obligatorio'], 
        unique: true,  
        trim: true   
    },
    estado : {
        type: String,
        enum: ['Activo', 'Inactivo'],
        required : [true, 'El estado de la habilidad es obligatorio'],
        trim : true 
    },
    // SUPUESTO (relación mínima): nivel al que pertenece la habilidad. null = aplica a TODOS los niveles.
    // Antes la habilidad no estaba asociada a ningún nivel, por eso no se podía filtrar por nivel.
    nivel : {
        type: Schema.Types.ObjectId,
        ref: 'Nivel',
        default: null
    },
    tipoHabilidad : {
        type: Schema.Types.ObjectId,
        ref: 'TipoHabilidad',
        required: [true, 'El ID de tipo de habilidad es obligatorio']
    }
},
{
    timestamps: true,
    versionKey: false
});

// Código visible consecutivo HA001, HA002… (el _id interno se conserva para las relaciones)
HabilidadesSchema.plugin(pluginCodigo, 'HA');

const HabilidadesModel = model('Habilidad', HabilidadesSchema);

export default HabilidadesModel;