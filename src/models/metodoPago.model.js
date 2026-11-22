import {Schema, model} from "mongoose";
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

const metodoPagoSchema = new Schema({
    nombre : {
        type: String,
        required: [true, 'El nombre del metodo de pago es obligatorio'],
        trim : true,
        unique: true,
        validate: {
            // "Pago presencial" ya no existe como método de pago
            validator: (v) => !/^pago\s+presencial$/i.test(String(v ?? '').trim()),
            message: 'El método "Pago presencial" no está disponible'
        }
    },
    // Imagen/enlace del QR. Solo aplica a los métodos que lo necesitan (p. ej. Nequi, Daviplata);
    // "Efectivo" nunca lleva QR. Es opcional.
    qr : {
        type: String,
        trim : true,
        default: ''
    },
    // ¿El atleta debe adjuntar comprobante al pagar con este método? "Efectivo" siempre es false.
    requiereComprobante : {
        type: Boolean,
        default: true
    }
},{
    timestamps : true,
    versionKey : false
});

// "Efectivo" no usa QR: si llega uno, se descarta
const esEfectivo = (nombre) => String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'efectivo';

metodoPagoSchema.pre('validate', function () {
    if (esEfectivo(this.nombre)) { this.qr = ''; this.requiereComprobante = false; }
});

// Código visible consecutivo MP001, MP002… (el _id interno se conserva para las relaciones)
metodoPagoSchema.plugin(pluginCodigo, 'MP');

const metodoPagoModel = model('metodoPago', metodoPagoSchema);

export  default metodoPagoModel;