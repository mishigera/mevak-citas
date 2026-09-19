/**
 * Lo que calcula la pantalla de inicio, sin React ni red (plan p008).
 *
 * El inicio junta datos que ya existen —las citas de hoy, el horario del centro, los
 * bloqueos, el staff, las clientas— y los mira desde "ahora": qué está pasando, qué
 * sigue, qué huecos quedan. Todo eso son cuentas con fechas, y aquí se pueden probar
 * con la hora fija, que en una pantalla no se puede.
 *
 * Las citas y los bloqueos vienen en hora local del centro y sin zona
 * (`"2026-09-19T10:00:00"`): `new Date()` los lee como locales, que es lo que son. El
 * día, como en toda la app, sale de `lib/fecha.ts` y nunca de `toISOString()` (ADR-0004).
 */
import { claveDiaLocal, desdeClave, sumarDias } from "@/lib/fecha";

export type CitaInicio = {
  id: string;
  dateTimeStart: string;
  dateTimeEnd: string;
  staffId: string;
  clientId?: string;
  type?: string;
  status: string;
  confirmedAt?: string | null;
  client?: { id?: string; fullName?: string | null; phone?: string | null } | null;
  staff?: { id?: string; name?: string | null } | null;
  services?: ({ name?: string | null } | null)[] | null;
};

export type HorarioDia = { weekday: number; open: boolean; opensAt: string; closesAt: string };

export type BloqueoInicio = {
  id: string;
  /** `null` es el centro entero. */
  userId: string | null;
  startDateTime: string;
  endDateTime: string;
  reason?: string | null;
};

export type Profesional = { id: string; name: string; role?: string };

export type ClienteCumple = {
  id: string;
  fullName: string;
  phone?: string | null;
  birthDate?: string | null;
};

const MINUTO = 60_000;

/** Las que ya no ocupan a nadie: ni cuentan en el día ni tapan un hueco. */
const ANULADAS = new Set(["CANCELLED", "NO_SHOW"]);

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** `"10:05"`, con el reloj local. Sin `toLocaleTimeString`, que cambia según el motor. */
export function horaDe(d: Date): string {
  return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/** Hora de un ISO de la API, `"10:05"`; vacío si no es una fecha. */
export function horaISO(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : horaDe(d);
}

/** Cuánto falta o cuánto dura, como lo diría una persona: `"25 min"`, `"1 h"`, `"1 h 5 min"`. */
export function duracionTexto(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}

/** `"$4,300"`. Los importes de la app son enteros, sin centavos. */
export function dinero(cantidad = 0): string {
  return `$${Math.round(cantidad).toLocaleString("es-MX")}`;
}

export function minutosEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MINUTO);
}

/** Qué citas le tocan a quien mira: la facialista, las suyas; la dueña y recepción, todas (§27). */
export function citasVisibles<T extends { staffId: string }>(
  citas: T[],
  rol: string | undefined,
  userId: string | undefined,
): T[] {
  return rol === "FACIALIST" ? citas.filter((c) => c.staffId === userId) : citas;
}

// ---------------------------------------------------------------- Ahora y siguiente

export type AhoraYSiguiente = {
  /** Las que están ocurriendo: puede haber una por cabina. */
  enCurso: CitaInicio[];
  /** La próxima que empieza, de quien sea. */
  siguiente: CitaInicio | null;
  /** Las que quedan hoy después de la siguiente. */
  despues: number;
};

/**
 * La cita en curso es la que ya empezó y no ha terminado, aunque ya esté cobrada: la
 * clienta sigue en la cabina. La siguiente es la primera que empieza después de ahora y
 * sigue abierta (agendada o, si llegó antes de hora, esperando).
 */
export function ahoraYSiguiente(citas: CitaInicio[], ahora: Date): AhoraYSiguiente {
  const t = ahora.getTime();
  const vivas = citas
    .filter((c) => !ANULADAS.has(c.status))
    .sort((a, b) => a.dateTimeStart.localeCompare(b.dateTimeStart));

  const enCurso = vivas.filter(
    (c) => new Date(c.dateTimeStart).getTime() <= t && t < new Date(c.dateTimeEnd).getTime(),
  );
  const porVenir = vivas.filter(
    (c) => new Date(c.dateTimeStart).getTime() > t && (c.status === "SCHEDULED" || c.status === "ARRIVED"),
  );

  return { enCurso, siguiente: porVenir[0] ?? null, despues: Math.max(0, porVenir.length - 1) };
}

// ---------------------------------------------------------------- Resumen del día

export type ResumenDia = {
  /** Todas menos las canceladas. */
  total: number;
  /** Agendadas o esperando: aún hay que atenderlas. */
  porAtender: number;
  /** Cobradas. */
  atendidas: number;
  /** Esperando en recepción. */
  esperando: number;
  noLlegaron: number;
};

export function resumenDelDia(citas: CitaInicio[]): ResumenDia {
  const contar = (estado: string) => citas.filter((c) => c.status === estado).length;
  return {
    total: citas.filter((c) => c.status !== "CANCELLED").length,
    porAtender: contar("SCHEDULED") + contar("ARRIVED"),
    atendidas: contar("DONE"),
    esperando: contar("ARRIVED"),
    noLlegaron: contar("NO_SHOW"),
  };
}

// ---------------------------------------------------------------- Horario

/** La fila del horario de ese día, o `null` si el día no abre o no hay horario. */
export function horarioDelDia(dia: string, horario: HorarioDia[]): HorarioDia | null {
  const fila = horario.find((h) => h.weekday === desdeClave(dia).getDay());
  return fila?.open ? fila : null;
}

/**
 * El siguiente día, después de `desde`, en que abre el centro. Un sábado da el lunes.
 *
 * Sin horario cargado se asume que mañana abre, que es lo que haría cualquiera; si el
 * horario dice que no abre ningún día, `null`.
 */
export function siguienteDiaAbierto(desde: string, horario: HorarioDia[]): string | null {
  if (horario.length === 0) return sumarDias(desde, 1);
  for (let i = 1; i <= 7; i++) {
    const dia = sumarDias(desde, i);
    if (horarioDelDia(dia, horario)) return dia;
  }
  return null;
}

// ---------------------------------------------------------------- Huecos

export type Hueco = {
  /** `"12:00"`: lo que se le pasa a Nueva cita. */
  inicio: string;
  fin: string;
  minutos: number;
};

export type HuecosProfesional = { profesional: Profesional; huecos: Hueco[] };

export type HuecosDelDia = {
  /** El centro no abre ese día. */
  cerrado: boolean;
  /** Ya pasó la hora de cierre: no queda nada que ofrecer. */
  terminado: boolean;
  porProfesional: HuecosProfesional[];
};

/** Un hueco empieza en un cuarto de hora redondo, no a las 10:37. */
const REDONDEO_MINUTOS = 15;

function redondearArriba(d: Date, minutos: number): Date {
  const paso = minutos * MINUTO;
  return new Date(Math.ceil(d.getTime() / paso) * paso);
}

/**
 * Los tramos libres de cada profesional, desde ahora hasta el cierre.
 *
 * Ocupa a una profesional cualquier cita suya que no esté cancelada ni marcada como no
 * llegó, sus bloqueos y los del centro (`userId: null`). Lo que queda, si dura al menos
 * `minimo` minutos, es un hueco.
 */
export function huecosLibres({
  dia,
  ahora,
  horario,
  profesionales,
  citas,
  bloqueos,
  minimo = 30,
}: {
  dia: string;
  ahora: Date;
  horario: HorarioDia[];
  profesionales: Profesional[];
  citas: CitaInicio[];
  bloqueos: BloqueoInicio[];
  minimo?: number;
}): HuecosDelDia {
  const fila = horarioDelDia(dia, horario);
  if (!fila) return { cerrado: true, terminado: false, porProfesional: [] };

  const apertura = new Date(`${dia}T${fila.opensAt}:00`).getTime();
  const cierre = new Date(`${dia}T${fila.closesAt}:00`).getTime();
  const desde = Math.max(apertura, redondearArriba(ahora, REDONDEO_MINUTOS).getTime());
  if (desde >= cierre) return { cerrado: false, terminado: true, porProfesional: [] };

  const porProfesional = profesionales.map((profesional) => {
    const ocupado = [
      ...citas
        .filter((c) => c.staffId === profesional.id && !ANULADAS.has(c.status))
        .map((c) => [new Date(c.dateTimeStart).getTime(), new Date(c.dateTimeEnd).getTime()]),
      ...bloqueos
        .filter((b) => b.userId === null || b.userId === profesional.id)
        .map((b) => [new Date(b.startDateTime).getTime(), new Date(b.endDateTime).getTime()]),
    ]
      // Recortados al tramo que interesa; lo que cae fuera no ocupa nada.
      .map(([a, b]) => [Math.max(a, desde), Math.min(b, cierre)])
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);

    const huecos: Hueco[] = [];
    let cursor = desde;
    for (const [a, b] of ocupado) {
      if (a > cursor) huecos.push(hueco(cursor, a));
      cursor = Math.max(cursor, b);
    }
    if (cierre > cursor) huecos.push(hueco(cursor, cierre));

    return { profesional, huecos: huecos.filter((h) => h.minutos >= minimo) };
  });

  return { cerrado: false, terminado: false, porProfesional };
}

function hueco(desde: number, hasta: number): Hueco {
  return {
    inicio: horaDe(new Date(desde)),
    fin: horaDe(new Date(hasta)),
    minutos: Math.round((hasta - desde) / MINUTO),
  };
}

// ---------------------------------------------------------------- Cumpleaños

export type Cumpleanos = {
  cliente: ClienteCumple;
  /** El día en que cae, `"2026-09-21"`. */
  dia: string;
  /** 0 es hoy. */
  enDias: number;
  /** Los que cumple, si el año de nacimiento es creíble. */
  edad: number | null;
};

const FECHA_NACIMIENTO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Las clientas que cumplen años en los próximos `dias` días, empezando por hoy.
 *
 * La fecha de nacimiento es texto libre en la ficha, así que solo cuentan las que
 * tienen forma `AAAA-MM-DD` y existen. Quien nació un 29 de febrero lo celebra el 28 en
 * los años que no son bisiestos.
 */
export function cumpleanosProximos(clientes: ClienteCumple[], hoy: string, dias = 7): Cumpleanos[] {
  const base = desdeClave(hoy);
  const resultado: Cumpleanos[] = [];

  for (const cliente of clientes) {
    const m = FECHA_NACIMIENTO.exec(cliente.birthDate?.trim() ?? "");
    if (!m) continue;
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;

    for (const anioCumple of [base.getFullYear(), base.getFullYear() + 1]) {
      const ultimoDelMes = new Date(anioCumple, mes, 0).getDate();
      if (dia > ultimoDelMes && !(mes === 2 && dia === 29)) break; // 31 de abril: no existe
      const fecha = new Date(anioCumple, mes - 1, Math.min(dia, ultimoDelMes), 12);
      const enDias = Math.round((fecha.getTime() - base.getTime()) / (24 * 60 * MINUTO));
      if (enDias < 0) continue;
      if (enDias < dias) {
        const edad = anioCumple - anio;
        resultado.push({
          cliente,
          dia: claveDiaLocal(fecha),
          enDias,
          edad: anio > 1900 && edad > 0 && edad < 120 ? edad : null,
        });
      }
      break;
    }
  }

  return resultado.sort((a, b) => a.enDias - b.enDias || a.cliente.fullName.localeCompare(b.cliente.fullName));
}

// ---------------------------------------------------------------- Textos de día

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `"lunes 21 de septiembre"`. Sin la coma que mete `toLocaleDateString` en es-MX. */
export function diaConFecha(dia: string): string {
  const d = desdeClave(dia);
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** `"hoy"`, `"mañana"` o el nombre del día: `"el lunes"`. Para días de la semana que viene. */
export function nombreDia(dia: string, hoy: string): string {
  if (dia === hoy) return "hoy";
  if (dia === sumarDias(hoy, 1)) return "mañana";
  return `el ${DIAS_SEMANA[desdeClave(dia).getDay()]}`;
}
