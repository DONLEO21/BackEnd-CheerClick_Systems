import metodoPagoModel from "../models/metodoPago.model.js";

const dbGetMetodoPago = async () => {
    return await metodoPagoModel.find()
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
    if (/^efectivo$/i.test(String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim())) cambios.qr = '';

    return await metodoPagoModel.findOneAndUpdate(
        {_id: id},
        cambios,
        {new : true, runValidators: true}
    );
}

const dbGetMetodoPagos = async (id) => {
    return await metodoPagoModel.findOne({_id: id})
}



export {
    dbGetMetodoPago,
    dbCreateMetodoPago,
    dbDeleteMetodoPago,
    dbUpdateMetodoPago,
    dbGetMetodoPagos
}