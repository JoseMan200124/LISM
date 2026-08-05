// Datos de contacto comercial publicados en la web pública. Viven aquí y no
// repartidos por los componentes para que un cambio de canal se haga en un solo
// sitio y no queden correos viejos escondidos en una sección.

export const CONTACT_EMAIL = "hola@haricode.tech";

/** Número en formato internacional sin separadores, para enlaces wa.me. */
export const CONTACT_PHONE_E164 = "50247236649";

/** Mismo número en el formato en que se lee en pantalla. */
export const CONTACT_PHONE_LABEL = "+502 4723 6649";

export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_PHONE_E164}?text=${encodeURIComponent(
  "Hola, quiero una demostración de NexaLab.",
)}`;
