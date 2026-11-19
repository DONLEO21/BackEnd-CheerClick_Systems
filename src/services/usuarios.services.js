// Servicio se habla con la db. Estas funciones
// realizaran la consultas a la db
import mongoose from "mongoose"
import usuarioModel from "../models/usuarios.model.js"
import contadorModel from "../models/contador.model.js"
import NivelModel from "../models/nivel.model.js"
import PlanAsociadoModel from "../models/planAsociado.model.js"

const dbGetUsuarioConPlan = async ( id ) => {
    return await usuarioModel.findById( id )
        .select('-contrasena')
        .populate({ path: 'nivel', model: NivelModel, select: 'nombre diasEntreno imagenEntre' })
        .populate({ path: 'planAsociado', model: PlanAsociadoModel, select: 'nombre valor' });
}

// Valida nivel y plan, que existan y que estén activos
const dbValidarNivelYPlan = async ( { nivel, planAsociado }, exigir = { nivel: true, planAsociado: true } ) => {
    const errors = {};

    const revisar = async ( campo, valor, Modelo, nombre, obligatorio ) => {
        if( ! valor ) {
            if( obligatorio ) errors[campo] = `El ${nombre} es obligatorio`;
            return;
        }
        if( ! mongoose.isValidObjectId( valor ) ) {
            errors[campo] = `El ${nombre} no es un id válido`;
            return;
        }
        const encontrado = await Modelo.findOne({ _id: valor, estado: 'Activo' }).select('_id');
        if( ! encontrado ) errors[campo] = `El ${nombre} no existe o está inactivo`;
    };

    await revisar( 'nivel', nivel, NivelModel, 'nivel', exigir.nivel );
    await revisar( 'planAsociado', planAsociado, PlanAsociadoModel, 'plan', exigir.planAsociado );

    return Object.keys( errors ).length > 0 ? errors : null;
}

// Qué exige cada rol
const REQUISITOS_ROL = {
    Atleta:        { nivel: true,  planAsociado: true  },
    Entrenador:    { nivel: true,  planAsociado: false },
    Administrador: { nivel: false, planAsociado: false }
};

const PREFIJOS = { Atleta: 'AT', Entrenador: 'EN', Administrador: 'AD' };

const dbGenerarCodigo = async ( rol ) => {
    const prefijo = PREFIJOS[rol];

    const contador = await contadorModel.findOneAndUpdate(
        { _id: prefijo },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    return prefijo + String( contador.seq ).padStart( 3, '0' );
}

// Busca por correo sin filtrar por status
const dbFindUserByEmail = async ( email ) => {
    return await usuarioModel.findOne({ email: email });
}

const dbListUsuarios = async ( filtro, page = 1, limit = 10 ) => {
    const [ data, total ] = await Promise.all([
        usuarioModel.find( filtro ).select('-contrasena').sort({ createdAt: -1 }).skip( (page - 1) * limit ).limit( limit ),
        usuarioModel.countDocuments( filtro )
    ]);

    return { data, total };
}

const dbCountUsuarios = async ( filtro = {} ) => {
    return await usuarioModel.countDocuments( filtro );
}

const dbCreateUsuario = async ( newUsuario ) => {
    return await usuarioModel.create(newUsuario);
}

const dbGetUsuario = async (id) => {
    return await usuarioModel.findOne({ _id : id}).select('-contrasena')
}

const dbGetUserForReset = async ( email ) => {
    return await usuarioModel
        .findOne({ email: email, status: true })
        .select('+resetCodeHash +resetCodeExpires +resetAttempts');
}

const dbUpdateUsuario = async (id, usuarioUpdate) => {
    return await usuarioModel.findByIdAndUpdate (
        id,
        usuarioUpdate,
        {new : true, runValidators : true}
    );
}

const dbGetUserByEmail = async ( email , status = true) => {
    return await usuarioModel.findOne({ email: email, status: status });
}

export {
    dbCreateUsuario, dbGetUsuario, dbUpdateUsuario, dbGetUserByEmail,
    dbGetUserForReset, dbGenerarCodigo, PREFIJOS, dbFindUserByEmail, REQUISITOS_ROL,
    dbListUsuarios, dbCountUsuarios, dbGetUsuarioConPlan, dbValidarNivelYPlan
}