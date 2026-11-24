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
    // Datos para transferir, TODOS opcionales (el admin llena ninguno, uno o varios). Validación suave: sin obligar ninguno.
    // `llave`: texto libre (llave Bre-B, alias, correo…). Teléfono y cuenta: solo dígitos y una longitud razonable.
    llave : {
        type: String,
        trim : true,
        maxlength: [60, 'La llave no puede superar los 60 caracteres'],
        default: ''
    },
    numeroTelefono : {
        type: String,
        trim : true,
        default: '',
        validate: {
            validator: (v) => !v || /^\d{7,15}$/.test(v),
            message: 'El teléfono debe tener solo dígitos (entre 7 y 15)'
        }
    },
    numeroCuenta : {
        type: String,
        trim : true,
        default: '',
        validate: {
            validator: (v) => !v || /^\d{6,25}$/.test(v),
            message: 'El número de cuenta debe tener solo dígitos (entre 6 y 25)'
        }
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
    if (esEfectivo(this.nombre)) { this.qr = ''; this.llave = ''; this.numeroTelefono = ''; this.numeroCuenta = ''; this.requiereComprobante = false; }
});

// Código visible consecutivo MP001, MP002… (el _id interno se conserva para las relaciones)
metodoPagoSchema.plugin(pluginCodigo, 'MP');

const metodoPagoModel = model('metodoPago', metodoPagoSchema);

export  default metodoPagoModel;