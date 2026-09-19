/**
 * El día de la app se calcula en local, no en UTC.
 *
 * Este fichero existe por un fallo que se veía todas las tardes y que no se ve leyendo
 * el código: `dateKey()` era `toISOString().split("T")[0]` —día UTC— mientras que las
 * citas se guardan en hora local sin zona y el servidor las filtra por prefijo de texto.
 * En México (UTC−6) las dos cosas dejaban de coincidir a las 18:00. Deuda §26, ADR-0004.
 */
import {
  ahoraClave,
  aISOLocal,
  claveDiaISO,
  claveDiaLocal,
  desdeClave,
  esFechaValida,
  sumarDias,
} from "@/lib/fecha";

/** Node ≥ 16 relee `process.env.TZ` en cada `new Date()`, así que esto es suficiente. */
const TZ_ORIGINAL = process.env.TZ;

describe("claveDiaLocal", () => {
  it("devuelve el día del reloj local", () => {
    expect(claveDiaLocal(new Date(2026, 8, 18, 19, 30))).toBe("2026-09-18");
  });

  it("rellena mes y día a dos dígitos", () => {
    expect(claveDiaLocal(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });
});

describe("en horario del centro (México, UTC−6)", () => {
  beforeAll(() => {
    process.env.TZ = "America/Mexico_City";
  });
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  /** El caso exacto que rompía la app: a las 19:30 del viernes 18. */
  it("a las 19:30 el día sigue siendo hoy, no mañana", () => {
    const tarde = new Date(2026, 8, 18, 19, 30);

    expect(claveDiaLocal(tarde)).toBe("2026-09-18");
    // Lo que hacía antes, para que se vea de dónde salía el día de más:
    expect(tarde.toISOString().slice(0, 10)).toBe("2026-09-19");
  });

  it("una cita de las 19:00 cae en el día que la app consulta", () => {
    const tarde = new Date(2026, 8, 18, 19, 30);
    const cita = aISOLocal("2026-09-18", "19:00");

    // El filtro del servidor es exactamente esto: `dateTimeStart.startsWith(date)`.
    expect(cita.startsWith(claveDiaLocal(tarde))).toBe(true);
  });

  it("la medianoche pertenece al día que empieza", () => {
    expect(claveDiaLocal(new Date(2026, 8, 19, 0, 1))).toBe("2026-09-19");
  });
});

describe("claveDiaISO", () => {
  it("de una fecha sin zona toma el prefijo tal cual", () => {
    expect(claveDiaISO("2026-09-18T19:00:00")).toBe("2026-09-18");
  });

  it("de una fecha con Z convierte al reloj local", () => {
    process.env.TZ = "America/Mexico_City";
    // Medianoche y media UTC del 19 = 18:30 del 18 en el centro.
    expect(claveDiaISO("2026-09-19T00:30:00.000Z")).toBe("2026-09-18");
    process.env.TZ = TZ_ORIGINAL;
  });

  it("de una fecha con offset explícito también", () => {
    process.env.TZ = "America/Mexico_City";
    expect(claveDiaISO("2026-09-18T19:00:00-06:00")).toBe("2026-09-18");
    process.env.TZ = TZ_ORIGINAL;
  });
});

describe("desdeClave", () => {
  it("interpreta la clave en local, no en UTC", () => {
    process.env.TZ = "America/Mexico_City";
    const d = desdeClave("2026-09-18");

    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    // Sin el mediodía, `new Date("2026-09-18")` sería medianoche UTC = el día 17 aquí.
    expect(d.getDate()).toBe(18);
    process.env.TZ = TZ_ORIGINAL;
  });
});

describe("sumarDias", () => {
  it("avanza y retrocede sin pasar por UTC", () => {
    expect(sumarDias("2026-09-18", 1)).toBe("2026-09-19");
    expect(sumarDias("2026-09-18", -1)).toBe("2026-09-17");
  });

  it("cruza el cambio de mes", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("cruza el 29 de febrero de un año bisiesto", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("aISOLocal", () => {
  it("compone lo que se guarda, sin zona", () => {
    expect(aISOLocal("2026-09-18", "19:00")).toBe("2026-09-18T19:00:00");
  });
});

describe("esFechaValida", () => {
  it.each([
    ["2026-09-18T10:00:00", true],
    ["2026-09-18", true],
    ["18/09/2026T10:00:00", false],
    ["", false],
    ["   ", false],
    ["cualquier cosa", false],
  ])("%s → %s", (valor, esperado) => {
    expect(esFechaValida(valor)).toBe(esperado);
  });

  it("rechaza lo que no es una cadena", () => {
    expect(esFechaValida(undefined)).toBe(false);
    expect(esFechaValida(null)).toBe(false);
    expect(esFechaValida(20260918)).toBe(false);
  });
});

describe("ahoraClave", () => {
  it("es el día local de este instante", () => {
    expect(ahoraClave()).toBe(claveDiaLocal(new Date()));
  });
});
