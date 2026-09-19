jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import {
  buildApp, authAs, aClient, anAppointment, aService, aPackage, aClientPackage, aBlock,
} from "../setup/server-harness";

const ROLES = ["OWNER", "RECEPTION", "FACIALIST"] as const;

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
    const res = await as(app, tokens.OWNER).post("/api/users", {
      name: "Nueva", email: "nueva@m.test", password: "secreta", role: "FACIALIST",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Nueva", role: "FACIALIST", isActive: true });
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("guarda la contraseña hasheada, nunca en claro", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/users", {
      name: "N", email: "n@m.test", password: "en-claro", role: "RECEPTION",
    });

    const creado = storage.users.get(res.body.id)!;
    expect(creado.passwordHash).not.toBe("en-claro");
    expect(creado.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it.each([
    ["name", { email: "a@b.c", password: "p", role: "OWNER" }],
    ["email", { name: "N", password: "p", role: "OWNER" }],
    ["password", { name: "N", email: "a@b.c", role: "OWNER" }],
    ["role", { name: "N", email: "a@b.c", password: "p" }],
  ])("400 si falta %s", async (_c, body) => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).post("/api/users", body)).status).toBe(400);
  });

  it("rechaza email duplicado", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/users", {
      name: "Dup", email: "owner@m.test", password: "p", role: "OWNER",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya registrado/i);
  });

  it("edita nombre y rol", async () => {
    const { app, storage, tokens } = await setup();
    const res = await as(app, tokens.OWNER).patch("/api/users/u-RECEPTION", {
      name: "Renombrada", role: "OWNER",
    });

    expect(res.status).toBe(200);
    expect(storage.users.get("u-RECEPTION")).toMatchObject({ name: "Renombrada", role: "OWNER" });
  });

  it("puede desactivar a un usuario", async () => {
    const { app, storage, tokens } = await setup();
    await as(app, tokens.OWNER).patch("/api/users/u-FACIALIST", { isActive: false });

    expect(storage.users.get("u-FACIALIST")!.isActive).toBe(false);
  });

  it("rehashea al cambiar la contraseña", async () => {
    const { app, storage, tokens } = await setup();
    const antes = storage.users.get("u-OWNER")!.passwordHash;

    await as(app, tokens.OWNER).patch("/api/users/u-OWNER", { password: "nueva-clave" });

    const despues = storage.users.get("u-OWNER")!.passwordHash;
    expect(despues).not.toBe(antes);
    expect(despues).toMatch(/^\$2[aby]\$/);
  });

  it("404 al editar un usuario inexistente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).patch("/api/users/nope", { name: "X" })).status).toBe(404);
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
   * Deuda §17, cerrada en p005 fase C.
   *
   * Al crear, el spread iba después del `clientId` (`{ id, clientId, ...req.body }`), así
   * que un `clientId` en el cuerpo pisaba el de la URL y la ficha se creaba colgada de
   * otra clienta —invisible desde esta, porque el GET filtra por `clientId`—. Son datos
   * médicos y el fallo era silencioso.
   */
  it("al CREAR, manda el clientId de la URL y no el del cuerpo", async () => {
    const { app, storage, tokens } = await setup();

    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", {
      clientId: "cliente-intruso", conditionsJson: {},
    });

    expect(res.body.clientId).toBe("client-1");
    const lectura = await as(app, tokens.OWNER).get("/api/clients/client-1/clinical");
    expect(lectura.body.clientId).toBe("client-1");
    expect(storage.clinicalProfiles.size).toBe(1);
  });

  it("al ACTUALIZAR tampoco se puede cambiar de dueña", async () => {
    const { app, tokens } = await setup();
    await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", { medsText: "Nada" });

    const res = await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", {
      clientId: "cliente-intruso", medsText: "Ibuprofeno",
    });

    expect(res.body.clientId).toBe("client-1");
  });

  /** La facialista también pincha: un dermapen sin saber las alergias es un problema. */
  describe("qué ve cada una de la ficha", () => {
    const completa = {
      allergiesFlag: true, allergiesText: "Penicilina", conditionsJson: { diabetes: true },
      medsText: "Isotretinoína", surgeriesText: "Ninguna",
      phototype: 3, eyeColor: "Café", hairColor: "Negro",
    };

    it("la facialista ve alergias, antecedentes y medicamentos", async () => {
      const { app, tokens } = await setup();
      await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", completa);

      const res = await as(app, tokens.FACIALIST).get("/api/clients/client-1/clinical");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        allergiesFlag: true, allergiesText: "Penicilina", medsText: "Isotretinoína",
        conditionsJson: { diabetes: true },
      });
    });

    it("la facialista NO ve los datos de láser", async () => {
      const { app, tokens } = await setup();
      await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", completa);

      const res = await as(app, tokens.FACIALIST).get("/api/clients/client-1/clinical");

      expect(res.body.phototype).toBeUndefined();
      expect(res.body.eyeColor).toBeUndefined();
      expect(res.body.hairColor).toBeUndefined();
    });

    it("la dueña lo ve todo", async () => {
      const { app, tokens } = await setup();
      await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", completa);

      const res = await as(app, tokens.OWNER).get("/api/clients/client-1/clinical");

      expect(res.body).toMatchObject({ phototype: 3, eyeColor: "Café", allergiesText: "Penicilina" });
    });

    it("la facialista escribe alergias", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.FACIALIST).put("/api/clients/client-1/clinical", {
        allergiesFlag: true, allergiesText: "Ácido glicólico",
      });

      expect(res.status).toBe(200);
      expect(res.body.allergiesText).toBe("Ácido glicólico");
    });

    it("lo que la facialista mande de láser se descarta", async () => {
      const { app, storage, tokens } = await setup();
      await as(app, tokens.OWNER).put("/api/clients/client-1/clinical", completa);

      await as(app, tokens.FACIALIST).put("/api/clients/client-1/clinical", {
        medsText: "Actualizado", phototype: 6, eyeColor: "Verde",
      });

      const guardada = storage.clinicalProfiles.snapshotValues()[0];
      expect(guardada).toMatchObject({ medsText: "Actualizado", phototype: 3, eyeColor: "Café" });
    });

    it("recepción sigue sin ver nada", async () => {
      const { app, tokens } = await setup();
      expect((await as(app, tokens.RECEPTION).get("/api/clients/client-1/clinical")).status).toBe(403);
    });
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
        aClientPackage({ id: "cp-viejo", clientId: "client-1", packageId: "pkg-1", startDate: "2026-01-01T00:00:00" }),
        aClientPackage({ id: "cp-nuevo", clientId: "client-1", packageId: "pkg-1", startDate: "2026-09-01T00:00:00" }),
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
    const res = await as(app, tokens.OWNER).post("/api/services", { name: "Facial", type: "FACIAL", price: "750" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Facial", price: 750, isActive: true });
  });

  it("acepta precio 0 pero no un campo ausente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).post("/api/services", { name: "Gratis", type: "FACIAL", price: 0 })).status).toBe(201);
    expect((await as(app, tokens.OWNER).post("/api/services", { name: "X", type: "FACIAL" })).status).toBe(400);
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

  it("la dueña ve también los inactivos si los pide, para poder reactivarlos", async () => {
    const { app, tokens } = await setup({
      services: [aService({ id: "s1" }), aService({ id: "s2", isActive: false })],
    });

    expect((await as(app, tokens.OWNER).get("/api/services?includeInactive=1")).body).toHaveLength(2);
    expect((await as(app, tokens.OWNER).get("/api/services")).body).toHaveLength(1);
  });

  it("los demás roles no ven los inactivos aunque los pidan", async () => {
    const { app, tokens } = await setup({
      services: [aService({ id: "s1" }), aService({ id: "s2", isActive: false })],
    });

    expect((await as(app, tokens.RECEPTION).get("/api/services?includeInactive=1")).body).toHaveLength(1);
    expect((await as(app, tokens.FACIALIST).get("/api/services?includeInactive=1")).body).toHaveLength(1);
  });

  it("editar un servicio permite desactivarlo (borrado lógico)", async () => {
    const { app, storage, tokens } = await setup({ services: [aService({ id: "s1" })] });
    const res = await as(app, tokens.OWNER).patch("/api/services/s1", { isActive: false, price: 999 });

    expect(res.status).toBe(200);
    expect(storage.services.get("s1")).toMatchObject({ isActive: false, price: 999 });
  });

  it("404 al editar un servicio inexistente", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).patch("/api/services/nope", { price: 1 })).status).toBe(404);
  });

  it("crea un paquete y lo marca como LASER", async () => {
    const { app, storage, tokens } = await setup();
    const [axila] = storage.laserAreas.snapshotValues();
    const res = await as(app, tokens.OWNER).post("/api/packages", {
      name: "P6", totalSessions: "6", price: "6000", areaIds: [axila.id],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "LASER", totalSessions: 6, price: 6000, isActive: true, areaIds: [axila.id] });
  });

  it("400 si al paquete le faltan campos", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).post("/api/packages", { name: "P" })).status).toBe(400);
  });
});

describe("áreas de un paquete", () => {
  const nuevo = { name: "Cara", totalSessions: 10, price: 1000 };

  it("un paquete sin áreas no se crea", async () => {
    const { app, tokens } = await setup();

    const sinCampo = await as(app, tokens.OWNER).post("/api/packages", nuevo);
    const vacio = await as(app, tokens.OWNER).post("/api/packages", { ...nuevo, areaIds: [] });

    expect(sinCampo.status).toBe(400);
    expect(vacio.status).toBe(400);
    expect(vacio.body.message).toMatch(/al menos un área/);
  });

  it("rechaza un área que no está en el catálogo", async () => {
    const { app, storage, tokens } = await setup();
    const [una] = storage.laserAreas.snapshotValues();

    const res = await as(app, tokens.OWNER).post("/api/packages", { ...nuevo, areaIds: [una.id, "inventada"] });

    expect(res.status).toBe(400);
  });

  it("guarda cada área una sola vez", async () => {
    const { app, storage, tokens } = await setup();
    const [a, b] = storage.laserAreas.snapshotValues();

    const res = await as(app, tokens.OWNER).post("/api/packages", { ...nuevo, areaIds: [a.id, b.id, a.id] });

    expect(res.body.areaIds).toEqual([a.id, b.id]);
  });

  it("editar un paquete le cambia las áreas, el nombre y el precio", async () => {
    const { app, storage, tokens } = await setup({ packages: [aPackage({ id: "pk1", name: "cara" })] });
    const [a, b] = storage.laserAreas.snapshotValues();

    const res = await as(app, tokens.OWNER).patch("/api/packages/pk1", { areaIds: [a.id, b.id], name: " Cara completa ", price: 1200 });

    expect(res.status).toBe(200);
    expect(storage.packages.get("pk1")).toMatchObject({ name: "Cara completa", price: 1200, areaIds: [a.id, b.id] });
  });

  it("un PATCH inválido no deja nada a medias", async () => {
    const { app, storage, tokens } = await setup({ packages: [aPackage({ id: "pk1", name: "cara", price: 1000 })] });

    const res = await as(app, tokens.OWNER).patch("/api/packages/pk1", { price: 1500, areaIds: [] });

    expect(res.status).toBe(400);
    expect(storage.packages.get("pk1")).toMatchObject({ name: "cara", price: 1000 });
  });

  it("rechaza sesiones y precio sin sentido, y un nombre vacío", async () => {
    const { app, tokens } = await setup({ packages: [aPackage({ id: "pk1" })] });
    const editar = (body: object) => as(app, tokens.OWNER).patch("/api/packages/pk1", body);

    expect((await editar({ totalSessions: 0 })).status).toBe(400);
    expect((await editar({ totalSessions: 2.5 })).status).toBe(400);
    expect((await editar({ price: -1 })).status).toBe(400);
    expect((await editar({ name: "  " })).status).toBe(400);
  });

  it("404 al editar un paquete que no existe", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).patch("/api/packages/nope", { price: 1 })).status).toBe(404);
  });

  it("vender un paquete suma sus áreas a las de la clienta, sin repetir", async () => {
    const { app, storage, tokens } = await setup();
    const [axila, bigote, frente] = storage.laserAreas.snapshotValues();
    storage.packages.set("pk1", { ...aPackage({ id: "pk1" }), type: "LASER", areaIds: [axila.id, bigote.id] });
    storage.clientLaserSelections.set("s1", { id: "s1", clientId: "client-1", areaId: axila.id });
    storage.clientLaserSelections.set("s2", { id: "s2", clientId: "client-1", areaId: frente.id });

    const res = await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "pk1" });

    expect(res.status).toBe(201);
    const areasDeLaClienta = storage.clientLaserSelections.snapshotValues()
      .filter((s) => s.clientId === "client-1").map((s) => s.areaId);
    expect(areasDeLaClienta.sort()).toEqual([axila.id, bigote.id, frente.id].sort());
    expect(res.body.package.areaIds).toEqual([axila.id, bigote.id]);
  });

  it("vender un paquete viejo, sin áreas, no toca las de la clienta", async () => {
    const { app, storage, tokens } = await setup({ packages: [aPackage({ id: "pk1" })] });

    await as(app, tokens.RECEPTION).post("/api/clients/client-1/packages", { packageId: "pk1" });

    expect(storage.clientLaserSelections.snapshotValues()).toHaveLength(0);
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
    id, appointmentId: `a-${id}`, concept: "CITA", method: "CASH", totalAmount: 1000,
    ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
    createdAt: "2026-09-15T12:00:00.000Z", ...over,
  });

  it("suma totales y cuenta los pagos", async () => {
    const { app, tokens } = await setup({ payments: [pago("p1"), pago("p2")] });
    const res = await as(app, tokens.OWNER).get("/api/reports/income");

    expect(res.body).toMatchObject({ total: 2000, ownerNet: 1000, facialistNet: 1000, count: 2 });
  });

  it("desglosa por método, que es lo que cuadra la caja", async () => {
    const { app, tokens } = await setup({
      payments: [
        pago("efectivo", { method: "CASH", totalAmount: 800 }),
        pago("tarjeta", { method: "CARD", totalAmount: 1200 }),
        pago("incluido", { method: "INCLUDED", totalAmount: 0 }),
      ],
    });

    const res = await as(app, tokens.OWNER).get("/api/reports/income");

    expect(res.body.porMetodo).toEqual({ CASH: 800, CARD: 1200, INCLUDED: 0 });
  });

  it("desglosa por concepto: citas frente a paquetes vendidos", async () => {
    const { app, tokens } = await setup({
      payments: [
        pago("cita", { totalAmount: 800 }),
        pago("venta", { concept: "PAQUETE", appointmentId: undefined, totalAmount: 6000, ownerNetAmount: 6000, facialistNetAmount: 0 }),
      ],
    });

    const res = await as(app, tokens.OWNER).get("/api/reports/income");

    expect(res.body.porConcepto).toEqual({ CITA: 800, PAQUETE: 6000 });
  });

  it("suma lo que falta liquidar a la facialista", async () => {
    const { app, tokens } = await setup({
      payments: [
        pago("debido", { facialistNetAmount: 400, facialistPaidFlag: false }),
        pago("saldado", { facialistNetAmount: 300, facialistPaidFlag: true }),
      ],
    });

    expect((await as(app, tokens.OWNER).get("/api/reports/income")).body.pendienteFacialista).toBe(400);
  });

  /**
   * El corte del día compara contra el reloj local, no contra el prefijo del ISO:
   * `createdAt` lleva `Z` y después de las 18:00 en México su día ya es el siguiente.
   */
  it("filtra por un día concreto", async () => {
    const dia = new Date(2026, 8, 15, 19, 30);
    const otroDia = new Date(2026, 8, 16, 10, 0);
    const { app, tokens } = await setup({
      payments: [
        pago("de-ese-dia", { createdAt: dia.toISOString() }),
        pago("de-otro", { createdAt: otroDia.toISOString() }),
      ],
    });

    const res = await as(app, tokens.OWNER).get("/api/reports/income?date=2026-09-15");

    expect(res.body.count).toBe(1);
    expect(res.body.total).toBe(1000);
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
      .toMatchObject({ total: 0, ownerNet: 0, facialistNet: 0, count: 0 });
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
      startDateTime: "2026-10-01T09:00:00",
      endDateTime: "2026-10-01T13:00:00",
      reason: "Cita médica",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: "u-FACIALIST", reason: "Cita médica" });
  });

  it.each([
    ["faltan fechas", {}, /faltan fechas/i],
    ["fecha inválida", { startDateTime: "no-es-fecha", endDateTime: "2026-10-01T13:00:00" }, /formato de fecha/i],
    ["fin anterior al inicio", { startDateTime: "2026-10-01T13:00:00", endDateTime: "2026-10-01T09:00:00" }, /mayor a inicio/i],
    ["fin igual al inicio", { startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T09:00:00" }, /mayor a inicio/i],
  ])("400 si %s", async (_c, body, mensaje) => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/blocks", body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
  });

  /**
   * Antes cada quien veía solo los suyos y **la recepcionista no veía ninguno**, que es
   * justo la persona que agenda: descubría el bloqueo por un 409 al guardar. Deuda §29.
   */
  it("todo el mundo ve los bloqueos de todo el mundo", async () => {
    const { app, tokens } = await setup({
      availabilityBlocks: [
        aBlock({ id: "b-owner", userId: "u-OWNER" }),
        aBlock({ id: "b-facial", userId: "u-FACIALIST" }),
      ],
    });

    for (const rol of ROLES) {
      const res = await as(app, tokens[rol]).get("/api/blocks");
      expect({ rol, total: res.body.length }).toEqual({ rol, total: 2 });
    }
  });

  it("recepción ve también el bloqueo de centro, sin dueño", async () => {
    const { app, tokens } = await setup({
      availabilityBlocks: [aBlock({ id: "b-centro", userId: null })],
    });

    const res = await as(app, tokens.RECEPTION).get("/api/blocks");

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: "b-centro", userId: null, user: null });
  });

  it("enriquece con el nombre del staff", async () => {
    const { app, tokens } = await setup({ availabilityBlocks: [aBlock({ id: "b1", userId: "u-OWNER" })] });
    const res = await as(app, tokens.OWNER).get("/api/blocks");

    expect(res.body[0].user).toMatchObject({ id: "u-OWNER", name: "OWNER" });
  });

  it("user queda en null si el staff ya no existe", async () => {
    const { app, tokens } = await setup({ availabilityBlocks: [aBlock({ id: "b1", userId: "borrado" })] });
    const res = await as(app, tokens.OWNER).get("/api/blocks");

    expect(res.body[0].user).toBeNull();
  });

  describe("a quién pertenece el bloqueo", () => {
    const horario = {
      startDateTime: "2026-11-02T09:00:00",
      endDateTime: "2026-11-02T18:00:00",
    };

    it("recepción cierra el centro y el bloqueo no es de nadie", async () => {
      const { app, storage, tokens } = await setup();
      const res = await as(app, tokens.RECEPTION).post("/api/blocks", { ...horario, scope: "CENTER", reason: "Festivo" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBeNull();
      expect(storage.availabilityBlocks.get(res.body.id)).toMatchObject({ userId: null });
    });

    it("la dueña también cierra el centro", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.OWNER).post("/api/blocks", { ...horario, scope: "CENTER" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBeNull();
    });

    it("la facialista NO cierra el centro", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.FACIALIST).post("/api/blocks", { ...horario, scope: "CENTER" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/cierran el centro/i);
    });

    it("la dueña bloquea la agenda de la facialista", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.OWNER).post("/api/blocks", { ...horario, userId: "u-FACIALIST" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe("u-FACIALIST");
    });

    it("la facialista NO bloquea la agenda de otra", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.FACIALIST).post("/api/blocks", { ...horario, userId: "u-OWNER" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/agenda de otra persona/i);
    });

    it("la facialista sí bloquea la suya pasando su propio id", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.FACIALIST).post("/api/blocks", { ...horario, userId: "u-FACIALIST" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe("u-FACIALIST");
    });

    it("404 si la agenda es de alguien que no existe", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.OWNER).post("/api/blocks", { ...horario, userId: "fantasma" });

      expect(res.status).toBe(404);
    });

    it("sin scope ni userId, el bloqueo es de quien lo crea", async () => {
      const { app, tokens } = await setup();
      const res = await as(app, tokens.FACIALIST).post("/api/blocks", horario);

      expect(res.body.userId).toBe("u-FACIALIST");
    });
  });
});

describe("horario del centro", () => {
  it("siembra los siete días, con el domingo cerrado", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.RECEPTION).get("/api/center-hours");

    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toMatchObject({ weekday: 0, open: false });
    expect(res.body[1]).toMatchObject({ weekday: 1, open: true, opensAt: "09:00", closesAt: "19:00" });
  });

  it("lo ve todo el staff: es lo que limita al agendar", async () => {
    const { app, tokens } = await setup();
    for (const rol of ROLES) {
      expect((await as(app, tokens[rol]).get("/api/center-hours")).status).toBe(200);
    }
  });

  it("solo la dueña lo cambia", async () => {
    const { app, tokens } = await setup();
    const cambio = [{ weekday: 1, open: true, opensAt: "10:00", closesAt: "20:00" }];

    expect((await as(app, tokens.RECEPTION).put("/api/center-hours", cambio)).status).toBe(403);
    expect((await as(app, tokens.OWNER).put("/api/center-hours", cambio)).status).toBe(200);
  });

  it("guarda el cambio", async () => {
    const { app, storage, tokens } = await setup();
    await as(app, tokens.OWNER).put("/api/center-hours", [
      { weekday: 0, open: true, opensAt: "11:00", closesAt: "15:00" },
    ]);

    expect(storage.centerHours.get("0")).toMatchObject({ open: true, opensAt: "11:00", closesAt: "15:00" });
  });

  it("400 si cierra antes de abrir", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).put("/api/center-hours", [
      { weekday: 1, open: true, opensAt: "19:00", closesAt: "09:00" },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/posterior a la de apertura/i);
  });

  it("400 con una hora que no existe", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).put("/api/center-hours", [
      { weekday: 1, open: true, opensAt: "25:00", closesAt: "26:00" },
    ]);

    expect(res.status).toBe(400);
  });

  it("400 con un día que no es de la semana", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).put("/api/center-hours", [
      { weekday: 9, open: true, opensAt: "09:00", closesAt: "19:00" },
    ]);

    expect(res.status).toBe(400);
  });

  it("400 si no llega una lista", async () => {
    const { app, tokens } = await setup();
    expect((await as(app, tokens.OWNER).put("/api/center-hours", { weekday: 1 })).status).toBe(400);
  });

  it("un día cerrado no necesita horas válidas", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).put("/api/center-hours", [
      { weekday: 0, open: false, opensAt: "", closesAt: "" },
    ]);

    expect(res.status).toBe(200);
  });
});

/** Deuda §32: `Object.assign(x, req.body)` dejaba que el cuerpo pisara el `id`. */
describe("listas blancas al editar", () => {
  it("un id en el cuerpo no mueve al cliente de clave", async () => {
    const { app, storage, tokens } = await setup();
    const antes = storage.clients.snapshotValues().length;

    const res = await as(app, tokens.RECEPTION).patch("/api/clients/client-1", { id: "otro", fullName: "Nuevo" });

    expect(res.body.id).toBe("client-1");
    expect(res.body.fullName).toBe("Nuevo");
    expect(storage.clients.get("otro")).toBeUndefined();
    expect(storage.clients.snapshotValues()).toHaveLength(antes);
  });

  it("ignora campos que no son del cliente", async () => {
    const { app, storage, tokens } = await setup();
    await as(app, tokens.RECEPTION).patch("/api/clients/client-1", { createdAt: "1999-01-01", esVip: true });

    const cliente = storage.clients.get("client-1") as unknown as Record<string, unknown>;
    expect(cliente.createdAt).not.toBe("1999-01-01");
    expect(cliente.esVip).toBeUndefined();
  });

  it("un servicio no cambia de id ni de tipo", async () => {
    const { app, storage, tokens } = await setup({
      services: [{ id: "s1", name: "Limpieza", type: "FACIAL", price: 500, isActive: true }],
    });

    const res = await as(app, tokens.OWNER).patch("/api/services/s1", { id: "s9", type: "LASER", price: 650 });

    expect(res.body).toMatchObject({ id: "s1", type: "FACIAL", price: 650 });
    expect(storage.services.get("s9")).toBeUndefined();
  });

  it("la duración de un servicio se puede editar", async () => {
    const { app, tokens } = await setup({
      services: [{ id: "s1", name: "Limpieza", type: "FACIAL", price: 500, isActive: true }],
    });

    const res = await as(app, tokens.OWNER).patch("/api/services/s1", { durationMinutes: "75" });

    expect(res.body.durationMinutes).toBe(75);
  });
});

describe("duración de los servicios", () => {
  it("sin duración, 60 minutos", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/services", { name: "X", type: "FACIAL", price: 100 });

    expect(res.body.durationMinutes).toBe(60);
  });

  it("guarda la que se indique", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/services", { name: "X", type: "FACIAL", price: 100, durationMinutes: 45 });

    expect(res.body.durationMinutes).toBe(45);
  });

  it("400 con una duración que no tiene sentido", async () => {
    const { app, tokens } = await setup();
    const res = await as(app, tokens.OWNER).post("/api/services", { name: "X", type: "FACIAL", price: 100, durationMinutes: 0 });

    expect(res.status).toBe(400);
  });
});

// Plan p008: sesiones pagadas que nadie ha agendado, para el inicio.
describe("paquetes para reagendar", () => {
  const PASADO = "2020-03-10T10:00:00";
  const FUTURO = "2030-03-10T10:00:00";
  const FUTURO_FIN = "2030-03-10T11:00:00";

  async function conPaquetes(clientPackages: unknown[], appointments: unknown[] = []) {
    return setup({
      clients: [
        aClient({ id: "ana", fullName: "Ana López", phone: "5551112222" }),
        aClient({ id: "eva", fullName: "Eva Sol", phone: "5553334444" }),
      ],
      packages: [aPackage({ id: "package-1", name: "Láser 6 sesiones" })],
      clientPackages,
      appointments,
    });
  }

  it("la clienta con sesiones y ninguna cita por delante, con su última visita", async () => {
    const { app, tokens } = await conPaquetes(
      [aClientPackage({ id: "cp1", clientId: "ana", usedSessions: 2, remainingSessions: 4 })],
      [
        anAppointment({ clientId: "ana", type: "LASER", status: "DONE", dateTimeStart: "2020-01-05T10:00:00", dateTimeEnd: "2020-01-05T11:00:00" }),
        anAppointment({ clientId: "ana", type: "LASER", status: "DONE", dateTimeStart: PASADO, dateTimeEnd: "2020-03-10T11:00:00" }),
        anAppointment({ clientId: "ana", type: "LASER", status: "CANCELLED", dateTimeStart: "2020-06-01T10:00:00", dateTimeEnd: "2020-06-01T11:00:00" }),
      ],
    );

    const res = await as(app, tokens.RECEPTION).get("/api/client-packages/idle");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "cp1",
      remainingSessions: 4,
      totalSessions: 6,
      client: { id: "ana", fullName: "Ana López", phone: "5551112222" },
      package: { name: "Láser 6 sesiones" },
      lastVisit: PASADO,
    });
  });

  it("no sale quien ya tiene una cita de láser agendada", async () => {
    const { app, tokens } = await conPaquetes(
      [aClientPackage({ clientId: "ana" })],
      [anAppointment({ clientId: "ana", type: "LASER", dateTimeStart: FUTURO, dateTimeEnd: FUTURO_FIN })],
    );

    const res = await as(app, tokens.OWNER).get("/api/client-packages/idle");

    expect(res.body).toEqual([]);
  });

  it("una cita facial no cuenta: el paquete sigue sin usarse", async () => {
    const { app, tokens } = await conPaquetes(
      [aClientPackage({ clientId: "ana" })],
      [anAppointment({ clientId: "ana", type: "FACIAL", dateTimeStart: FUTURO, dateTimeEnd: FUTURO_FIN })],
    );

    const res = await as(app, tokens.OWNER).get("/api/client-packages/idle");

    expect(res.body).toHaveLength(1);
  });

  it("una cita vieja que nadie cerró tampoco cuenta como cita por delante", async () => {
    const { app, tokens } = await conPaquetes(
      [aClientPackage({ clientId: "ana" })],
      [anAppointment({ clientId: "ana", type: "LASER", status: "SCHEDULED", dateTimeStart: PASADO, dateTimeEnd: "2020-03-10T11:00:00" })],
    );

    const res = await as(app, tokens.OWNER).get("/api/client-packages/idle");

    expect(res.body).toHaveLength(1);
    expect(res.body[0].lastVisit).toBeNull();
  });

  it("solo paquetes activos con sesiones", async () => {
    const { app, tokens } = await conPaquetes([
      aClientPackage({ clientId: "ana", status: "FINISHED", usedSessions: 6, remainingSessions: 0 }),
      aClientPackage({ clientId: "ana", status: "PAUSED" }),
      aClientPackage({ clientId: "eva", status: "ACTIVE", usedSessions: 6, remainingSessions: 0 }),
    ]);

    const res = await as(app, tokens.OWNER).get("/api/client-packages/idle");

    expect(res.body).toEqual([]);
  });

  it("primero quien lleva más sin venir; si nunca vino, cuenta desde la compra", async () => {
    const { app, tokens } = await conPaquetes(
      [
        aClientPackage({ id: "de-ana", clientId: "ana", startDate: "2019-01-01T00:00:00" }),
        aClientPackage({ id: "de-eva", clientId: "eva", startDate: "2019-06-01T00:00:00" }),
      ],
      [anAppointment({ clientId: "ana", type: "LASER", status: "DONE", dateTimeStart: PASADO, dateTimeEnd: "2020-03-10T11:00:00" })],
    );

    const res = await as(app, tokens.OWNER).get("/api/client-packages/idle");

    // Eva nunca vino y compró en junio de 2019; Ana vino por última vez en marzo de 2020.
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(["de-eva", "de-ana"]);
  });
});
