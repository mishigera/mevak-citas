/**
 * El único sitio del que sale "qué día es".
 *
 * Las citas se guardan en **hora local del centro y sin zona**
 * (`"2026-09-18T19:00:00"`), y el servidor las filtra comparando el prefijo del texto.
 * Así que el día con el que se consulta tiene que calcularse también en local.
 *
 * `new Date().toISOString().split("T")[0]` da el día en **UTC**, y en México (UTC−6) eso
 * es un día de más a partir de las 18:00: la app rotulaba "Hoy" sobre mañana y las citas
 * de la tarde desaparecían de la lista. Ver `decisiones/adr-0004` y deuda §26.
 *
 * Regla: para obtener un día **nunca** se usa `toISOString()`. Hay un test que lo fija.
 */

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** El día de una fecha según el reloj local: `"2026-09-18"`. */
export function claveDiaLocal(d: Date): string {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** El día de hoy, local. */
export function ahoraClave(): string {
  return claveDiaLocal(new Date());
}

/** El mes de una fecha, como prefijo para filtrar: `"2026-09-"`. */
export function clavemesLocal(d: Date): string {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-`;
}

/** `true` si la cadena lleva zona explícita: termina en `Z` o en `±hh:mm`. */
function tieneZona(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
}

/**
 * El día de una fecha que viene de la API.
 *
 * Conviven dos formatos y hay que tratarlos distinto:
 *
 * - **Sin zona** (`"2026-09-18T19:00:00"`) — las citas y los bloqueos, que se guardan
 *   en hora local del centro. El prefijo del texto YA es el día; pasarlo por `new Date()`
 *   no aporta nada y sí puede estropearlo.
 * - **Con zona** (`"2026-09-19T01:00:00.000Z"`) — `Payment.createdAt`, que el servidor
 *   escribe con `toISOString()`. Ahí el prefijo es el día **en UTC**, que después de las
 *   18:00 en México ya es el día siguiente: hay que convertirlo al reloj local.
 */
export function claveDiaISO(iso: string): string {
  return tieneZona(iso) ? claveDiaLocal(new Date(iso)) : iso.slice(0, 10);
}

/** Compone lo que se guarda a partir de los dos campos del formulario. */
export function aISOLocal(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00`;
}

/** Suma días a una clave de día y devuelve otra clave. Sin pasar por UTC. */
export function sumarDias(clave: string, dias: number): string {
  const d = desdeClave(clave);
  d.setDate(d.getDate() + dias);
  return claveDiaLocal(d);
}

/**
 * Una clave de día como `Date` local, al mediodía.
 *
 * El mediodía no es decorativo: `new Date("2026-09-18")` lo parsea como medianoche **UTC**
 * y en México sale el día 17 a las 18:00. Con `T12:00:00` el parseo es local y ningún
 * cambio de horario mueve el día.
 */
export function desdeClave(clave: string): Date {
  return new Date(`${clave}T12:00:00`);
}

/**
 * La forma que la app manda y la base guarda: `YYYY-MM-DD`, con hora y zona opcionales.
 *
 * Comprobar la forma **antes** de parsear no es paranoia: el parser de V8 es generoso y
 * `new Date("mañana a las 10")` devuelve una fecha real del año 2001. El servidor aplica
 * esta misma regla en `server/routes.ts`.
 */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** `true` si la cadena tiene forma de fecha y además es una fecha que existe. */
export function esFechaValida(iso: unknown): iso is string {
  if (typeof iso !== "string" || !FORMATO_FECHA.test(iso.trim())) return false;
  return !Number.isNaN(new Date(iso).getTime());
}
