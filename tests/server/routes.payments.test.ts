jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import {
  buildApp, authAs, aClient, anAppointment, aPackage, aClientPackage,
} from "../setup/server-harness";

/**
 * El reparto del dinero es la lógica de mayor riesgo del sistema (routes.ts:377-450)
 * y no tenía ni una prueba. Reglas, según el código:
 *   FACIAL   → owner = floor(total/2), facialista = ceil(total/2)
 *   LASER    → owner = total,          facialista = 0
 *   INCLUDED → total = 0 y consume una sesión del paquete
 */

const OWNER = "user-owner";
const CLIENT = "client-1";

async function setup(over: Record<string, unknown[]> = {}) {
  const { app, storage } = await buildApp({
    users: [{ id: OWNER, name: "Dueña", email: "o@m.test", passwordHash: "h",
      role: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z" }],
    clients: [aClient({ id: CLIENT })],
    ...over,
  });
  return { app, storage, token: authAs(storage, OWNER, "OWNER") };
}

const pay = (app: Express, token: string, apptId: string, body: object) =>
  request(app).post(`/api/appointments/${apptId}/payment`)
    .set("Authorization", `Bearer ${token}`).send(body);

describe("pagos — reparto en citas FACIAL", () => {
  it.each([
    [1000, 500, 500],
    [500, 250, 250],
    [501, 250, 251],  // impar: el redondeo favorece a la facialista
    [1, 0, 1],
    [0, 0, 0],
  ])("total %i → owner %i, facialista %i", async (total, owner, facialista) => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt] });

    const res = await pay(app, token, "a1", { method: "CASH", totalAmount: total });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      totalAmount: total, ownerNetAmount: owner, facialistNetAmount: facialista,
    });
  });

  it("el reparto nunca pierde ni inventa dinero", async () => {
    for (const total of [0, 1, 7, 99, 333, 1000, 12345]) {
      const appt = anAppointment({ id: `a${total}`, clientId: CLIENT, type: "FACIAL" });
      const { app, token } = await setup({ appointments: [appt] });
      const res = await pay(app, token, `a${total}`, { method: "CARD", totalAmount: total });

      expect(res.body.ownerNetAmount + res.body.facialistNetAmount).toBe(total);
    }
  });

  it("nace sin liquidar a la facialista", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt] });
    const res = await pay(app, token, "a1", { method: "CASH", totalAmount: 800 });

    expect(res.body.facialistPaidFlag).toBe(false);
  });
});

describe("pagos — citas LASER", () => {
  it("el total va íntegro al owner", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, token } = await setup({ appointments: [appt] });

    const res = await pay(app, token, "a1", { method: "CASH", totalAmount: 1500 });

    expect(res.body).toMatchObject({
      totalAmount: 1500, ownerNetAmount: 1500, facialistNetAmount: 0,
    });
  });

  it("congela un snapshot de las áreas contratadas del cliente", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, storage, token } = await setup({ appointments: [appt] });

    const areas = storage.laserAreas.snapshotValues().slice(0, 3);
    areas.forEach((a, i) =>
      storage.clientLaserSelections.set(`sel-${i}`, {
        id: `sel-${i}`, clientId: CLIENT, areaId: a.id,
      }),
    );

    await pay(app, token, "a1", { method: "CASH", totalAmount: 1500 });

    const sesion = storage.laserSessions.snapshotValues()[0];
    expect(sesion.areasSnapshotJson).toEqual(areas.map((a) => a.svgKey));
  });

  it("una cita FACIAL no genera sesión de láser", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, storage, token } = await setup({ appointments: [appt] });

    await pay(app, token, "a1", { method: "CASH", totalAmount: 500 });

    expect(storage.laserSessions.size).toBe(0);
  });
});

describe("pagos — paquetes (INCLUDED)", () => {
  const conPaquete = (over: Record<string, unknown> = {}) => ({
    packages: [aPackage({ id: "package-1" })],
    clientPackages: [aClientPackage({ id: "cp1", clientId: CLIENT, packageId: "package-1", ...over })],
  });

  it("consume una sesión y deja el total en 0", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, storage, token } = await setup({ appointments: [appt], ...conPaquete() });

    const res = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: "INCLUDED", totalAmount: 0, ownerNetAmount: 0 });
    expect(storage.clientPackages.get("cp1")).toMatchObject({
      usedSessions: 1, remainingSessions: 5, status: "ACTIVE",
    });
  });

  it("cierra el paquete al gastar la última sesión", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, storage, token } = await setup({
      appointments: [appt],
      ...conPaquete({ usedSessions: 5, remainingSessions: 1 }),
    });

    await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(storage.clientPackages.get("cp1")).toMatchObject({
      usedSessions: 6, remainingSessions: 0, status: "FINISHED",
    });
  });

  it("numera la sesión de láser con la sesión consumida", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, storage, token } = await setup({
      appointments: [appt], ...conPaquete({ usedSessions: 2, remainingSessions: 4 }),
    });

    await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(storage.laserSessions.snapshotValues()[0]).toMatchObject({
      sessionNumber: 3, clientPackageId: "cp1",
    });
  });

  it("fuerza INCLUDED aunque se mande CASH si viene un paquete", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, token } = await setup({ appointments: [appt], ...conPaquete() });

    const res = await pay(app, token, "a1", { method: "CASH", totalAmount: 9999, clientPackageId: "cp1" });

    expect(res.body).toMatchObject({ method: "INCLUDED", totalAmount: 0 });
  });

  it("rechaza INCLUDED sin paquete", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, token } = await setup({ appointments: [appt] });

    const res = await pay(app, token, "a1", { method: "INCLUDED" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/paquete/i);
  });

  it("rechaza usar paquete en una cita FACIAL", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt], ...conPaquete() });

    const res = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/láser/i);
  });

  it("rechaza el paquete de otro cliente", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, token } = await setup({
      appointments: [appt],
      packages: [aPackage({ id: "package-1" })],
      clientPackages: [aClientPackage({ id: "cp1", clientId: "otro-cliente", packageId: "package-1" })],
    });

    const res = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no pertenece/i);
  });

  it.each([
    ["sin sesiones restantes", { remainingSessions: 0, usedSessions: 6 }],
    ["pausado", { status: "PAUSED" }],
    ["terminado", { status: "FINISHED" }],
  ])("rechaza un paquete %s", async (_caso, over) => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" });
    const { app, token } = await setup({ appointments: [appt], ...conPaquete(over) });

    const res = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/disponible/i);
  });

  it("no consume sesión si el pago se rechaza", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, storage, token } = await setup({ appointments: [appt], ...conPaquete() });

    await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });

    expect(storage.clientPackages.get("cp1")!.usedSessions).toBe(0);
  });
});

describe("pagos — validaciones e invariantes", () => {
  it("404 si la cita no existe", async () => {
    const { app, token } = await setup();
    const res = await pay(app, token, "no-existe", { method: "CASH", totalAmount: 100 });
    expect(res.status).toBe(404);
  });

  it("409 al intentar un segundo pago sobre la misma cita", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt] });

    await pay(app, token, "a1", { method: "CASH", totalAmount: 500 });
    const segundo = await pay(app, token, "a1", { method: "CASH", totalAmount: 500 });

    expect(segundo.status).toBe(409);
    expect(segundo.body.message).toMatch(/ya existe un pago/i);
  });

  it("rechaza un método de pago inventado", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt] });

    const res = await pay(app, token, "a1", { method: "BITCOIN", totalAmount: 500 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/método de pago inválido/i);
  });

  it("registrar el pago cierra la cita", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL", status: "ARRIVED" });
    const { app, storage, token } = await setup({ appointments: [appt] });

    await pay(app, token, "a1", { method: "CASH", totalAmount: 500 });

    expect(storage.appointments.get("a1")!.status).toBe("DONE");
  });

  it("un total no numérico cuenta como 0, no como NaN", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" });
    const { app, token } = await setup({ appointments: [appt] });

    const res = await pay(app, token, "a1", { method: "CASH", totalAmount: "no-soy-un-numero" });

    expect(res.body.totalAmount).toBe(0);
    expect(Number.isNaN(res.body.ownerNetAmount)).toBe(false);
  });

  it("exige autenticación", async () => {
    const appt = anAppointment({ id: "a1", clientId: CLIENT });
    const { app } = await setup({ appointments: [appt] });

    const res = await request(app).post("/api/appointments/a1/payment")
      .send({ method: "CASH", totalAmount: 500 });

    expect(res.status).toBe(401);
  });
});

/**
 * Deuda §31 — el dinero de los paquetes no se registraba en ningún sitio, así que el
 * reporte sumaba cero por todo el láser. Ahora vender es cobrar. ADR-0006.
 */
describe("venta de paquete", () => {
  const vender = (app: Express, token: string, body: object) =>
    request(app).post(`/api/clients/${CLIENT}/packages`)
      .set("Authorization", `Bearer ${token}`).send(body);

  const conCatalogo = () => setup({ packages: [aPackage({ id: "pk1", price: 6000, totalSessions: 6 })] });

  it("registra un pago con el precio del catálogo", async () => {
    const { app, storage, token } = await conCatalogo();
    const res = await vender(app, token, { packageId: "pk1", method: "CASH" });

    expect(res.status).toBe(201);
    const pagos = storage.payments.snapshotValues();
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({
      concept: "PAQUETE",
      method: "CASH",
      totalAmount: 6000,
      ownerNetAmount: 6000,
      facialistNetAmount: 0,
      clientId: CLIENT,
    });
  });

  it("el pago no cuelga de ninguna cita", async () => {
    const { app, storage, token } = await conCatalogo();
    await vender(app, token, { packageId: "pk1" });

    expect(storage.payments.snapshotValues()[0].appointmentId).toBeUndefined();
  });

  it("apunta al paquete que se vendió", async () => {
    const { app, storage, token } = await conCatalogo();
    const res = await vender(app, token, { packageId: "pk1" });

    expect(storage.payments.snapshotValues()[0].clientPackageId).toBe(res.body.id);
  });

  it("acepta un importe distinto al del catálogo", async () => {
    const { app, storage, token } = await conCatalogo();
    await vender(app, token, { packageId: "pk1", totalAmount: 5500 });

    expect(storage.payments.snapshotValues()[0].totalAmount).toBe(5500);
  });

  it("sin método, asume efectivo", async () => {
    const { app, storage, token } = await conCatalogo();
    await vender(app, token, { packageId: "pk1" });

    expect(storage.payments.snapshotValues()[0].method).toBe("CASH");
  });

  it("400 con un método que no existe", async () => {
    const { app, token } = await conCatalogo();
    expect((await vender(app, token, { packageId: "pk1", method: "TRUEQUE" })).status).toBe(400);
  });

  it("400 con un importe negativo", async () => {
    const { app, token } = await conCatalogo();
    expect((await vender(app, token, { packageId: "pk1", totalAmount: -1 })).status).toBe(400);
  });

  it("un paquete vendido y sin usar cuenta en el reporte del día", async () => {
    const { app, token } = await conCatalogo();
    await vender(app, token, { packageId: "pk1", method: "CARD" });

    const hoy = new Date();
    const clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const res = await request(app).get(`/api/reports/income?date=${clave}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body).toMatchObject({
      total: 6000,
      porConcepto: { PAQUETE: 6000, CITA: 0 },
      porMetodo: { CARD: 6000, CASH: 0 },
    });
  });

  it("la sesión consumida NO vuelve a sumar: el dinero se cuenta al vender", async () => {
    const { app, storage, token } = await setup({
      packages: [aPackage({ id: "pk1", price: 6000, totalSessions: 6 })],
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" })],
    });
    const venta = await vender(app, token, { packageId: "pk1" });
    await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: venta.body.id });

    const total = storage.payments.snapshotValues().reduce((s, p) => s + p.totalAmount, 0);
    expect(total).toBe(6000);
  });
});

/** Deuda §11 — un cobro mal capturado solo se arreglaba tocando la base a mano. */
describe("anular un pago", () => {
  const anular = (app: Express, token: string, paymentId: string) =>
    request(app).delete(`/api/payments/${paymentId}`).set("Authorization", `Bearer ${token}`);

  it("borra el cobro y devuelve la cita a ARRIVED", async () => {
    const { app, storage, token } = await setup({
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" })],
    });
    const pago = await pay(app, token, "a1", { method: "CASH", totalAmount: 800 });

    const res = await anular(app, token, pago.body.id);

    expect(res.status).toBe(200);
    expect(storage.payments.get(pago.body.id)).toBeUndefined();
    expect(storage.appointments.get("a1")).toMatchObject({ status: "ARRIVED" });
  });

  it("devuelve al paquete la sesión que se había consumido", async () => {
    const { app, storage, token } = await setup({
      packages: [aPackage({ id: "pk1", totalSessions: 6 })],
      clientPackages: [aClientPackage({ id: "cp1", clientId: CLIENT, packageId: "pk1", totalSessions: 6, usedSessions: 0, remainingSessions: 6 })],
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" })],
    });
    const pago = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });
    expect(storage.clientPackages.get("cp1")).toMatchObject({ usedSessions: 1, remainingSessions: 5 });

    await anular(app, token, pago.body.id);

    expect(storage.clientPackages.get("cp1")).toMatchObject({ usedSessions: 0, remainingSessions: 6 });
  });

  it("un paquete agotado y luego anulado vuelve a estar activo", async () => {
    const { app, storage, token } = await setup({
      packages: [aPackage({ id: "pk1", totalSessions: 1 })],
      clientPackages: [aClientPackage({ id: "cp1", clientId: CLIENT, packageId: "pk1", totalSessions: 1, usedSessions: 0, remainingSessions: 1 })],
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" })],
    });
    const pago = await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: "cp1" });
    expect(storage.clientPackages.get("cp1")).toMatchObject({ status: "FINISHED" });

    await anular(app, token, pago.body.id);

    expect(storage.clientPackages.get("cp1")).toMatchObject({ status: "ACTIVE", remainingSessions: 1 });
  });

  it("después de anular se puede volver a cobrar, que es el objetivo", async () => {
    const { app, token } = await setup({
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" })],
    });
    const malo = await pay(app, token, "a1", { method: "CASH", totalAmount: 8000 });
    await anular(app, token, malo.body.id);

    const bueno = await pay(app, token, "a1", { method: "CASH", totalAmount: 800 });

    expect(bueno.status).toBe(201);
    expect(bueno.body.totalAmount).toBe(800);
  });

  it("409 si ya se liquidó a la facialista", async () => {
    const { app, token } = await setup({
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "FACIAL" })],
    });
    const pago = await pay(app, token, "a1", { method: "CASH", totalAmount: 800 });
    await request(app).patch(`/api/payments/${pago.body.id}/facialist-paid`)
      .set("Authorization", `Bearer ${token}`).send({ paid: true });

    const res = await anular(app, token, pago.body.id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ya liquidado/i);
  });

  it("anula una venta de paquete sin usar y borra el paquete", async () => {
    const { app, storage, token } = await setup({ packages: [aPackage({ id: "pk1", price: 6000 })] });
    const venta = await request(app).post(`/api/clients/${CLIENT}/packages`)
      .set("Authorization", `Bearer ${token}`).send({ packageId: "pk1" });

    const res = await anular(app, token, venta.body.payment.id);

    expect(res.status).toBe(200);
    expect(storage.clientPackages.get(venta.body.id)).toBeUndefined();
  });

  it("409 al anular una venta cuyo paquete ya tiene sesiones usadas", async () => {
    const { app, token } = await setup({
      packages: [aPackage({ id: "pk1", price: 6000, totalSessions: 6 })],
      appointments: [anAppointment({ id: "a1", clientId: CLIENT, type: "LASER" })],
    });
    const venta = await request(app).post(`/api/clients/${CLIENT}/packages`)
      .set("Authorization", `Bearer ${token}`).send({ packageId: "pk1" });
    await pay(app, token, "a1", { method: "INCLUDED", clientPackageId: venta.body.id });

    const res = await anular(app, token, venta.body.payment.id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/sesiones usadas/i);
  });

  it("404 si el pago no existe", async () => {
    const { app, token } = await setup();
    expect((await anular(app, token, "no-existe")).status).toBe(404);
  });
});
