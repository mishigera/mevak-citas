jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import { buildApp, authAs, aClient, anAppointment, aBlock } from "../setup/server-harness";

/**
 * Matriz rol × endpoint.
 *
 * Los permisos se declaran DOS veces (requireRole en el servidor y los flags de
 * contexts/auth.tsx en el cliente) sin nada que los mantenga sincronizados — deuda §9.
 * Esta matriz fija el contrato del lado que manda: el servidor.
 *
 * Solo se comprueba la puerta del rol: 403 si está prohibido, cualquier otra cosa si pasa.
 * Un 400 o un 404 significan que el rol fue aceptado y falló más adelante, que es lo
 * que aquí se quiere.
 */

const ROLES = ["OWNER", "RECEPTION", "FACIALIST"] as const;
type Rol = (typeof ROLES)[number];

interface Caso {
  desc: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  permitidos: Rol[];
  body?: object;
}

const CASOS: Caso[] = [
  // Gestión de usuarios: solo la dueña (ADR-0005 fundió ADMIN en OWNER)
  { desc: "crear usuario", method: "post", path: "/api/users", permitidos: ["OWNER"],
    body: { name: "X", email: "x@y.z", password: "p", role: "RECEPTION" } },
  { desc: "editar usuario", method: "patch", path: "/api/users/u1", permitidos: ["OWNER"],
    body: { name: "Y" } },

  // Salud básica: la dueña y la facialista (las dos aplican tratamiento).
  // RECEPTION nunca. El corte entre salud y datos de láser se prueba en routes.crud.
  { desc: "ver historia clínica", method: "get", path: "/api/clients/client-1/clinical",
    permitidos: ["OWNER", "FACIALIST"] },
  { desc: "editar historia clínica", method: "put", path: "/api/clients/client-1/clinical",
    permitidos: ["OWNER", "FACIALIST"], body: { allergiesFlag: false, conditionsJson: {} } },
  { desc: "editar áreas de láser del cliente", method: "put",
    path: "/api/clients/client-1/laser-areas", permitidos: ["OWNER"], body: { areaIds: [] } },

  // Catálogos: solo la dueña
  { desc: "crear servicio", method: "post", path: "/api/services", permitidos: ["OWNER"],
    body: { name: "S", type: "FACIAL", price: 100 } },
  { desc: "editar servicio", method: "patch", path: "/api/services/s1", permitidos: ["OWNER"],
    body: { price: 200 } },
  { desc: "crear paquete", method: "post", path: "/api/packages", permitidos: ["OWNER"],
    body: { name: "P", totalSessions: 6, price: 600 } },
  { desc: "editar paquete", method: "patch", path: "/api/packages/package-1", permitidos: ["OWNER"],
    body: { price: 700 } },

  // Venta de paquetes: la dueña y recepción
  { desc: "vender paquete a cliente", method: "post", path: "/api/clients/client-1/packages",
    permitidos: ["OWNER", "RECEPTION"], body: { packageId: "package-1" } },

  // Sesión de láser: solo la dueña
  { desc: "editar sesión de láser", method: "put", path: "/api/appointments/appt-1/laser-session",
    permitidos: ["OWNER"], body: { notes: "n" } },

  // Dinero: solo la dueña
  { desc: "liquidar a la facialista", method: "patch", path: "/api/payments/p1/facialist-paid",
    permitidos: ["OWNER"], body: {} },
  { desc: "ver pagos pendientes", method: "get", path: "/api/payments/pending-facialist",
    permitidos: ["OWNER"] },
  { desc: "ver reporte de ingresos", method: "get", path: "/api/reports/income",
    permitidos: ["OWNER"] },

  // Inicio (p008): las sesiones pagadas sin agendar son para quien agenda.
  { desc: "ver paquetes para reagendar", method: "get", path: "/api/client-packages/idle",
    permitidos: ["OWNER", "RECEPTION"] },

  // Bloqueos: las tres. Recepción es quien agenda, tiene que poder cerrar el centro.
  { desc: "crear bloqueo", method: "post", path: "/api/blocks",
    permitidos: ["OWNER", "RECEPTION", "FACIALIST"],
    body: { startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T10:00:00" } },
];

async function appConRoles() {
  const users = ROLES.map((role) => ({
    id: `u-${role}`, name: role, email: `${role.toLowerCase()}@m.test`, passwordHash: "h",
    role, isActive: true, createdAt: "2026-01-01T00:00:00.000Z",
  }));

  const { app, storage } = await buildApp({
    users,
    clients: [aClient({ id: "client-1" })],
    appointments: [anAppointment({ id: "appt-1", clientId: "client-1" })],
    availabilityBlocks: [aBlock({ id: "block-1" })],
  });

  const tokens = Object.fromEntries(
    ROLES.map((role) => [role, authAs(storage, `u-${role}`, role)]),
  ) as Record<Rol, string>;

  return { app, storage, tokens };
}

const llamar = (app: Express, c: Caso, token?: string) => {
  const req = request(app)[c.method](c.path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return c.body !== undefined ? req.send(c.body) : req;
};

describe("matriz de permisos rol × endpoint", () => {
  CASOS.forEach((caso) => {
    describe(caso.desc, () => {
      ROLES.forEach((rol) => {
        const deberiaPasar = caso.permitidos.includes(rol);

        it(`${rol} ${deberiaPasar ? "pasa la puerta del rol" : "recibe 403"}`, async () => {
          const { app, tokens } = await appConRoles();
          const res = await llamar(app, caso, tokens[rol]);

          if (deberiaPasar) {
            expect(res.status).not.toBe(403);
            expect(res.status).not.toBe(401);
          } else {
            expect(res.status).toBe(403);
          }
        });
      });

      it("401 sin token", async () => {
        const { app } = await appConRoles();
        const res = await llamar(app, caso);
        expect(res.status).toBe(401);
      });
    });
  });
});

describe("borrar bloqueo: puerta de rol + regla de propiedad", () => {
  /**
   * Este endpoint devuelve 403 por DOS motivos distintos (routes.ts:502-507):
   * el rol, y ser dueño del bloqueo. Por eso no entra en la matriz genérica.
   */
  it("RECEPTION borra el bloqueo de cualquiera: gestiona la agenda", async () => {
    const { app, storage, tokens } = await appConRoles();
    storage.availabilityBlocks.set("ajeno", aBlock({ id: "ajeno", userId: "u-FACIALIST" }) as never);

    const res = await request(app).delete("/api/blocks/ajeno")
      .set("Authorization", `Bearer ${tokens.RECEPTION}`);

    expect(res.status).toBe(200);
  });

  it("FACIALIST borra su propio bloqueo", async () => {
    const { app, storage, tokens } = await appConRoles();
    storage.availabilityBlocks.set("mio", aBlock({ id: "mio", userId: "u-FACIALIST" }) as never);

    const res = await request(app).delete("/api/blocks/mio")
      .set("Authorization", `Bearer ${tokens.FACIALIST}`);

    expect(res.status).toBe(200);
    expect(storage.availabilityBlocks.get("mio")).toBeUndefined();
  });

  it("FACIALIST NO borra el bloqueo de otro", async () => {
    const { app, storage, tokens } = await appConRoles();
    storage.availabilityBlocks.set("ajeno", aBlock({ id: "ajeno", userId: "u-OWNER" }) as never);

    const res = await request(app).delete("/api/blocks/ajeno")
      .set("Authorization", `Bearer ${tokens.FACIALIST}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/otro usuario/i);
    expect(storage.availabilityBlocks.get("ajeno")).toBeDefined();
  });

  it("OWNER sí borra el bloqueo de otro: gestiona la agenda", async () => {
    const { app, storage, tokens } = await appConRoles();
    storage.availabilityBlocks.set("ajeno", aBlock({ id: "ajeno", userId: "u-FACIALIST" }) as never);

    const res = await request(app).delete("/api/blocks/ajeno")
      .set("Authorization", `Bearer ${tokens.OWNER}`);

    expect(res.status).toBe(200);
  });

  it("404 si el bloqueo no existe", async () => {
    const { app, tokens } = await appConRoles();
    const res = await request(app).delete("/api/blocks/no-existe")
      .set("Authorization", `Bearer ${tokens.OWNER}`);
    expect(res.status).toBe(404);
  });

  it("401 sin token", async () => {
    const { app } = await appConRoles();
    expect((await request(app).delete("/api/blocks/block-1")).status).toBe(401);
  });
});

describe("invariantes de permisos", () => {
  it("OWNER pasa la puerta de todos los endpoints protegidos", async () => {
    const { app, tokens } = await appConRoles();
    for (const caso of CASOS) {
      const res = await llamar(app, caso, tokens.OWNER);
      expect({ endpoint: caso.desc, status: res.status })
        .not.toMatchObject({ status: 403 });
    }
  });

  it("RECEPTION no accede a ningún dato clínico", async () => {
    const { app, tokens } = await appConRoles();
    const clinicos = CASOS.filter((c) => /clínica|láser del cliente/.test(c.desc));

    expect(clinicos.length).toBeGreaterThan(0);
    for (const caso of clinicos) {
      const res = await llamar(app, caso, tokens.RECEPTION);
      expect(res.status).toBe(403);
    }
  });

  it("FACIALIST no ve reportes ni pagos pendientes", async () => {
    const { app, tokens } = await appConRoles();
    for (const path of ["/api/reports/income", "/api/payments/pending-facialist"]) {
      const res = await request(app).get(path)
        .set("Authorization", `Bearer ${tokens.FACIALIST}`);
      expect(res.status).toBe(403);
    }
  });

  it("un token con rol manipulado no escala privilegios", async () => {
    const { app, storage } = await appConRoles();
    // Token que dice OWNER pero apunta a un usuario RECEPTION real.
    const falso = "token-falsificado";
    storage.tokens.set(falso, { userId: "u-RECEPTION", role: "OWNER" as never, issuedAt: new Date().toISOString() });

    const res = await request(app).post("/api/services")
      .set("Authorization", `Bearer ${falso}`)
      .send({ name: "S", type: "FACIAL", price: 100 });

    // Antes la autoridad era el rol guardado en el token y esto pasaba. Desde la deuda
    // §2 el rol se lee del usuario en cada petición: el del token no cuenta.
    expect(res.status).toBe(403);
  });

  it("cambiar el rol de alguien surte efecto sin que vuelva a entrar", async () => {
    const { app, storage, tokens } = await appConRoles();
    const user = storage.users.get("u-RECEPTION")!;
    user.role = "OWNER";
    storage.users.set(user.id, user);

    const res = await request(app).get("/api/reports/income")
      .set("Authorization", `Bearer ${tokens.RECEPTION}`);

    expect(res.status).toBe(200);
  });
});

describe("endpoints de solo lectura abiertos a cualquier rol autenticado", () => {
  it.each([
    "/api/users/staff", "/api/clients", "/api/services", "/api/packages",
    "/api/laser-areas", "/api/appointments", "/api/blocks", "/api/center-hours",
  ])("%s responde 200 a los tres roles", async (path) => {
    const { app, tokens } = await appConRoles();
    for (const rol of ROLES) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${tokens[rol]}`);
      expect(res.status).toBe(200);
    }
  });

  it.each(["/api/users", "/api/clients", "/api/appointments"])(
    "%s exige token", async (path) => {
      const { app } = await appConRoles();
      expect((await request(app).get(path)).status).toBe(401);
    });

  /** Deuda §33: cualquiera listaba nombre, correo y rol de todo el staff. */
  it("GET /api/users es solo de la dueña", async () => {
    const { app, tokens } = await appConRoles();

    for (const rol of ["RECEPTION", "FACIALIST"] as const) {
      const res = await request(app).get("/api/users").set("Authorization", `Bearer ${tokens[rol]}`);
      expect({ rol, status: res.status }).toEqual({ rol, status: 403 });
    }
  });

  it("GET /api/users nunca expone passwordHash", async () => {
    const { app, tokens } = await appConRoles();
    const res = await request(app).get("/api/users")
      .set("Authorization", `Bearer ${tokens.OWNER}`);

    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((u: object) => expect(u).not.toHaveProperty("passwordHash"));
  });

  it("GET /api/users/staff no expone correos", async () => {
    const { app, tokens } = await appConRoles();
    const res = await request(app).get("/api/users/staff")
      .set("Authorization", `Bearer ${tokens.FACIALIST}`);

    res.body.forEach((u: object) => expect(u).not.toHaveProperty("email"));
  });
});
