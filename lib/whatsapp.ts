/**
 * El recordatorio de la cita por WhatsApp.
 *
 * No hay backend de notificaciones y este plan no añade ninguno: se abre WhatsApp con
 * el texto ya escrito y lo manda la persona. El no-show es el coste principal de un
 * centro así y el teléfono ya está en la ficha, así que es lo más barato que resuelve
 * el 90% del problema.
 */

/** Prefijo por defecto. México; se ignora si el teléfono ya trae uno. */
const LADA_POR_DEFECTO = "52";

/**
 * Deja el teléfono como lo quiere `wa.me`: solo dígitos, con país.
 *
 * Los teléfonos se teclean a mano en la ficha ("555-111-2222", "(55) 5111 2222",
 * "+52 55 5111 2222"), así que hay que limpiarlos antes de meterlos en una URL.
 */
export function aNumeroWhatsApp(telefono: string, lada = LADA_POR_DEFECTO): string | null {
  const digitos = (telefono || "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  // Ya viene con país si empieza por la lada y es más largo que un número nacional.
  if (digitos.startsWith(lada) && digitos.length > 10) return digitos;
  if (digitos.length > 10) return digitos;
  return `${lada}${digitos}`;
}

export function textoRecordatorio({
  nombre,
  fecha,
  hora,
  centro = "Mevak Beauty Center",
}: {
  nombre?: string | null;
  fecha: string;
  hora: string;
  centro?: string;
}): string {
  const saludo = nombre?.trim() ? `Hola ${nombre.trim().split(" ")[0]}` : "Hola";
  return `${saludo}, te recordamos tu cita en ${centro} el ${fecha} a las ${hora}. ` +
    `Si necesitas cambiarla, contéstanos por aquí.`;
}

/** La URL que abre WhatsApp con el mensaje puesto, o `null` si el teléfono no sirve. */
export function enlaceRecordatorio(opciones: {
  telefono: string;
  nombre?: string | null;
  fecha: string;
  hora: string;
  centro?: string;
}): string | null {
  const numero = aNumeroWhatsApp(opciones.telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(textoRecordatorio(opciones))}`;
}
