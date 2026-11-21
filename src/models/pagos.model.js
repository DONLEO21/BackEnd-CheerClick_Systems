import {Schema, model} from "mongoose";
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

//Parte 1: Definir la estructura de datos de mi documento

const PagosSchema = new Schema( 
    //Definicion de los campos de documento
    {
    estado : {
        type: String,
        enum: ['Pagado', 'Vencido', 'Pendiente', 'Pendiente de confirmación'],   // 'Pendiente de confirmación': pago en efectivo ya solicitado    //Tipo de dato
        default : 'Pendiente',
        required : [true, 'El estado del pago es obligatorio'],    //Regla: Es OBLIGATORIO
        trim: true   //Modificador : 
    },
    valorTotal : {
        type: Number,
        required : [true, 'El valor del pago es obligatorio'],
        trim : true 
    },
    fechaGenera : {
        type: Date,
        required : [true, 'El la fecha de generacion del pago es obligatoria']
    },
    fechaPago : {
        type: Date
    },
    comprobante:{
        type: String,
        // Un pago PENDIENTE (p. ej. la mensualidad generada automáticamente) aún no tiene comprobante
        required : [function () { return this.estado === 'Pagado'; }, 'La ruta del comprobante es obligatoria'],
        default: '',
        trim:true
    },
    observaciones: {
        type : String,
        trim: true,
        maxlength: [100, 'Se supero la cantidad de caracteres para las observaciones']
    },
    metodoPago : {
        type: Schema.Types.ObjectId,
        ref : 'metodoPago',
        // Se elige al pagar; una mensualidad pendiente todavía no tiene método
        required: [function () { return this.estado === 'Pagado'; }, 'El método de pago es obligatorio']
    },
    usuario: {
        type: Schema.Types.ObjectId,
        ref: 'usuario',
        required: [true, 'El ID del usuario es obligatorio']
    },
},
//
{
    timestamps: true
});

//Parte 2: Definir el modelo. Dicho modelo esta atado al nombre de un documento

// Código visible consecutivo PG001, PG002… (el _id interno se conserva para las relaciones)
PagosSchema.plugin(pluginCodigo, 'PG');

const PagosModel = model('Pagos', PagosSchema);//Nombre de la coleccion  - Nombre del esquema que define la estructura de los documentos 



export default PagosModel;