import { Schema, model } from "mongoose";

const notificacionSchema = new Schema({
    usuario:{ 
        type: Schema.Types.ObjectId, 
        ref: 'usuario', 
        required: true, 
        index: true 
    
    },
    tipo:{ 
        type: String, enum: ['seguridad', 'perfil', 'cuenta'], 
        required: true 
    },
    mensaje:{ 
        type: String, 
        required: true, 
        trim: true 
    },
    leida:{ 
        type: Boolean, 
        default: false 
    }
}, 
{ 
    timestamps: true 
});

const notificacionModel = model( 'notificacion', notificacionSchema );

export default notificacionModel;