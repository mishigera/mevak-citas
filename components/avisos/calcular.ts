/**
 * De dónde salen los avisos.
 *
 * La app **no tiene notificaciones** ni un endpoint que las sirva, y este plan no añade
 * ninguno. Lo que hay son datos que ya se cargan para otras pantallas y que, mirados
 * juntos, dicen algo útil: una cita que empieza en diez minutos, una clienta esperando
 * en recepción, una cita que terminó y nadie cerró, un pago por liquidar.
 *
 * Por eso esto es una función pura: entran las tres listas y la hora, sale la lista de
 * avisos. Sin red, sin estado, y comprobable de un vistazo en los tests.
 */
import { Colors } from "@/constants/colors";

export type TipoAviso = "PROXIMA" | "ESPERANDO" | "SIN_CERRAR" | "PAGO_PENDIENTE" | "BLOQUEO";

export type Aviso = {
  /** Estable entre recargas: es lo que recuerda si ya se leyó. */
  id: string;
  tipo: TipoAviso;
  titulo: string;
  detalle: string;
  /** ISO. Ordena la lista y decide en qué día cae. */
  fecha: string;
  icono: string;
  color: string;
  /** A dónde lleva al tocarlo. */
  ruta?: string;
};

export type CitaAviso = {
  id: string;
  dateTimeStart: string;
  dateTimeEnd: string;
  status: string;
  client?: { fullName?: string | null } | null;
  staff?: { name?: string | null } | null;
};

export type PagoAviso = {
  id: string;
  facialistNetAmount?: number;
  createdAt?: string;
  appointment?: { id?: string; dateTimeStart?: string } | null;
  staff?: { name?: string | null } | null;
  client?: { fullName?: string | null } | null;
};

export type BloqueoAviso = {
  id: string;
  startDateTime: string;
  endDateTime: string;
  reason?: string | null;
};

/** Una cita entra en "próxima" cuando faltan 30 minutos o menos. */
export const MINUTOS_PROXIMA = 30;

const MINUTO = 60_000;

function hora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function nombreCliente(c?: { fullName?: string | null } | null): string {
  return c?.fullName?.trim() || "Cliente";
}

function dinero(cantidad = 0): string {
  return `$${Math.round(cantidad).toLocaleString("es-MX")}`;
}

/** La misma clave de día que usan el inicio y la agenda: el día en UTC del ISO. */
export function claveDia(iso: string): string {
  return iso.slice(0, 10);
}

export function calcularAvisos({
  citas = [],
  pagos = [],
  bloqueos = [],
  ahora = new Date(),
}: {
  citas?: CitaAviso[];
  pagos?: PagoAviso[];
  bloqueos?: BloqueoAviso[];
  ahora?: Date;
}): Aviso[] {
  const avisos: Aviso[] = [];
  const t = ahora.getTime();

  for (const cita of citas) {
    const inicio = new Date(cita.dateTimeStart).getTime();
    const fin = new Date(cita.dateTimeEnd).getTime();
    const cliente = nombreCliente(cita.client);
    const ruta = `/appointment/${cita.id}`;

    if (cita.status === "SCHEDULED" && inicio >= t && inicio - t <= MINUTOS_PROXIMA * MINUTO) {
      const minutos = Math.max(1, Math.round((inicio - t) / MINUTO));
      avisos.push({
        id: `PROXIMA-${cita.id}`,
        tipo: "PROXIMA",
        titulo: `Cita en ${minutos} min`,
        detalle: `${cliente} · ${hora(cita.dateTimeStart)}`,
        fecha: cita.dateTimeStart,
        icono: "time-outline",
        color: Colors.statusColors.SCHEDULED,
        ruta,
      });
      continue;
    }

    if (cita.status === "ARRIVED") {
      avisos.push({
        id: `ESPERANDO-${cita.id}`,
        tipo: "ESPERANDO",
        titulo: `${cliente} está esperando`,
        detalle: `Cita de las ${hora(cita.dateTimeStart)}`,
        fecha: cita.dateTimeStart,
        icono: "hand-left-outline",
        color: Colors.statusColors.ARRIVED,
        ruta,
      });
      continue;
    }

    // Terminó hace rato y sigue abierta: o se cobró y no se marcó, o no vino nadie.
    if ((cita.status === "SCHEDULED" || cita.status === "ARRIVED") && fin < t) {
      avisos.push({
        id: `SIN_CERRAR-${cita.id}`,
        tipo: "SIN_CERRAR",
        titulo: "Cita sin cerrar",
        detalle: `${cliente} · terminó a las ${hora(cita.dateTimeEnd)}`,
        fecha: cita.dateTimeEnd,
        icono: "alert-circle-outline",
        color: Colors.warning,
        ruta,
      });
    }
  }

  for (const pago of pagos) {
    if (!pago.facialistNetAmount) continue;
    const quien = pago.staff?.name?.trim() || "la facialista";
    avisos.push({
      id: `PAGO_PENDIENTE-${pago.id}`,
      tipo: "PAGO_PENDIENTE",
      titulo: `Falta liquidar a ${quien}`,
      detalle: `${dinero(pago.facialistNetAmount)} · ${nombreCliente(pago.client)}`,
      fecha: pago.createdAt || pago.appointment?.dateTimeStart || new Date(0).toISOString(),
      icono: "cash-outline",
      color: Colors.accent,
      ruta: "/admin/payments",
    });
  }

  for (const bloqueo of bloqueos) {
    const inicio = new Date(bloqueo.startDateTime).getTime();
    const fin = new Date(bloqueo.endDateTime).getTime();
    // Solo interesa el bloqueo que afecta a lo que queda de hoy.
    if (fin < t || claveDia(bloqueo.startDateTime) !== claveDia(ahora.toISOString())) continue;
    const motivo = bloqueo.reason?.trim();
    avisos.push({
      id: `BLOQUEO-${bloqueo.id}`,
      tipo: "BLOQUEO",
      titulo: inicio <= t ? "Agenda bloqueada ahora" : "Agenda bloqueada hoy",
      detalle: `${hora(bloqueo.startDateTime)} a ${hora(bloqueo.endDateTime)}${motivo ? ` · ${motivo}` : ""}`,
      fecha: bloqueo.startDateTime,
      icono: "lock-closed-outline",
      color: Colors.secondary,
      ruta: "/blocks",
    });
  }

  // Orden cronológico puro. Las no leídas NO se suben al principio: eso rompería los
  // banderines de fecha (el mismo día saldría dos veces) y desordenaría la lista.
  return avisos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type GrupoAvisos = { clave: string; etiqueta: string; avisos: Aviso[] };

/** Agrupa por día conservando el orden, y nombra el día como lo diría una persona. */
export function agruparPorDia(avisos: Aviso[], ahora = new Date()): GrupoAvisos[] {
  const hoy = claveDia(ahora.toISOString());
  const ayer = claveDia(new Date(ahora.getTime() - 86_400_000).toISOString());
  const manana = claveDia(new Date(ahora.getTime() + 86_400_000).toISOString());

  const grupos: GrupoAvisos[] = [];
  for (const aviso of avisos) {
    const clave = claveDia(aviso.fecha);
    let grupo = grupos.find((g) => g.clave === clave);
    if (!grupo) {
      const etiqueta =
        clave === hoy
          ? "Hoy"
          : clave === ayer
            ? "Ayer"
            : clave === manana
              ? "Mañana"
              : new Date(`${clave}T12:00:00.000Z`).toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                });
      grupo = { clave, etiqueta, avisos: [] };
      grupos.push(grupo);
    }
    grupo.avisos.push(aviso);
  }
  return grupos;
}
