jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import { buildApp, authAs, aClient, anAppointment, aBlock } from "../setup/server-harness";

const STAFF = "user-1";
const OTRO_STAFF = "user-2";

async function setup(over: Record<string, unknown[]> = {}) {
  const { app, storage } = await buildApp({
    users: [
      { id: STAFF, name: "A", email: "a@m.test", passwordHash: "h", role: "OWNER",
        isActive: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: OTRO_STAFF, name: "B", email: "b@m.test", passwordHash: "h", role: "FACIALIST",
        isActive: true, createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    clients: [aClient({ id: "client-1" })],
    ...over,
  });
  return { app, storage, token: authAs(storage, STAFF, "OWNER") };
}

const crear = (app: Express, token: string, body: object) =>
  request(app).post("/api/appointments").set("Authorization", `Bearer ${token}`).send(body);

const base = {
  dateTimeStart: "2026-10-01T10:00:00",
  dateTimeEnd: "2026-10-01T11:00:00",
  clientId: "client-1",
  staffId: STAFF,
  type: "FACIAL",
};

describe("crear cita", () => {
  it("crea con estado SCHEDULED", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, base);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "SCHEDULED", staffId: STAFF, type: "FACIAL" });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it.each([
    ["dateTimeStart", { ...base, dateTimeStart: undefined }],
    ["dateTimeEnd", { ...base, dateTimeEnd: undefined }],
    ["clientId", { ...base, clientId: undefined }],
    ["staffId", { ...base, staffId: undefined }],
    ["type", { ...base, type: undefined }],
  ])("400 si falta %s", async (_campo, body) => {
    const { app, token } = await setup();
    const res = await crear(app, token, body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/faltan campos/i);
  });
});

describe("solapamiento con otras citas", () => {
  const existente = anAppointment({
    id: "a1", staffId: STAFF, clientId: "client-1",
    dateTimeStart: "2026-10-01T10:00:00",
    dateTimeEnd: "2026-10-01T11:00:00",
  });

  it.each([
    ["encaje exacto", "10:00", "11:00"],
    ["empieza dentro", "10:30", "11:30"],
    ["termina dentro", "09:30", "10:30"],
    ["la engloba", "09:00", "12:00"],
    ["contenida dentro", "10:15", "10:45"],
  ])("409 cuando %s", async (_caso, ini, fin) => {
    const { app, token } = await setup({ appointments: [existente] });
    const res = await crear(app, token, {
      ...base,
      dateTimeStart: `2026-10-01T${ini}:00`,
      dateTimeEnd: `2026-10-01T${fin}:00`,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/conflicto de horario/i);
  });

  it.each([
    ["justo antes, pegada", "09:00", "10:00"],
    ["justo después, pegada", "11:00", "12:00"],
    ["otro día", "10:00", "11:00"],
  ])("permite %s", async (caso, ini, fin) => {
    const dia = caso === "otro día" ? "02" : "01";
    const { app, token } = await setup({ appointments: [existente] });
    const res = await crear(app, token, {
      ...base,
      dateTimeStart: `2026-10-${dia}T${ini}:00`,
      dateTimeEnd: `2026-10-${dia}T${fin}:00`,
    });

    expect(res.status).toBe(201);
  });

  it("no hay conflicto si es otro miembro del staff", async () => {
    const { app, token } = await setup({ appointments: [existente] });
    const res = await crear(app, token, { ...base, staffId: OTRO_STAFF });

    expect(res.status).toBe(201);
  });

  it("una cita CANCELLED no bloquea el horario", async () => {
    const cancelada = { ...existente, status: "CANCELLED" };
    const { app, token } = await setup({ appointments: [cancelada] });
    const res = await crear(app, token, base);

    expect(res.status).toBe(201);
  });
});

describe("solapamiento con bloqueos de disponibilidad", () => {
  const bloqueo = aBlock({
    id: "b1", userId: STAFF,
    startDateTime: "2026-10-01T09:00:00",
    endDateTime: "2026-10-01T13:00:00",
  });

  it("409 al agendar dentro de un bloqueo", async () => {
    const { app, token } = await setup({ availabilityBlocks: [bloqueo] });
    const res = await crear(app, token, base);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/bloqueo/i);
  });

  it("permite agendar fuera del bloqueo", async () => {
    const { app, token } = await setup({ availabilityBlocks: [bloqueo] });
    const res = await crear(app, token, {
      ...base,
      dateTimeStart: "2026-10-01T14:00:00",
      dateTimeEnd: "2026-10-01T15:00:00",
    });

    expect(res.status).toBe(201);
  });

  it("el bloqueo de otro staff no estorba", async () => {
    const ajeno = aBlock({ id: "b2", userId: OTRO_STAFF,
      startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T13:00:00" });
    const { app, token } = await setup({ availabilityBlocks: [ajeno] });

    expect((await crear(app, token, base)).status).toBe(201);
  });
});

describe("editar cita", () => {
  const cita = anAppointment({ id: "a1", staffId: STAFF, clientId: "client-1" });

  it("actualiza solo los campos enviados", async () => {
    const { app, storage, token } = await setup({ appointments: [cita] });

    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`).send({ notes: "Llegó tarde" });

    expect(res.status).toBe(200);
    expect(storage.appointments.get("a1")).toMatchObject({
      notes: "Llegó tarde", status: "SCHEDULED", staffId: STAFF,
    });
  });

  it.each(["ARRIVED", "NO_SHOW", "DONE", "CANCELLED"])("acepta el estado %s", async (status) => {
    const { app, storage, token } = await setup({ appointments: [cita] });

    await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`).send({ status });

    expect(storage.appointments.get("a1")!.status).toBe(status);
  });

  it("404 si no existe", async () => {
    const { app, token } = await setup();
    const res = await request(app).patch("/api/appointments/no-existe")
      .set("Authorization", `Bearer ${token}`).send({ notes: "x" });

    expect(res.status).toBe(404);
  });

  it("409 si al mover choca con otra cita", async () => {
    const otra = anAppointment({ id: "a2", staffId: STAFF, clientId: "client-1",
      dateTimeStart: "2026-10-01T15:00:00", dateTimeEnd: "2026-10-01T16:00:00" });
    const { app, token } = await setup({ appointments: [cita, otra] });

    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: "2026-10-01T15:30:00", dateTimeEnd: "2026-10-01T16:30:00" });

    expect(res.status).toBe(409);
  });

  it("no choca consigo misma al reprogramarse", async () => {
    const { app, token } = await setup({ appointments: [cita] });

    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: cita.dateTimeStart, dateTimeEnd: cita.dateTimeEnd });

    expect(res.status).toBe(200);
  });

  /** Deuda §8, cerrada en p005 fase A: el PATCH valida bloqueos igual que el POST. */
  it("rechaza mover una cita encima de un bloqueo", async () => {
    const bloqueo = aBlock({ id: "b1", userId: STAFF,
      startDateTime: "2026-10-05T09:00:00", endDateTime: "2026-10-05T13:00:00" });
    const { app, token } = await setup({ appointments: [cita], availabilityBlocks: [bloqueo] });

    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: "2026-10-05T10:00:00", dateTimeEnd: "2026-10-05T11:00:00" });

    expect(res.status).toBe(409);
  });
});

describe("consultar citas", () => {
  it("lista todas", async () => {
    const { app, token } = await setup({
      appointments: [anAppointment({ id: "a1" }), anAppointment({ id: "a2" })],
    });
    const res = await request(app).get("/api/appointments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("devuelve el detalle con 200", async () => {
    const { app, token } = await setup({ appointments: [anAppointment({ id: "a1", clientId: "client-1" })] });
    const res = await request(app).get("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "a1" });
  });

  it("404 si el detalle no existe", async () => {
    const { app, token } = await setup();
    const res = await request(app).get("/api/appointments/no-existe")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("el historial de un cliente viene ordenado del más reciente al más antiguo", async () => {
    const { app, token } = await setup({
      appointments: [
        anAppointment({ id: "vieja", clientId: "client-1", dateTimeStart: "2026-01-01T10:00:00" }),
        anAppointment({ id: "nueva", clientId: "client-1", dateTimeStart: "2026-12-01T10:00:00" }),
        anAppointment({ id: "media", clientId: "client-1", dateTimeStart: "2026-06-01T10:00:00" }),
        anAppointment({ id: "ajena", clientId: "otro" }),
      ],
    });

    const res = await request(app).get("/api/clients/client-1/appointments")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.map((a: { id: string }) => a.id)).toEqual(["nueva", "media", "vieja"]);
  });
});

/**
 * Deuda §30 — una fecha mal tecleada entraba entera.
 *
 * `new Date("18/09/2026T10:00")` es `NaN`, y **toda comparación con `NaN` es `false`**:
 * la detección de solapes y la de bloqueos se apagaban solas, la cita se guardaba con
 * una fecha basura y no aparecía en ningún día, porque el filtro es `startsWith`.
 */
describe("validación de fechas al crear y mover citas", () => {
  const FECHAS_MALAS = [
    ["formato del día a la europea", "18/09/2026T10:00:00"],
    ["texto cualquiera", "mañana a las 10"],
    ["mes que no existe", "2026-13-45T10:00:00"],
    ["cadena vacía", " "],
  ] as const;

  it.each(FECHAS_MALAS)("400 al crear con %s", async (_desc, mala) => {
    const { app, token } = await setup();
    const res = await crear(app, token, { ...base, dateTimeStart: mala });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fecha inválid/i);
  });

  it("una fecha inválida no crea nada", async () => {
    const { app, storage, token } = await setup();
    await crear(app, token, { ...base, dateTimeEnd: "no es una fecha" });

    expect(storage.appointments.snapshotValues()).toHaveLength(0);
  });

  it("400 si la cita termina antes de empezar", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, {
      ...base,
      dateTimeStart: "2026-10-01T11:00:00",
      dateTimeEnd: "2026-10-01T10:00:00",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mayor a inicio/i);
  });

  it("400 si empieza y termina a la vez", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, { ...base, dateTimeEnd: base.dateTimeStart });

    expect(res.status).toBe(400);
  });

  it("con fecha basura, el solape SÍ se comprueba en vez de colarse", async () => {
    // Antes esta cita se creaba encima de la otra sin protestar.
    const { app, token } = await setup({ appointments: [anAppointment({ id: "ya-esta" })] });
    const res = await crear(app, token, { ...base, dateTimeStart: "basura" });

    expect(res.status).toBe(400);
  });

  it("400 al mover una cita a una fecha inválida", async () => {
    const { app, token } = await setup({ appointments: [anAppointment({ id: "a1" })] });
    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: "32/10/2026T10:00:00" });

    expect(res.status).toBe(400);
  });
});

/** Deuda §29 — el bloqueo de centro no existía: había que crear uno por persona. */
describe("bloqueo de centro", () => {
  const cierre = {
    id: "b-centro", userId: null,
    startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T18:00:00",
    reason: "Día festivo",
  };

  it("impide agendar a cualquiera del staff, no solo a una", async () => {
    const { app, token } = await setup({ availabilityBlocks: [cierre] });

    for (const staffId of [STAFF, OTRO_STAFF]) {
      const res = await crear(app, token, { ...base, staffId });
      expect({ staffId, status: res.status }).toEqual({ staffId, status: 409 });
    }
  });

  it("el mensaje dice que es el centro, no que sea de alguien", async () => {
    const { app, token } = await setup({ availabilityBlocks: [cierre] });
    const res = await crear(app, token, base);

    expect(res.body.message).toMatch(/centro está cerrado/i);
  });

  it("tampoco deja mover una cita a ese hueco", async () => {
    const { app, token } = await setup({
      appointments: [anAppointment({ id: "a1", dateTimeStart: "2026-10-05T10:00:00", dateTimeEnd: "2026-10-05T11:00:00" })],
      availabilityBlocks: [cierre],
    });

    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: "2026-10-01T10:00:00", dateTimeEnd: "2026-10-01T11:00:00" });

    expect(res.status).toBe(409);
  });

  it("fuera de su horario no estorba", async () => {
    const { app, token } = await setup({ availabilityBlocks: [cierre] });
    const res = await crear(app, token, {
      ...base,
      dateTimeStart: "2026-10-02T10:00:00",
      dateTimeEnd: "2026-10-02T11:00:00",
    });

    expect(res.status).toBe(201);
  });
});

/** Antes se podía agendar a las 03:00 de un domingo: no había horario que consultar. */
describe("horario del centro", () => {
  const enDomingo = {
    ...base,
    dateTimeStart: "2026-10-04T10:00:00",  // domingo
    dateTimeEnd: "2026-10-04T11:00:00",
  };

  it("409 un día en que el centro no abre", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, enDomingo);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no abre los domingo/i);
  });

  it("409 antes de la hora de apertura", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, {
      ...base, dateTimeStart: "2026-10-01T07:00:00", dateTimeEnd: "2026-10-01T08:00:00",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/abre de 09:00 a 19:00/i);
  });

  it("409 si termina después del cierre", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, {
      ...base, dateTimeStart: "2026-10-01T18:30:00", dateTimeEnd: "2026-10-01T19:30:00",
    });

    expect(res.status).toBe(409);
  });

  it("acepta una cita que cabe justo", async () => {
    const { app, token } = await setup();
    const res = await crear(app, token, {
      ...base, dateTimeStart: "2026-10-01T09:00:00", dateTimeEnd: "2026-10-01T10:00:00",
    });

    expect(res.status).toBe(201);
  });

  it("respeta el horario que se haya guardado, no el de fábrica", async () => {
    const { app, token, storage } = await setup();
    storage.centerHours.set("0", { id: "0", weekday: 0, open: true, opensAt: "10:00", closesAt: "14:00" } as never);

    expect((await crear(app, token, enDomingo)).status).toBe(201);
  });

  it("tampoco deja mover una cita fuera de horario", async () => {
    const { app, token } = await setup({ appointments: [anAppointment({ id: "a1" })] });
    const res = await request(app).patch("/api/appointments/a1")
      .set("Authorization", `Bearer ${token}`)
      .send({ dateTimeStart: "2026-10-04T10:00:00", dateTimeEnd: "2026-10-04T11:00:00" });

    expect(res.status).toBe(409);
  });
});
