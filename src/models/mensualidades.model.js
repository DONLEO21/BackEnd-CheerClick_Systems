import {Schema, model} from "mongoose";

//Definir la estructura de mi documento
const MensualidadSchema = new Schema(
    //Definir la estrcutura de datos
    { 
        fechaGeneracion: {
            type: Date,
            required: [true, 'La fecha de generacion de la mensualidad es obligatoria']
        },
        // Mes al que corresponde, formato AAAA-MM. Junto con el usuario es único (evita duplicar la generación automática)
        periodo: {
            type: String,
            match: [/^\d{4}-\d{2}$/, 'El periodo debe tener formato AAAA-MM'],
            trim: true
        },
        fechaVencimiento: {
            type: Date,
            required: [true, 'La fecha de vencimiento de la mensualidad es obligatoria']
        },
        valor: {
            type: Number,
            required: [true, 'El valor de la mensualidad es obligatorio'],
            trim: true
        },
        numReferencia:{
            type: String,
            required: [true, 'El numero de referencia de la mensualidad es obligatorio'],
            trim: true,
            minlenght: [5, 'El numero de referencia debe ser mayor a 5 caracteres']
        },
        planAsociado: {
            type:Schema.Types.ObjectId,
            ref: 'planAsociado',
            required:[true, 'El ID del plan asociado es obligatorio']
        },
        pago: {
            type:Schema.Types.ObjectId,
            ref: 'Pagos',
            required: [true, 'El ID de pagos es obligatorio']
        },
        usuario: {
            type: Schema.Types.ObjectId,
            ref: 'usuario',
            required: [true, 'El ID del usuario es obligatorio']
        },
},
  //Configuraciones de la estructura de datos 
{
    timestamps : true,
    versionKey:  false //Elimina la propiedad de versionamiento del Schema 

});
// Una mensualidad por atleta y por mes (solo aplica a documentos con periodo; las antiguas no lo tienen)
MensualidadSchema.index(
    { usuario: 1, periodo: 1 },
    { unique: true, partialFilterExpression: { periodo: { $type: 'string' } } }
);

//Definir el model a partir de la estructura del documento

const MensualidadModel = model('mensualidades', //Nombre de la coleccion donde se guardaran los documentos de las mensualidades
    MensualidadSchema
); //Schema que se guardara de la coleccion 

//Exportamos el modelo para que pueda ser usuado por los servicios 
export default MensualidadModel;