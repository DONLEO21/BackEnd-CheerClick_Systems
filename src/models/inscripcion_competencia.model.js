import {Schema, model} from "mongoose"
import { pluginCodigo } from "../helpers/consecutivo.helpers.js";

const Inscripciones_competenciasSchema = new Schema ({
    competencia : {
        type: Schema.Types.ObjectId,
        ref: 'Competencia',
        required: true
    },
    usuario : {
        type: Schema.Types.ObjectId,
        ref: 'usuario',
        required: true
    },
    pago: {
    type: Schema.Types.ObjectId,
    ref: 'Pagos',
    required: true
}
}, {
    timestamps: true,
    versionKey: false
});


// Código visible consecutivo IC001, IC002… (el _id interno se conserva para las relaciones)
Inscripciones_competenciasSchema.plugin(pluginCodigo, 'IC');

const Inscripciones_competenciasModel = model('Inscripciones_competencias', Inscripciones_competenciasSchema);

export default Inscripciones_competenciasModel