/**
 * Utilidades para los tests de `server/`.
 *
 * Todo test que use esto debe declarar arriba del todo:
 *   jest.mock("../../server/db", () => require("../setup/db-mock"));
 */
import express, { type Express } from "express";
import { __dbMock } from "./db-mock";

export { __dbMock };

type Storage = typeof import("../../server/storage").storage;

/**
 * Devuelve una instancia limpia de `storage`, con el módulo recargado.
 * `storage` es un singleton de módulo, así que sin `resetModules` los tests se contaminan.
 */
export async function freshStorage(seed: Record<string, unknown[]> = {}): Promise<Storage> {
  jest.resetModules();
  __dbMock.reset();
  for (const [entity, values] of Object.entries(seed)) {
    __dbMock.seed(entity, values);
  }
  const mod = require("../../server/storage") as typeof import("../../server/storage");
  await mod.storage.ready;
  return mod.storage;
}

/** App de Express con las rutas montadas, lista para supertest. */
export async function buildApp(
  seed: Record<string, unknown[]> = {},
): Promise<{ app: Express; storage: Storage }> {
  const storage = await freshStorage(seed);
  const { registerRoutes } = require("../../server/routes") as typeof import("../../server/routes");

  const app = express();
  app.use(express.json());
  await registerRoutes(app);

  return { app, storage };
}

/**
 * Inserta un token de sesión directamente, sin pasar por el login.
 * Evita el coste de bcrypt en los tests que solo necesitan estar autenticados.
 */
export function authAs(storage: Storage, userId: string, role: string): string {
  const token = `test-token-${role}-${userId}`;
  storage.tokens.set(token, { userId, role: role as never });
  return token;
}

/** Cabecera Authorization lista para encadenar en supertest. */
export function bearer(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}

// ---------------------------------------------------------------------------
// Factories. Campos mínimos con defaults sensatos; se sobrescribe lo que importe.
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function aUser(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("user"),
    name: "Staff",
    email: `staff${seq}@mevak.test`,
    // hash de "password123", precalculado para no pagar bcrypt en cada factory
    passwordHash: "$2b$10$KIXQJ8sQZ9vN3jJ5vZ8Z9eF7yF5Z8Z9eF7yF5Z8Z9eF7yF5Z8Z9e",
    role: "RECEPTION",
    isActive: true,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export function aClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("client"),
    fullName: "Cliente de prueba",
    phone: "5550000000",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export function anAppointment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("appt"),
    dateTimeStart: "2026-10-01T10:00:00.000Z",
    dateTimeEnd: "2026-10-01T11:00:00.000Z",
    clientId: "client-1",
    staffId: "user-1",
    type: "FACIAL",
    status: "SCHEDULED",
    ...over,
  };
}

export function aService(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("service"),
    name: "Limpieza facial",
    type: "FACIAL",
    price: 500,
    isActive: true,
    ...over,
  };
}

export function aPackage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("package"),
    name: "Paquete láser 6 sesiones",
    type: "LASER",
    totalSessions: 6,
    price: 6000,
    isActive: true,
    ...over,
  };
}

export function aClientPackage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("cpkg"),
    clientId: "client-1",
    packageId: "package-1",
    totalSessions: 6,
    usedSessions: 0,
    remainingSessions: 6,
    startDate: "2026-09-01T00:00:00.000Z",
    status: "ACTIVE",
    ...over,
  };
}

export function aBlock(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextId("block"),
    userId: "user-1",
    startDateTime: "2026-10-02T09:00:00.000Z",
    endDateTime: "2026-10-02T13:00:00.000Z",
    reason: "Vacaciones",
    ...over,
  };
}
