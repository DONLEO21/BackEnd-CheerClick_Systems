import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendResetCodeEmail = async (to, nombre, code, ttlMin) => {
  const subjectText = `Código para restablecer tu contraseña - CheerClick (${new Date().toLocaleTimeString()})`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: subjectText,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color:#ece7e7;padding:24px;text-align:center;">
          <h2 style="color:#18181b;margin:0;">CheerClick Systems</h2>
        </div>

        <div style="padding:24px;background-color:#ffffff;">
          <h2 style="text-align:center;color:#18181b;margin-top:0;">Recuperar contraseña</h2>

          <p style="color:#3f3f46;line-height:1.5;">
            Hola ${nombre}. Hemos recibido una solicitud para restablecer la contraseña de tu cuenta asociada a este correo:
          </p>

          <div style="background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
            <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#18181b;">
              ${code}
            </div>
          </div>

          <p style="color:#71717a;font-size:14px;margin-bottom:0;">
            Este código expirará en ${ttlMin} minutos. Si no lo solicitaste, ignora este mensaje.
          </p>
        </div>
      </div>
    `,
  });
};

const sendSolicitudEmail = async (to, nombre, aprobada, rol) => {
  const titulo = aprobada
    ? "¡Tu cuenta fue aprobada!"
    : "Tu solicitud fue rechazada";

  const mensaje = aprobada
    ? `Bienvenido a CheerClick Systems. Tu cuenta fue validada con el rol de <b>${rol}</b>. Ya puedes iniciar sesión.`
    : "Tu solicitud de ingreso no fue aprobada. Si crees que es un error, contacta al club.";

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: `${titulo} - CheerClick`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h2 style="text-align:center;color:#18181b;margin-top:0;">${titulo}</h2>
        <p style="color:#3f3f46;line-height:1.5;">Hola ${nombre}. ${mensaje}</p>
      </div>
    `,
  });
};

const sendCorreoCambiadoEmail = async (to, nombre, nuevoEmail) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: "El correo de tu cuenta fue cambiado - CheerClick",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h2 style="text-align:center;color:#18181b;margin-top:0;">Correo actualizado</h2>
        <p style="color:#3f3f46;line-height:1.5;">
          Hola ${nombre}. El correo de tu cuenta ahora es <b>${nuevoEmail}</b>. Si no fuiste tú, contacta al club de inmediato.
        </p>
      </div>
    `,
  });
};

const sendContrasenaCambiadaEmail = async (to, nombre) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: "Tu contraseña fue cambiada - CheerClick",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h2 style="text-align:center;color:#18181b;margin-top:0;">Contraseña actualizada</h2>
        <p style="color:#3f3f46;line-height:1.5;">
          Hola ${nombre}. La contraseña de tu cuenta fue cambiada. Si no fuiste tú, contacta al club de inmediato.
        </p>
      </div>
    `,
  });
};

const sendCambioCuentaEmail = async (to, nombre, mensaje) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: "Novedad en tu cuenta - CheerClick",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h2 style="text-align:center;color:#18181b;margin-top:0;">Novedad en tu cuenta</h2>
        <p style="color:#3f3f46;line-height:1.5;">
          Hola ${nombre}. ${mensaje}
        </p>
      </div>
    `,
  });
};

// La contraseña puede traer < > & ": se escapa para que el correo la muestre tal cual
const escaparHtml = (texto) => String(texto)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Cuenta creada por el administrador: datos de acceso con la contraseña temporal
const sendCuentaCreadaEmail = async (to, nombre, rol, contrasenaTemporal) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: to,
    subject: "Tu cuenta fue creada - CheerClick",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
        <h2 style="text-align:center;color:#18181b;margin-top:0;">¡Bienvenido a CheerClick Systems!</h2>
        <p style="color:#3f3f46;line-height:1.5;">
          Hola ${nombre}. El administrador del club creó tu cuenta con el rol de <b>${rol}</b>. Estos son tus datos de acceso:
        </p>

        <div style="background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:24px 0;color:#18181b;">
          <p style="margin:0 0 8px;"><b>Correo:</b> ${to}</p>
          <p style="margin:0;"><b>Contraseña temporal:</b> <span style="font-family:monospace;font-size:16px;">${escaparHtml(contrasenaTemporal)}</span></p>
        </div>

        <p style="color:#3f3f46;line-height:1.5;">
          Al iniciar sesión por primera vez el sistema te pedirá cambiar esta contraseña por una que solo tú conozcas.
        </p>
        <p style="color:#71717a;font-size:14px;margin-bottom:0;">
          Si no esperabas este correo, contacta al club.
        </p>
      </div>
    `,
  });
};

export {
  sendResetCodeEmail,
  sendCuentaCreadaEmail,
  sendSolicitudEmail,
  sendCorreoCambiadoEmail,
  sendContrasenaCambiadaEmail,
  sendCambioCuentaEmail,
};