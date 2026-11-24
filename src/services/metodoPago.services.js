import metodoPagoModel from "../models/metodoPago.model.js";
import { requiereComprobante, esMetodoEfectivo } from "../helpers/metodoPago.helpers.js";

// Los documentos antiguos no tienen `requiereComprobante`: se completa aquí (Efectivo nunca lo requiere)
// y los datos de pago opcionales (llave, teléfono, cuenta) quedan vacíos en los métodos creados antes de que existieran
const conRequisitos = (m) => {
    const o = m.toObject ? m.toObject() : m;
    return { ...o, llave: o.llave ?? '', numeroTelefono: o.numeroTelefono ?? '', numeroCuenta: o.numeroCuenta ?? '', requiereComprobante: requiereComprobante(o) };
}

const dbGetMetodoPago = async () => {
    return (await metodoPagoModel.find()).map(conRequisitos)
}

const dbCreateMetodoPago = async (newMetodoPago) => {
    return await metodoPagoModel.create(newMetodoPago)
}

const dbDeleteMetodoPago = async (id) => {
    return await metodoPagoModel.findOneAndDelete({ _id: id})
}

const dbUpdateMetodoPago = async (id, metodoPagoUpdate) => {
    // findOneAndUpdate no ejecuta los hooks del documento: se aplican aquí las mismas reglas
    const cambios = { ...metodoPagoUpdate };
    const actual = cambios.nombre === undefined ? await metodoPagoModel.findById(id).select('nombre') : null;
    const nombre = cambios.nombre ?? actual?.nombre;
    if (esMetodoEfectivo(nombre)) { cambios.qr = ''; cambios.llave = ''; cambios.numeroTelefono = ''; cambios.numeroCuenta = ''; cambios.requiereComprobante = false; }

    return await metodoPagoModel.findOneAndUpdate(
        {_id: id},
        cambios,
        {new : true, runValidators: true}
    );
}

const dbGetMetodoPagos = async (id) => {
    const m = await metodoPagoModel.findOne({_id: id})
    return m ? conRequisitos(m) : m
}



export {
    dbGetMetodoPago,
    dbCreateMetodoPago,
    dbDeleteMetodoPago,
    dbUpdateMetodoPago,
    dbGetMetodoPagos
}