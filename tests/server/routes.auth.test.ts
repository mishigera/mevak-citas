jest.mock("../../server/db", () => require("../setup/db-mock"));

import request from "supertest";
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { buildApp, authAs } from "../setup/server-harness";

const PASSWORD = "contraseña-correcta";
let hash: string;

beforeAll(async () => {
  hash = await bcrypt.hash(PASSWORD, 10);
});

const usuario = (over: Record<string, unknown> = {}) => ({
  id: "u1", name: "Dueña", email: "duena@mevak.test", passwordHash: hash,
  role: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

const login = (app: Express, body: object) =>
  request(app).post("/api/auth/login").send(body);

describe("login", () => {
  it("devuelve token y datos del usuario con credenciales correctas", async () => {
    const { app } = await buildApp({ users: [usuario()] });

    const res = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "u1", name: "Dueña", role: "OWNER" });
    expect(typeof res.body.token).toBe("string");
  });

  it("NUNCA devuelve el hash de la contraseña", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    const res = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(res.body).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(hash);
  });

  it("registra el token en storage para que valga en las siguientes peticiones", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    const res = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(storage.tokens.get(res.body.token)).toEqual({
      userId: "u1", role: "OWNER", issuedAt: expect.any(String),
    });
  });

  it("emite un token distinto en cada login", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    const a = await login(app, { email: "duena@mevak.test", password: PASSWORD });
    const b = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(a.body.token).not.toBe(b.body.token);
  });

  it.each([
    ["contraseña incorrecta", { email: "duena@mevak.test", password: "otra-cosa" }],
    ["email inexistente", { email: "nadie@mevak.test", password: PASSWORD }],
    ["sin cuerpo", {}],
  ])("401 con %s", async (_caso, body) => {
    const { app } = await buildApp({ users: [usuario()] });
    const res = await login(app, body);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Credenciales incorrectas");
  });

  it("no deja entrar a un usuario desactivado", async () => {
    const { app } = await buildApp({ users: [usuario({ isActive: false })] });
    const res = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it("el mensaje de error no distingue entre email inexistente y contraseña mala", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    const sinUsuario = await login(app, { email: "nadie@x.test", password: PASSWORD });
    const malPass = await login(app, { email: "duena@mevak.test", password: "mal" });

    // No debe filtrar qué emails existen.
    expect(sinUsuario.body.message).toBe(malPass.body.message);
  });
});

describe("requireAuth", () => {
  it("deja pasar con un token válido", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    const token = authAs(storage, "u1", "OWNER");

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "u1", email: "duena@mevak.test", role: "OWNER" });
  });

  it("/api/auth/me no filtra el hash", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    const token = authAs(storage, "u1", "OWNER");

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it.each([
    ["sin cabecera", undefined],
    ["token inventado", "Bearer token-que-no-existe"],
    ["sin el prefijo Bearer", "token-suelto"],
    ["Bearer vacío", "Bearer "],
    ["esquema equivocado", "Basic dXNlcjpwYXNz"],
  ])("401 %s", async (_caso, header) => {
    const { app } = await buildApp({ users: [usuario()] });
    const req = request(app).get("/api/auth/me");
    if (header) req.set("Authorization", header);

    expect((await req).status).toBe(401);
  });
});

describe("logout", () => {
  it("invalida el token", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    const out = await request(app).post("/api/auth/logout")
      .set("Authorization", `Bearer ${body.token}`);
    expect(out.status).toBe(200);

    const despues = await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${body.token}`);
    expect(despues.status).toBe(401);
  });

  it("exige estar autenticado", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    expect((await request(app).post("/api/auth/logout")).status).toBe(401);
  });

  it("solo cierra la sesión usada, no las demás del mismo usuario", async () => {
    const { app } = await buildApp({ users: [usuario()] });
    const a = await login(app, { email: "duena@mevak.test", password: PASSWORD });
    const b = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${a.body.token}`);

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${b.body.token}`);
    expect(res.status).toBe(200);
  });
});

/** Deuda §2, cerrada en p005 fase D. Antes un token valía para siempre. */
describe("caducidad y revocación de sesiones", () => {
  const TTL_ORIGINAL = process.env.TOKEN_TTL_DAYS;
  afterEach(() => {
    process.env.TOKEN_TTL_DAYS = TTL_ORIGINAL;
    jest.useRealTimers();
  });

  it("desactivar a alguien cierra sus sesiones al momento", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    const u = storage.users.get("u1")!;
    storage.users.set("u1", { ...u, isActive: false });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(401);
    // Y el token se borra, no se queda ocupando sitio.
    expect(storage.tokens.get(body.token)).toBeUndefined();
  });

  it("desactivar desde la API también revoca, sin esperar a la siguiente petición", async () => {
    const { app, storage } = await buildApp({ users: [usuario(), usuario({ id: "u2", email: "facial@mevak.test", role: "FACIALIST" })] });
    const dueña = await login(app, { email: "duena@mevak.test", password: PASSWORD });
    const facialista = await login(app, { email: "facial@mevak.test", password: PASSWORD });

    await request(app).patch("/api/users/u2")
      .set("Authorization", `Bearer ${dueña.body.token}`).send({ isActive: false });

    expect(storage.tokens.get(facialista.body.token)).toBeUndefined();
  });

  it("cambiar la contraseña cierra las sesiones abiertas", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    await request(app).patch("/api/users/u1")
      .set("Authorization", `Bearer ${body.token}`).send({ password: "otra-clave" });

    expect(storage.tokens.get(body.token)).toBeUndefined();
  });

  it("un token caduca pasados los días configurados", async () => {
    process.env.TOKEN_TTL_DAYS = "7";
    const { app } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    jest.useFakeTimers({ now: Date.now() + 8 * 86_400_000, doNotFake: ["nextTick", "setImmediate"] });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(401);
  });

  it("dentro del plazo sigue valiendo", async () => {
    process.env.TOKEN_TTL_DAYS = "7";
    const { app } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    jest.useFakeTimers({ now: Date.now() + 6 * 86_400_000, doNotFake: ["nextTick", "setImmediate"] });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(200);
  });

  it("sin TOKEN_TTL_DAYS, 30 días", async () => {
    delete process.env.TOKEN_TTL_DAYS;
    const { app } = await buildApp({ users: [usuario()] });
    const { body } = await login(app, { email: "duena@mevak.test", password: PASSWORD });

    jest.useFakeTimers({ now: Date.now() + 31 * 86_400_000, doNotFake: ["nextTick", "setImmediate"] });

    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`)).status).toBe(401);
  });

  it("un token sin fecha no vale", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    storage.tokens.set("viejo", { userId: "u1", role: "OWNER" });

    expect((await request(app).get("/api/auth/me").set("Authorization", "Bearer viejo")).status).toBe(401);
  });

  it("un token de un usuario que ya no existe no vale", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    storage.tokens.set("huerfano", { userId: "borrado", role: "OWNER", issuedAt: new Date().toISOString() });

    expect((await request(app).get("/api/auth/me").set("Authorization", "Bearer huerfano")).status).toBe(401);
  });

  it("el login barre los tokens caducados", async () => {
    const { app, storage } = await buildApp({ users: [usuario()] });
    storage.tokens.set("rancio", { userId: "u1", role: "OWNER", issuedAt: "2020-01-01T00:00:00.000Z" });

    await login(app, { email: "duena@mevak.test", password: PASSWORD });

    expect(storage.tokens.get("rancio")).toBeUndefined();
  });
});
