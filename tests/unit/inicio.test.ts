/**
 * La lógica del tablero de inicio, con la hora fija (plan p008).
 *
 * Todas las fechas van en hora local sin zona, como las guarda la API: así los tests
 * dan lo mismo en cualquier zona horaria. El 19 de septiembre de 2026 es sábado.
 */
import {
  ahoraYSiguiente, citasVisibles, cumpleanosProximos, duracionTexto, haceCuanto, horaISO, huecosLibres,
  minutosEntre, nombreDia, resumenDelDia, siguienteDiaAbierto,
  type BloqueoInicio, type CitaInicio, type HorarioDia,
} from "@/lib/inicio";

const LUNES = "2026-09-21";
const SABADO = "2026-09-19";
const DOMINGO = "2026-09-20";

const cita = (id: string, inicio: string, fin: string, over: Partial<CitaInicio> = {}): CitaInicio => ({
  id, dateTimeStart: inicio, dateTimeEnd: fin, staffId: "u1", status: "SCHEDULED", ...over,
});

const bloqueo = (id: string, inicio: string, fin: string, userId: string | null): BloqueoInicio => ({
  id, startDateTime: inicio, endDateTime: fin, userId,
});

/** El de fábrica: L-V 9 a 19, sábado 9 a 15, domingo cerrado. */
const HORARIO: HorarioDia[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: weekday !== 0,
  opensAt: "09:00",
  closesAt: weekday === 6 ? "15:00" : "19:00",
}));

const a = (clave: string, hora: string) => new Date(`${clave}T${hora}:00`);

describe("textos de tiempo", () => {
  it("dice las duraciones como una persona", () => {
    expect(duracionTexto(25)).toBe("25 min");
    expect(duracionTexto(60)).toBe("1 h");
    expect(duracionTexto(65)).toBe("1 h 5 min");
    expect(duracionTexto(-3)).toBe("0 min");
  });

  it("cuenta los minutos entre dos horas", () => {
    expect(minutosEntre(a(LUNES, "10:35"), a(LUNES, "11:00"))).toBe(25);
  });

  it("saca la hora de un ISO local y no revienta con basura", () => {
    expect(horaISO(`${LUNES}T09:05:00`)).toBe("09:05");
    expect(horaISO("no es fecha")).toBe("");
  });

  it("nombra el día: hoy, mañana o el de la semana", () => {
    expect(nombreDia(SABADO, SABADO)).toBe("hoy");
    expect(nombreDia(DOMINGO, SABADO)).toBe("mañana");
    expect(nombreDia(LUNES, SABADO)).toBe("el lunes");
  });
});

describe("qué citas ve cada rol", () => {
  const citas = [cita("mia", "", "", { staffId: "u2" }), cita("ajena", "", "", { staffId: "u1" })];

  it("la facialista, solo las suyas", () => {
    expect(citasVisibles(citas, "FACIALIST", "u2").map((c) => c.id)).toEqual(["mia"]);
  });

  // Deuda §27: la recepcionista nunca es la profesional de una cita.
  it("recepción y la dueña, todas", () => {
    expect(citasVisibles(citas, "RECEPTION", "u9")).toHaveLength(2);
    expect(citasVisibles(citas, "OWNER", "u1")).toHaveLength(2);
  });
});

describe("ahora y siguiente", () => {
  const ahora = a(LUNES, "10:35");

  it("la de las 10 está en curso y la de las 11 es la siguiente", () => {
    const r = ahoraYSiguiente([
      cita("once", `${LUNES}T11:00:00`, `${LUNES}T12:00:00`),
      cita("diez", `${LUNES}T10:00:00`, `${LUNES}T11:00:00`),
    ], ahora);

    expect(r.enCurso.map((c) => c.id)).toEqual(["diez"]);
    expect(r.siguiente?.id).toBe("once");
    expect(r.despues).toBe(0);
  });

  it("cuenta las que quedan después de la siguiente", () => {
    const r = ahoraYSiguiente([
      cita("once", `${LUNES}T11:00:00`, `${LUNES}T12:00:00`),
      cita("doce", `${LUNES}T12:00:00`, `${LUNES}T13:00:00`),
      cita("cinco", `${LUNES}T17:00:00`, `${LUNES}T18:00:00`),
    ], ahora);

    expect(r.siguiente?.id).toBe("once");
    expect(r.despues).toBe(2);
  });

  it("dos cabinas a la vez: las dos están en curso", () => {
    const r = ahoraYSiguiente([
      cita("laser", `${LUNES}T10:00:00`, `${LUNES}T11:00:00`, { staffId: "u1" }),
      cita("facial", `${LUNES}T10:30:00`, `${LUNES}T11:30:00`, { staffId: "u2" }),
    ], ahora);

    expect(r.enCurso.map((c) => c.id)).toEqual(["laser", "facial"]);
  });

  it("una cobrada sigue en curso: la clienta sigue en la cabina", () => {
    const r = ahoraYSiguiente([cita("pagada", `${LUNES}T10:00:00`, `${LUNES}T11:00:00`, { status: "DONE" })], ahora);
    expect(r.enCurso).toHaveLength(1);
  });

  it("las canceladas y las que no llegaron no están ni en curso ni por venir", () => {
    const r = ahoraYSiguiente([
      cita("cancelada", `${LUNES}T10:00:00`, `${LUNES}T11:00:00`, { status: "CANCELLED" }),
      cita("no-vino", `${LUNES}T12:00:00`, `${LUNES}T13:00:00`, { status: "NO_SHOW" }),
    ], ahora);

    expect(r.enCurso).toHaveLength(0);
    expect(r.siguiente).toBeNull();
  });

  it("la que llegó antes de hora cuenta como siguiente; una ya cobrada, no", () => {
    const r = ahoraYSiguiente([
      cita("cobrada", `${LUNES}T11:00:00`, `${LUNES}T12:00:00`, { status: "DONE" }),
      cita("llego", `${LUNES}T12:00:00`, `${LUNES}T13:00:00`, { status: "ARRIVED" }),
    ], ahora);

    expect(r.siguiente?.id).toBe("llego");
  });

  it("la que termina justo ahora ya no está en curso", () => {
    const r = ahoraYSiguiente([cita("diez", `${LUNES}T10:00:00`, `${LUNES}T10:35:00`)], ahora);
    expect(r.enCurso).toHaveLength(0);
  });
});

describe("resumen del día", () => {
  it("cuenta cada estado y deja fuera las canceladas del total", () => {
    const r = resumenDelDia([
      cita("1", "", "", { status: "SCHEDULED" }),
      cita("2", "", "", { status: "ARRIVED" }),
      cita("3", "", "", { status: "DONE" }),
      cita("4", "", "", { status: "NO_SHOW" }),
      cita("5", "", "", { status: "CANCELLED" }),
    ]);

    expect(r).toEqual({ total: 4, porAtender: 2, atendidas: 1, esperando: 1, noLlegaron: 1 });
  });
});

describe("siguiente día que abre", () => {
  it("un sábado, el lunes: el domingo cierra", () => {
    expect(siguienteDiaAbierto(SABADO, HORARIO)).toBe(LUNES);
  });

  it("un jueves, el viernes", () => {
    expect(siguienteDiaAbierto("2026-09-17", HORARIO)).toBe("2026-09-18");
  });

  it("sin horario cargado, mañana", () => {
    expect(siguienteDiaAbierto(SABADO, [])).toBe(DOMINGO);
  });

  it("si no abre ningún día, ninguno", () => {
    expect(siguienteDiaAbierto(SABADO, HORARIO.map((h) => ({ ...h, open: false })))).toBeNull();
  });
});

describe("huecos libres", () => {
  const profesionales = [{ id: "u1", name: "Dueña" }, { id: "u2", name: "Lucía" }];
  const citas = [
    cita("d1", `${LUNES}T11:00:00`, `${LUNES}T12:00:00`, { staffId: "u1" }),
    cita("d2", `${LUNES}T12:00:00`, `${LUNES}T13:00:00`, { staffId: "u1" }),
    cita("d3", `${LUNES}T16:00:00`, `${LUNES}T17:00:00`, { staffId: "u1", status: "CANCELLED" }),
    cita("l1", `${LUNES}T10:00:00`, `${LUNES}T11:30:00`, { staffId: "u2" }),
  ];
  const bloqueos = [
    bloqueo("centro", `${LUNES}T14:00:00`, `${LUNES}T15:00:00`, null),
    bloqueo("lucia", `${LUNES}T17:00:00`, `${LUNES}T19:00:00`, "u2"),
  ];

  const huecosDe = (r: ReturnType<typeof huecosLibres>, id: string) =>
    r.porProfesional.find((p) => p.profesional.id === id)?.huecos.map((h) => `${h.inicio}-${h.fin}`);

  it("de ahora al cierre, sin pisar citas ni bloqueos, por profesional", () => {
    const r = huecosLibres({ dia: LUNES, ahora: a(LUNES, "10:37"), horario: HORARIO, profesionales, citas, bloqueos });

    // 10:45-11:00 son 15 min: no llega al mínimo. La cancelada de las 16 no ocupa.
    expect(huecosDe(r, "u1")).toEqual(["13:00-14:00", "15:00-19:00"]);
    // El bloqueo del centro también es suyo; el de las 17 es solo de ella.
    expect(huecosDe(r, "u2")).toEqual(["11:30-14:00", "15:00-17:00"]);
  });

  it("empieza en un cuarto de hora redondo, no a la hora exacta de ahora", () => {
    const r = huecosLibres({ dia: LUNES, ahora: a(LUNES, "13:02"), horario: HORARIO, profesionales, citas, bloqueos });
    expect(huecosDe(r, "u1")?.[0]).toBe("13:15-14:00");
  });

  it("antes de abrir, cuenta desde la apertura", () => {
    const r = huecosLibres({ dia: LUNES, ahora: a(LUNES, "07:00"), horario: HORARIO, profesionales, citas: [], bloqueos: [] });
    expect(huecosDe(r, "u1")).toEqual(["09:00-19:00"]);
    expect(r.porProfesional[0].huecos[0].minutos).toBe(600);
  });

  it("el mínimo se puede cambiar", () => {
    const r = huecosLibres({
      dia: LUNES, ahora: a(LUNES, "10:37"), horario: HORARIO, profesionales, citas, bloqueos, minimo: 15,
    });
    expect(huecosDe(r, "u1")?.[0]).toBe("10:45-11:00");
  });

  it("un bloqueo que empezó ayer y acaba hoy también ocupa", () => {
    const r = huecosLibres({
      dia: LUNES, ahora: a(LUNES, "07:00"), horario: HORARIO, profesionales: [profesionales[0]], citas: [],
      bloqueos: [bloqueo("vacaciones", "2026-09-18T09:00:00", `${LUNES}T12:00:00`, "u1")],
    });
    expect(huecosDe(r, "u1")).toEqual(["12:00-19:00"]);
  });

  it("el domingo el centro está cerrado", () => {
    const r = huecosLibres({ dia: DOMINGO, ahora: a(DOMINGO, "10:00"), horario: HORARIO, profesionales, citas: [], bloqueos: [] });
    expect(r).toEqual({ cerrado: true, terminado: false, porProfesional: [] });
  });

  it("pasada la hora de cierre ya no queda nada", () => {
    const r = huecosLibres({ dia: SABADO, ahora: a(SABADO, "15:05"), horario: HORARIO, profesionales, citas: [], bloqueos: [] });
    expect(r).toEqual({ cerrado: false, terminado: true, porProfesional: [] });
  });

  it("una profesional con el día lleno sale sin huecos", () => {
    const r = huecosLibres({
      dia: SABADO, ahora: a(SABADO, "09:00"), horario: HORARIO, profesionales: [profesionales[0]], bloqueos: [],
      citas: [cita("todo", `${SABADO}T09:00:00`, `${SABADO}T15:00:00`)],
    });
    expect(r.porProfesional[0].huecos).toEqual([]);
  });
});

describe("cumpleaños", () => {
  const cliente = (id: string, birthDate?: string | null) => ({ id, fullName: `Clienta ${id}`, birthDate });

  it("los de los próximos 7 días, empezando por hoy, con la edad que cumplen", () => {
    const r = cumpleanosProximos([
      cliente("dentro-de-6", "1995-09-25"),
      cliente("hoy", "1990-09-19"),
      cliente("dentro-de-7", "1995-09-26"),
      cliente("ayer", "1990-09-18"),
    ], SABADO);

    expect(r.map((c) => [c.cliente.id, c.enDias, c.edad])).toEqual([
      ["hoy", 0, 36],
      ["dentro-de-6", 6, 31],
    ]);
    expect(r[0].dia).toBe(SABADO);
  });

  it("solo cuentan las fechas AAAA-MM-DD que existen", () => {
    const r = cumpleanosProximos([
      cliente("barras", "19/09/1990"),
      cliente("vacia", ""),
      cliente("sin", undefined),
      cliente("nula", null),
      cliente("31-de-abril", "1990-04-31"),
      cliente("mes-13", "1990-13-01"),
    ], "2026-04-28");

    expect(r).toEqual([]);
  });

  it("a fin de año, los de enero", () => {
    const r = cumpleanosProximos([cliente("enero", "2000-01-02")], "2026-12-29");
    expect(r.map((c) => [c.dia, c.enDias, c.edad])).toEqual([["2027-01-02", 4, 27]]);
  });

  it("quien nació un 29 de febrero lo celebra el 28 si el año no es bisiesto", () => {
    const r = cumpleanosProximos([cliente("bisiesta", "2000-02-29")], "2027-02-25");
    expect(r.map((c) => c.dia)).toEqual(["2027-02-28"]);
  });

  it("sin un año creíble no dice la edad", () => {
    const r = cumpleanosProximos([cliente("sin-anio", "0001-09-19")], SABADO);
    expect(r[0].edad).toBeNull();
  });
});

describe("hace cuánto", () => {
  it.each([
    [`${SABADO}T10:00:00`, "hoy"],
    ["2026-09-18T10:00:00", "ayer"],
    ["2026-09-14T10:00:00", "hace 5 días"],
    ["2026-08-29T10:00:00", "hace 3 semanas"],
    ["2026-07-10T10:00:00", "hace 2 meses"],
    ["2025-09-01T10:00:00", "hace 1 año"],
    ["2023-09-01T10:00:00", "hace 3 años"],
  ])("%s → %s", (iso, texto) => {
    expect(haceCuanto(iso, SABADO)).toBe(texto);
  });

  // Un ISO con zona (un pago) se lee en hora local, no por su prefijo UTC (ADR-0004).
  it("un ISO con Z cuenta por su día local", () => {
    const tarde = new Date(2026, 8, 18, 23, 30); // viernes 18 a las 23:30, hora local
    expect(haceCuanto(tarde.toISOString(), SABADO)).toBe("ayer");
  });
});
