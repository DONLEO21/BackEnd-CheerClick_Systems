import { dbGetContactoE, dbUpdateContactoE } from "../services/contactoEmergencia.services.js";

const responderError = (res, error, msg) => {
    console.error(error);

    if (error.name === 'ValidationError') {
        const errors = {};
        for (const field in error.errors) {
            errors[field] = error.errors[field].message;
        }
        return res.status(400).json({ errors });
    }

    if (error.name === 'CastError') {
        return res.status(400).json({ msg: 'El ID no tiene un formato válido' });
    }

    res.status(500).json({ msg });
}

//Actualizar un contacto de emergencia (solo el dueño o admin)
const updateContactoEmergencia = async (req, res) => {
    try {
        const contacto = await dbGetContactoE(req.params.id);
        if (!contacto) {
            return res.status(404).json({ msg: 'Contacto de emergencia no encontrado' });
        }

        const inputData = req.body;

        // Ni el dueño ni el estado se cambian desde aquí
        delete inputData.createdBy;
        delete inputData.status;

        if (inputData.parentesco && inputData.parentesco !== 'Otro') {
            inputData.parentescoOtro = null;
        }

        if (inputData.parentesco === 'Otro' && !inputData.parentescoOtro?.trim()) {
            return res.status(400).json({ errors: { parentescoOtro: 'Escribe el parentesco' } });
        }

        const data = await dbUpdateContactoE(req.params.id, inputData);

        res.json({ msg: 'Contacto de emergencia actualizado', data: data });
    }
    catch (error) {
        responderError(res, error, 'No se ha podido actualizar el contacto de emergencia');
    }
}

export {
    updateContactoEmergencia
}