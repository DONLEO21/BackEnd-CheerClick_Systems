// const express = require('express'); //CommonJS
import express from 'express';//EsModule

import usuariosRoute from './routes/usuarios.routes.js'; //EsModule_
import contactoEmergenciaRoute from './routes/contactoEmergencia.routes.js'
import perfilUsuarioRoute from './routes/perfilUsuario.routes.js'
import authRoute from './routes/auth.routes.js'
import path from 'node:path';

import pqrsRoute from './routes/pqrs.routes.js'
import respuestapqrsRoute from './routes/respuesta_pqrs.routes.js'

//Rutas de Pagos 

import pagosRouter from './routes/pagos.routes.js'; //EsModule
import mensualidadRouter from './routes/mensualidades.routes.js'
import PlanAsociadoRouter from './routes/planAsociado.routes.js';
import MetodoPagoRouter from './routes/metodosPago.routes.js';

//Modulo Rendimiento
import rendimientoRoute from './routes/rendimiento.routes.js';
import asistenciaRoute from './routes/asistencia.routes.js';
import justificacionRoute from './routes/justificacion.routes.js';
import habilidadRoute from './routes/habilidades.routes.js';
import tipoHabilidadRoute from './routes/tipoHabilidad.routes.js';

import implementosRoute from './routes/implementos.routes.js';
import implementoTallaRoute from './routes/implementoTalla.routes.js';
import solicitudRoute from './routes/solicitud.routes.js';
import solicitudImplementosRoute from './routes/solicitudImplementos.routes.js';
import resenaRoute from './routes/resena.routes.js';



import conexion from './config/mongo.config.js' //Conexion a la base de datos

//Iniciar servidor 
const port= process.env.PORT || 3001;

const app = express();     //Instancia de express

conexion();      //Ejecuta la conexion a la base de datos

//Habilita a la aplicacion para intepretar JSON
app.use(express.json());

// Solo las fotos son públicas. Los certificados no se envian aqui
app.use('/uploads/fotos', express.static(path.resolve('uploads/fotos')));

//Definiendo el primer endpoint (Ruta de entrada) 
app.get('/health', (req, res) => {
    res.status(200).json({msg : 'Servidor de CheerClick esta funcionando!'})

});

//Enlazar todas las rutas de la aplicacion 
app.use( '/api/pagos' , pagosRouter );
app.use( '/api/mensualidades', mensualidadRouter);
app.use( '/api/plan-asociado', PlanAsociadoRouter);
app.use( '/api/metodo-pago', MetodoPagoRouter);

//Enlazar todas las rutas de la aplicacion 
app.use( '/api/usuarios' , usuariosRoute );
app.use( '/api/contactoemergencia' , contactoEmergenciaRoute);
app.use( '/api/perfilusuario' , perfilUsuarioRoute) ;
app.use( '/api/auth' , authRoute);


app.use('/api/pqrs', pqrsRoute);
app.use('/api/respuesta_pqrs', respuestapqrsRoute);
app.use( '/api/rendimiento' , rendimientoRoute );
app.use( '/api/asistencia' , asistenciaRoute );
app.use( '/api/justificacion' , justificacionRoute );
app.use( '/api/habilidad', habilidadRoute);
app.use( '/api/tipo-habilidad', tipoHabilidadRoute);


//Modulo de Implementos
app.use( '/api/implementos' , implementosRoute );
app.use( '/api/implementoTalla' , implementoTallaRoute );
app.use( '/api/solicitud' , solicitudRoute );
app.use( '/api/solicitudImplementos' , solicitudImplementosRoute );
app.use( '/api/resena' , resenaRoute );


app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});