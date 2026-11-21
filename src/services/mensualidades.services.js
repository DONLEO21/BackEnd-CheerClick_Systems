import MensualidadModel from "../models/mensualidades.model.js"

const dbCreateMensualidad = async ( newMensualidad ) => {
    return await MensualidadModel.create( newMensualidad );    //Registrar en la base de datos
}

const dbGetMensualidad = async (filter = {}) => {
    return await MensualidadModel.find(filter)
        .populate('planAsociado')
        .populate('pago')
        .populate('usuario', 'nombre apellido email codigo');
};

const dbUpdateMensualidad = async ( id, mensualidadUpdate) => {
    return await MensualidadModel.findOneAndUpdate(
        { _id: id},
        mensualidadUpdate,
        {new: true}
    );
}

const dbGetMensualidades = async (id, filter = {}) => {
    // Mismo populate que el listado: sin él el frontend no ve el estado/método/comprobante del pago tras enviarlo
    return await MensualidadModel.findOne({_id: id, ...filter})
        .populate('planAsociado')
        .populate('pago')
        .populate('usuario', 'nombre apellido email codigo');
}

export{
    dbCreateMensualidad,
    dbGetMensualidad,
    dbUpdateMensualidad,
    dbGetMensualidades
}