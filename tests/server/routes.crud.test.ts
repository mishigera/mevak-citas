jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import {
  buildApp, authAs, aClient, anAppointment, aService, aPackage, aClientPackage, aBlock,
} from "../setup/server-harness";

const ROLES = ["ADMIN", "OWNER", "RECEPTION", "FACIALIST"] as const;

async function setup(over: Record<string, unknown[]> = {}) {
  const users = ROLES.map((role) => ({
    id: `u-${role}`, name: role, email: `${role.toLowerCase()}@m.test`, passwordHash: "h",
    role, isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  }));
  const { app, storage } = await buildApp({ users, clients: [aClient({ id: "client-1" })], ...over });
  const tokens = Object.fromEntries(ROLES.map((r) => [r, authAs(storage, `u-${r}`, r)]));
  return { app, storage, tokens: tokens as Record<(typeof ROLES)[number], string> };
}

const as = (app: Express, token: string) => ({
  get: (p: string) => request(app).get(p).set("Authorization", `Bearer ${token}`),
  post: (p: string, b?: object) => request(app).post(p).set("Authorization", `Bearer ${token}`).send(b),
  put: (p: string, b?: object) => request(app).put(p).set("Authorization", `Bearer ${token}`).send(b),
  patch: (p: string, b?: object) => request(app).patch(p).set("Authorization", `Bearer ${token}`).send(b),
});

describe("usuarios", () => {
  it("crea un usuario y devuelve sus datos sin el hash", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).post("/api/users", {
      name: "Nueva", email: "nueva@m.test", password: "secreta", role: "FACIALIST",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Nueva", role: "FACIALIST", isActive: true });
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("guarda la contraseña hasheada, nunca en claro", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).post("/api/users", {
      name: "N", email: "n@m.test", password: "en-claro", role: "RECEPTION",
    });

    const creado = storage.users.get(res.body.id)!;
    expect(creado.passwordHash).not.toBe("en-claro");
    expect(creado.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it.each([
    ["name", { email: "a@b.c", password: "p", role: "ADMIN" }],
    ["email", { name: "N", password: "p", role: "ADMIN" }],
    ["password", { name: "N", email: "a@b.c", role: "ADMIN" }],
    ["role", { name: "N", email: "a@b.c", password: "p" }],
  ])("400 si falta %s", async (_c, body) => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.ADMIN).post("/api/users", body)).status).toBe(400);
  });

  it("rechaza email duplicado", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).post("/api/users", {
      name: "Dup", email: "admin@m.test", password: "p", role: "ADMIN",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya registrado/i);
  });

  it("edita nombre y rol", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).patch("/api/users/u-RECEPTION", {
      name: "Renombrada", role: "OWNER",
    });

    expect(res.status).toBe(200);
    expect(storage.users.get("u-RECEPTION")).toMatchObject({ name: "Renombrada", role: "OWNER" });
  });

  it("puede desactivar a un usuario", async () => {
    const { app, storage, tokens } = await setup();
    await as(app, tokens.ADMIN).patch("/api/users/u-FACIALIST", { isActive: false });

    expect(storage.users.get("u-FACIALIST")!.isActive).toBe(false);
  });

  it("rehashea al cambiar la contraseña", async () => {
    const { app, storage, tokens } = await setup();
    const antes = storage.users.get("u-OWNER")!.passwordHash;

    await as(app, tokens.ADMIN).patch("/api/users/u-OWNER", { password: "nueva-clave" });

    const despues = storage.users.get("u-OWNER")!.passwordHash;
    expect(despues).not.toBe(antes);
    expect(despues).toMatch(/^\$2[aby]\$/);
  });

  it("404 al editar un usuario inexistente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.ADMIN).patch("/api/users/nope", { name: "X" })).status).toBe(404);
  });

  it("/api/users/staff no filtra hashes", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.RECEPTION).get("/api/users/staff");

    expect(res.status).toBe(200);
    res.body.forEach((u: object) => expect(u).not.toHaveProperty("passwordHash"));
  });
});

describe("clientes", () => {
  it("crea un cliente", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.RECEPTION).post("/api/clients", {
      fullName: "María López", phone: "5551234567", email: "m@l.test", sex: "F",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fullName: "María López", phone: "5551234567", sex: "F" });
  });

  it.each([
    ["sin fullName", { phone: "555" }],
    ["sin phone", { fullName: "X" }],
    ["vacío", {}],
  ])("400 %s", async (_c, body) => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.RECEPTION).post("/api/clients", body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/requeridos/i);
  });

  it("edita un cliente", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.RECEPTION).patch("/api/clients/client-1", { phone: "5559999999" });

    expect(res.status).toBe(200);
    expect(storage.clients.get("client-1")!.phone).toBe("5559999999");
  });

  it("404 al editar uno inexistente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.RECEPTION).patch("/api/clients/nope", { phone: "1" })).status).toBe(404);
  });

  it("devuelve el detalle y 404 si no está", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.RECEPTION).get("/api/clients/client-1")).status).toBe(200);
    expect((await as(app, tokens.RECEPTION).get("/api/clients/nope")).status).toBe(404);
  });
});

describe("historia clínica", () => {
  it("devuelve null si el cliente no tiene perfil", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).get("/api/clients/client-1/clinical");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("crea el perfil en el primer PUT", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", {
      allergiesFlag: true, allergiesText: "Penicilina", phototype: 3, conditionsJson: { diabetes: true },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clientId: "client-1", allergiesFlag: true, phototype: 3 });
    expect(storage.clinicalProfiles.size).toBe(1);
  });

  it("actualiza el perfil existente en vez de duplicarlo", async () => {
    const { app, storage, tokens } = await setup();
    await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", { phototype: 2, conditionsJson: {} });
    await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", { phototype: 5, conditionsJson: {} });

    expect(storage.clinicalProfiles.size).toBe(1);
    expect(storage.clinicalProfiles.snapshotValues()[0].phototype).toBe(5);
  });

  it("al ACTUALIZAR, el clientId de la URL manda sobre el del cuerpo", async () => {
    const { app, tokens } = await setup();
    await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", { phototype: 2, conditionsJson: {} });

    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", {
      clientId: "cliente-intruso", conditionsJson: {},
    });

    expect(res.body.clientId).toBe("client-1"); // routes.ts:180 — Object.assign(..., { clientId })
  });

  /**
   * DEUDA §17 — inconsistencia real encontrada por estos tests.
   * Al CREAR (routes.ts:184) el spread va después del clientId:
   *   { id, clientId, ...req.body }        → el cuerpo PISA la URL
   * Al ACTUALIZAR (routes.ts:180) es al revés:
   *   Object.assign(profile, req.body, { clientId })  → la URL manda
   *
   * Consecuencia: se puede crear una historia clínica colgada de OTRO cliente.
   * El test fija el comportamiento actual para que el arreglo sea deliberado.
   */
  it("al CREAR, el clientId del cuerpo pisa el de la URL (inconsistencia conocida)", async () => {
    const { app, storage, tokens } = await setup();

    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", {
      clientId: "cliente-intruso", conditionsJson: {},
    });

    expect(res.body.clientId).toBe("cliente-intruso");
    // Y el perfil queda invisible para el cliente al que se le creó:
    const lectura = await as(app, tokens.OWNER).get("/api/clients/client-1/clinical");
    expect(lectura.body).toBeNull();
    expect(storage.clinicalProfiles.size).toBe(1);
  });
});

describe("áreas de láser del cliente", () => {
  it("reemplaza la selección completa", async () => {
    const { app, storage, tokens } = await setup();
    const areas = storage.laserAreas.snapshotValues();

    await as(app, tokens.OWNER).put("/api/clients/client-1/laser-areas", {
      areaIds: [areas[0].id, areas[1].id],
    });
    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/laser-areas", {
      areaIds: [areas[5].id],
    });

    expect(res.body).toHaveLength(1);
    const guardadas = storage.clientLaserSelections.snapshotValues()
      .filter((s) => s.clientId === "client-1");
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].areaId).toBe(areas[5].id);
  });

  it("acepta lista vacía y deja al cliente sin áreas", async () => {
    const { app, storage, tokens } = await setup();
    const areas = storage.laserAreas.snapshotValues();
    await as(app, tokens.OWNER).put("/api/clients/client-1/laser-areas", { areaIds: [areas[0].id] });

    await as(app, tokens.OWNER).put("/api/clients/client-1/laser-areas", { areaIds: [] });

    expect(storage.clientLaserSelections.size).toBe(0);
  });

  it("no toca la selección de otro cliente", async () => {
    const { app, storage, tokens } = await setup({ clients: [aClient({ id: "client-1" }), aClient({ id: "client-2" })] });
    const areas = storage.laserAreas.snapshotValues();
    await as(app, tokens.OWNER).put("/api/clients/client-2/laser-areas", { areaIds: [areas[0].id] });

    await as(app, tokens.OWNER).put("/api/clients/client-1/laser-areas", { areaIds: [areas[1].id] });

    const dosSelecciones = storage.clientLaserSelections.snapshotValues();
    expect(dosSelecciones.filter((s) => s.clientId === "client-2")).toHaveLength(1);
  });

  it("GET solo devuelve las áreas activas del catálogo", async () => {
    const { app, storage, tokens } = await setup();
    const primera = storage.laserAreas.snapshotValues()[0];
    storage.laserAreas.set(primera.id, { ...primera, isActive: false });

    const res = await as(app, tokens.RECEPTION).get("/api/laser-areas");

    expect(res.body).toHaveLength(22);
  });
});

describe("paquetes del cliente", () => {
  it("vende un paquete y lo inicializa con las sesiones completas", async () => {
    const { app, tokens } = await setup({ packages: [aPackage({ id: "pkg-1", totalSessions: 8 })] });
    const res = await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "pkg-1" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      clientId: "client-1", totalSessions: 8, usedSessions: 0, remainingSessions: 8, status: "ACTIVE",
    });
  });

  it("incluye los datos del paquete del catálogo", async () => {
    const { app, tokens } = await setup({ packages: [aPackage({ id: "pkg-1", name: "Full body" })] });
    const res = await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "pkg-1" });

    expect(res.body.package).toMatchObject({ id: "pkg-1", name: "Full body" });
  });

  it("404 si el cliente no existe", async () => {
    const { app, tokens } = await setup({ packages: [aPackage({ id: "pkg-1" })] });
    const res = await as(app, tokens.RECEPTION).post("/api/clients/nope/packages", { packageId: "pkg-1" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/cliente/i);
  });

  it("404 si el paquete no existe o está inactivo", async () => {
    const { app, tokens } = await setup({ packages: [aPackage({ id: "pkg-off", isActive: false })] });

    expect((await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "nope" })).status).toBe(404);
    expect((await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "pkg-off" })).status).toBe(404);
  });

  it("lista los paquetes del cliente, del más reciente al más antiguo", async () => {
    const { app, tokens } = await setup({
      packages: [aPackage({ id: "pkg-1" })],
      clientPackages: [
        aClientPackage({ id: "cp-viejo", clientId: "client-1", packageId: "pkg-1", startDate: "2026-01-01T00:00:00.000Z" }),
        aClientPackage({ id: "cp-nuevo", clientId: "client-1", packageId: "pkg-1", startDate: "2026-09-01T00:00:00.000Z" }),
      ],
    });

    const res = await as(app, tokens.RECEPTION).get("/api/clients/client-1/packages");

    expect(res.body.map((p: { id: string }) => p.id)).toEqual(["cp-nuevo", "cp-viejo"]);
  });

  it("sobrevive a un paquete huérfano: package queda en null, no revienta", async () => {
    const { app, tokens } = await setup({
      clientPackages: [aClientPackage({ id: "cp1", clientId: "client-1", packageId: "borrado" })],
    });

    const res = await as(app, tokens.RECEPTION).get("/api/clients/client-1/packages");

    expect(res.status).toBe(200);
    expect(res.body[0].package).toBeNull();
  });
});

describe("catálogo de servicios y paquetes", () => {
  it("crea un servicio con precio numérico", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).post("/api/services", { name: "Facial", type: "FACIAL", price: "750" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Facial", price: 750, isActive: true });
  });

  it("acepta precio 0 pero no un campo ausente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.ADMIN).post("/api/services", { name: "Gratis", type: "FACIAL", price: 0 })).status).toBe(201);
    expect((await as(app, tokens.ADMIN).post("/api/services", { name: "X", type: "FACIAL" })).status).toBe(400);
  });

  it("filtra servicios por tipo", async () => {
    const { app, tokens } = await setup({
      services: [aService({ id: "s1", type: "FACIAL" }), aService({ id: "s2", type: "LASER" })],
    });

    const res = await as(app, tokens.RECEPTION).get("/api/services?type=LASER");

    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe("LASER");
  });

  it("oculta los servicios inactivos", async () => {
    const { app, tokens } = await setup({
      services: [aService({ id: "s1" }), aService({ id: "s2", isActive: false })],
    });

    expect((await as(app, tokens.RECEPTION).get("/api/services")).body).toHaveLength(1);
  });

  it("editar un servicio permite desactivarlo (borrado lógico)", async () => {
    const { app, storage, tokens } = await setup({ services: [aService({ id: "s1" })] });
    const res = await as(app, tokens.ADMIN).patch("/api/services/s1", { isActive: false, price: 999 });

    expect(res.status).toBe(200);
    expect(storage.services.get("s1")).toMatchObject({ isActive: false, price: 999 });
  });

  it("404 al editar un servicio inexistente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.ADMIN).patch("/api/services/nope", { price: 1 })).status).toBe(404);
  });

  it("crea un paquete y lo marca como LASER", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.ADMIN).post("/api/packages", { name: "P6", totalSessions: "6", price: "6000" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "LASER", totalSessions: 6, price: 6000, isActive: true });
  });

  it("400 si al paquete le faltan campos", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.ADMIN).post("/api/packages", { name: "P" })).status).toBe(400);
  });
});

describe("servicios de una cita", () => {
  it("reemplaza la lista completa", async () => {
    const { app, storage, tokens } = await setup({
      appointments: [anAppointment({ id: "a1" })],
      services: [aService({ id: "s1" }), aService({ id: "s2" }), aService({ id: "s3" })],
    });

    await as(app, tokens.OWNER).put("/api/appointments/a1/services", { serviceIds: ["s1", "s2"] });
    const res = await as(app, tokens.OWNER).put("/api/appointments/a1/services", { serviceIds: ["s3"] });

    expect(res.body).toHaveLength(1);
    expect(storage.appointmentServices.snapshotValues()).toHaveLength(1);
    expect(storage.appointmentServices.snapshotValues()[0].serviceId).toBe("s3");
  });

  it("no toca los servicios de otra cita", async () => {
    const { app, storage, tokens } = await setup({
      appointments: [anAppointment({ id: "a1" }), anAppointment({ id: "a2" })],
      services: [aService({ id: "s1" })],
    });

    await as(app, tokens.OWNER).put("/api/appointments/a2/services", { serviceIds: ["s1"] });
    await as(app, tokens.OWNER).put("/api/appointments/a1/services", { serviceIds: [] });

    expect(storage.appointmentServices.snapshotValues().filter((s) => s.appointmentId === "a2")).toHaveLength(1);
  });
});

describe("sesión de láser", () => {
  it("devuelve null si la cita no tiene sesión", async () => {
    const { app, tokens } = await setup({ appointments: [anAppointment({ id: "a1" })] });
    const res = await as(app, tokens.OWNER).get("/api/appointments/a1/laser-session");

    expect(res.body).toBeNull();
  });

  it("crea la sesión en el primer PUT", async () => {
    const { app, storage, tokens } = await setup({ appointments: [anAppointment({ id: "a1", type: "LASER" })] });
    const res = await as(app, tokens.OWNER).put("/api/appointments/a1/laser-session", {
      notes: "Potencia baja", powerByArea: { axila: 12 },
    });

    expect(res.body).toMatchObject({ appointmentId: "a1", notes: "Potencia baja" });
    expect(storage.laserSessions.size).toBe(1);
  });

  it("actualiza la existente sin duplicar", async () => {
    const { app, storage, tokens } = await setup({ appointments: [anAppointment({ id: "a1", type: "LASER" })] });
    await as(app, tokens.OWNER).put("/api/appointments/a1/laser-session", { notes: "Primera" });
    await as(app, tokens.OWNER).put("/api/appointments/a1/laser-session", { notes: "Corregida" });

    expect(storage.laserSessions.size).toBe(1);
    expect(storage.laserSessions.snapshotValues()[0].notes).toBe("Corregida");
  });

  it("el appointmentId de la URL manda sobre el del cuerpo", async () => {
    const { app, tokens } = await setup({ appointments: [anAppointment({ id: "a1", type: "LASER" })] });
    await as(app, tokens.OWNER).put("/api/appointments/a1/laser-session", { notes: "n" });
    const res = await as(app, tokens.OWNER).put("/api/appointments/a1/laser-session", {
      appointmentId: "cita-intrusa", notes: "n2",
    });

    expect(res.body.appointmentId).toBe("a1");
  });
});

describe("liquidación a la facialista", () => {
  // Función, no constante: las rutas mutan el pago en sitio.
  const pagoFacial = (over: Record<string, unknown> = {}) => ({
    id: "p1", appointmentId: "a1", method: "CASH", totalAmount: 1000,
    ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
    createdAt: "2026-09-01T12:00:00.000Z", ...over,
  });

  it("marca como pagado por defecto", async () => {
    const { app, storage, tokens } = await setup({ payments: [pagoFacial()] });
    const res = await as(app, tokens.OWNER).patch("/api/payments/p1/facialist-paid", {});

    expect(res.status).toBe(200);
    expect(storage.payments.get("p1")!.facialistPaidFlag).toBe(true);
  });

  it("permite revertir la liquidación con paid:false", async () => {
    const { app, storage, tokens } = await setup({ payments: [pagoFacial({ facialistPaidFlag: true })] });
    await as(app, tokens.OWNER).patch("/api/payments/p1/facialist-paid", { paid: false });

    expect(storage.payments.get("p1")!.facialistPaidFlag).toBe(false);
  });

  it("404 si el pago no existe", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).patch("/api/payments/nope/facialist-paid", {})).status).toBe(404);
  });

  it("los pendientes traen cita, staff y cliente resueltos", async () => {
    const { app, tokens } = await setup({
      appointments: [anAppointment({ id: "a1", clientId: "client-1", staffId: "u-FACIALIST" })],
      payments: [pagoFacial()],
    });

    const res = await as(app, tokens.OWNER).get("/api/payments/pending-facialist");

    expect(res.body).toHaveLength(1);
    expect(res.body[0].staff).toMatchObject({ id: "u-FACIALIST" });
    expect(res.body[0].client).toMatchObject({ id: "client-1" });
    expect(res.body[0].appointment).toMatchObject({ id: "a1" });
  });

  it("excluye los ya liquidados y los que no deben nada a la facialista", async () => {
    const { app, tokens } = await setup({
      payments: [
        pagoFacial({ id: "pagado", facialistPaidFlag: true }),
        pagoFacial({ id: "laser", facialistNetAmount: 0 }),
        pagoFacial({ id: "pendiente" }),
      ],
    });

    const res = await as(app, tokens.OWNER).get("/api/payments/pending-facialist");

    expect(res.body.map((p: { id: string }) => p.id)).toEqual(["pendiente"]);
  });

  it("no revienta si la cita del pago fue borrada", async () => {
    const { app, tokens } = await setup({ payments: [pagoFacial({ appointmentId: "borrada" })] });
    const res = await as(app, tokens.OWNER).get("/api/payments/pending-facialist");

    expect(res.status).toBe(200);
    expect(res.body[0].staff).toBeNull();
  });

  it("GET del pago de una cita devuelve null si no hay", async () => {
    const { app, tokens } = await setup({ appointments: [anAppointment({ id: "a1" })] });
    expect((await as(app, tokens.OWNER).get("/api/appointments/a1/payment")).body).toBeNull();
  });
});

describe("reporte de ingresos", () => {
  const pago = (id: string, over: Record<string, unknown> = {}) => ({
    id, appointmentId: `a-${id}`, method: "CASH", totalAmount: 1000,
    ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
    createdAt: "2026-09-15T12:00:00.000Z", ...over,
  });

  it("suma totales y cuenta los pagos", async () => {
    const { app, tokens } = await setup({ payments: [pago("p1"), pago("p2")] });
    const res = await as(app, tokens.OWNER).get("/api/reports/income");

    expect(res.body).toEqual({ total: 2000, ownerNet: 1000, facialistNet: 1000, count: 2 });
  });

  it("filtra por mes y año", async () => {
    const { app, tokens } = await setup({
      payments: [
        pago("sep", { createdAt: "2026-09-15T12:00:00.000Z" }),
        pago("oct", { createdAt: "2026-10-15T12:00:00.000Z" }),
        pago("sep-otro-anio", { createdAt: "2025-09-15T12:00:00.000Z" }),
      ],
    });

    const res = await as(app, tokens.OWNER).get("/api/reports/income?month=9&year=2026");

    expect(res.body.count).toBe(1);
    expect(res.body.total).toBe(1000);
  });

  it("devuelve ceros cuando no hay pagos", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).get("/api/reports/income")).body)
      .toEqual({ total: 0, ownerNet: 0, facialistNet: 0, count: 0 });
  });

  it("ignora el filtro si solo se pasa el mes", async () => {
    const { app, tokens } = await setup({ payments: [pago("p1")] });
    expect((await as(app, tokens.OWNER).get("/api/reports/income?month=1")).body.count).toBe(1);
  });
});

describe("bloqueos de disponibilidad", () => {
  it("crea el bloqueo a nombre de quien lo pide", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.FACIALIST).post("/api/blocks", {
      startDateTime: "2026-10-01T09:00:00.000Z",
      endDateTime: "2026-10-01T13:00:00.000Z",
      reason: "Cita médica",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: "u-FACIALIST", reason: "Cita médica" });
  });

  it.each([
    ["faltan fechas", {}, /faltan fechas/i],
    ["fecha inválida", { startDateTime: "no-es-fecha", endDateTime: "2026-10-01T13:00:00.000Z" }, /formato de fecha/i],
    ["fin anterior al inicio", { startDateTime: "2026-10-01T13:00:00.000Z", endDateTime: "2026-10-01T09:00:00.000Z" }, /mayor a inicio/i],
    ["fin igual al inicio", { startDateTime: "2026-10-01T09:00:00.000Z", endDateTime: "2026-10-01T09:00:00.000Z" }, /mayor a inicio/i],
  ])("400 si %s", async (_c, body, mensaje) => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/blocks", body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
  });

  it("cada uno ve solo sus bloqueos", async () => {
    const { app, tokens } = await setup({
      availabilityBlocks: [
        aBlock({ id: "b-owner", userId: "u-OWNER" }),
        aBlock({ id: "b-facial", userId: "u-FACIALIST" }),
      ],
    });

    const res = await as(app, tokens.FACIALIST).get("/api/blocks");

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("b-facial");
  });

  it("ADMIN los ve todos", async () => {
    const { app, tokens } = await setup({
      availabilityBlocks: [
        aBlock({ id: "b-owner", userId: "u-OWNER" }),
        aBlock({ id: "b-facial", userId: "u-FACIALIST" }),
      ],
    });

    expect((await as(app, tokens.ADMIN).get("/api/blocks")).body).toHaveLength(2);
  });

  it("enriquece con el nombre del staff", async () => {
    const { app, tokens } = await setup({ availabilityBlocks: [aBlock({ id: "b1", userId: "u-OWNER" })] });
    const res = await as(app, tokens.ADMIN).get("/api/blocks");

    expect(res.body[0].user).toMatchObject({ id: "u-OWNER", name: "OWNER" });
  });

  it("user queda en null si el staff ya no existe", async () => {
    const { app, tokens } = await setup({ availabilityBlocks: [aBlock({ id: "b1", userId: "borrado" })] });
    const res = await as(app, tokens.ADMIN).get("/api/blocks");

    expect(res.body[0].user).toBeNull();
  });
});
