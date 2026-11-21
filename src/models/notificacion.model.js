import { Schema, model } from "mongoose";

const notificacionSchema = new Schema({
    usuario:{ 
        type: Schema.Types.ObjectId, 
        ref: 'usuario', 
        required: true, 
        index: true 
    
    },
    tipo:{ 
        type: String, enum: ['seguridad', 'perfil', 'cuenta', 'pago'], 
        required: true 
    },
    titulo:{
        type: String,
        trim: true,
        default: ''
    },
    mensaje:{ 
        type: String, 
        required: true, 
        trim: true 
    },
    // Ruta del frontend a la que lleva la notificación (p. ej. /atleta/pagos)
    enlace:{
        type: String,
        trim: true,
        default: ''
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