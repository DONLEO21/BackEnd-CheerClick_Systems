import { model, Schema } from "mongoose";

const planAsociadoSchema = new Schema({
    nombre: {
        type: String,
        unique: true,
        minlength:[2, 'El nombre del plan debe ser mayor a 5 caractes'],
        required:[true, 'El nombre del plan es obligatorio'],
        trim: true
    },
    valor: {
        type: Number,
        required: [true, 'El valor del plan es obligatorio'],
        trim: true,
        min: [1, 'El valor del plan debe ser mayor a 0']
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: [200, 'La descripción no puede superar los 200 caracteres'],
        default: ''
    },
    estado: {
        type: String,
        enum: ['Activo', 'Inactivo'],
        required: [true, 'El estado del plan es obligatorio'],
        trim: true
    }
},{
    timestamps: true,
    versionKey: false
});

const PlanAsociadoModel = model('planAsociado', planAsociadoSchema)

export default PlanAsociadoModel;