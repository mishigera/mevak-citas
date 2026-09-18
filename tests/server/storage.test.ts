jest.mock("../../server/db", () => require("../setup/db-mock"));

import { freshStorage, __dbMock, aClient } from "../setup/server-harness";

/** El flush es un setTimeout de 25 ms (storage.ts:scheduleFlush). */
const flush = () => new Promise((r) => setTimeout(r, 40));

describe("storage — seed inicial", () => {
  it("crea un único usuario ADMIN cuando la base está vacía", async () => {
    const storage = await freshStorage();
    const users = storage.users.snapshotValues();

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ role: "ADMIN", isActive: true, name: "Admin" });
  });

  it("usa ADMIN_EMAIL del entorno cuando está definida", async () => {
    process.env.ADMIN_EMAIL = "jefa@mevak.test";
    const storage = await freshStorage();
    expect(storage.users.snapshotValues()[0].email).toBe("jefa@mevak.test");
    delete process.env.ADMIN_EMAIL;
  });

  it("cae al email por defecto si no hay ADMIN_EMAIL", async () => {
    delete process.env.ADMIN_EMAIL;
    const storage = await freshStorage();
    expect(storage.users.snapshotValues()[0].email).toBe("admin@mevakbeautycenter.com");
  });

  it("no guarda la contraseña en claro", async () => {
    process.env.ADMIN_PASSWORD = "secreto-en-claro";
    const storage = await freshStorage();
    const hash = storage.users.snapshotValues()[0].passwordHash;

    expect(hash).not.toBe("secreto-en-claro");
    expect(hash).toMatch(/^\$2[aby]\$/); // formato bcrypt
    delete process.env.ADMIN_PASSWORD;
  });

  it("siembra las 23 áreas de láser con svgKey único", async () => {
    const storage = await freshStorage();
    const areas = storage.laserAreas.snapshotValues();

    expect(areas).toHaveLength(23);
    expect(new Set(areas.map((a) => a.svgKey)).size).toBe(23);
    expect(areas.every((a) => a.isActive)).toBe(true);
  });

  it("no vuelve a sembrar si ya hay usuarios", async () => {
    const existing = { id: "u1", name: "Ya estaba", email: "x@y.z", passwordHash: "h",
      role: "OWNER", isActive: true, createdAt: "2026-01-01T00:00:00.000Z" };
    const storage = await freshStorage({ users: [existing] });

    expect(storage.users.snapshotValues()).toHaveLength(1);
    expect(storage.users.get("u1")!.name).toBe("Ya estaba");
  });

  it("carga las entidades que ya existían en la base", async () => {
    const storage = await freshStorage({ clients: [aClient({ id: "c9", fullName: "Ana" })] });
    expect(storage.clients.get("c9")!.fullName).toBe("Ana");
  });
});

describe("storage — persistencia", () => {
  it("persiste al hacer set()", async () => {
    const storage = await freshStorage();
    storage.clients.set("c1", aClient({ id: "c1", fullName: "Nueva" }) as never);
    await flush();

    expect(__dbMock.persisted("clients")).toEqual([
      expect.objectContaining({ id: "c1", fullName: "Nueva" }),
    ]);
  });

  it("persiste al hacer delete()", async () => {
    const storage = await freshStorage({ clients: [aClient({ id: "c1" })] });
    storage.clients.delete("c1");
    await flush();

    expect(__dbMock.persisted("clients")).toEqual([]);
  });

  it("no persiste un delete() de una clave que no existe", async () => {
    const storage = await freshStorage();
    await flush();
    const antes = __dbMock.saveCount("clients");

    storage.clients.delete("no-existe");
    await flush();

    expect(__dbMock.saveCount("clients")).toBe(antes);
  });

  it("MUTAR EN SITIO SIN set() NO PERSISTE — la trampa del modelo de storage", async () => {
    const storage = await freshStorage({ clients: [aClient({ id: "c1", fullName: "Original" })] });
    await flush();

    const cliente = storage.clients.get("c1")!;
    cliente.fullName = "Modificado";
    await flush();

    // En memoria sí cambió...
    expect(storage.clients.get("c1")!.fullName).toBe("Modificado");
    // ...pero nunca llegó a la base, porque el flush lo dispara set()/delete().
    expect(__dbMock.saveCount("clients")).toBe(0);
  });

  it("agrupa varias escrituras en un solo flush", async () => {
    const storage = await freshStorage();
    storage.clients.set("c1", aClient({ id: "c1" }) as never);
    storage.clients.set("c2", aClient({ id: "c2" }) as never);
    storage.clients.set("c3", aClient({ id: "c3" }) as never);
    await flush();

    expect(__dbMock.saveCount("clients")).toBe(1);
    expect(__dbMock.persisted("clients")).toHaveLength(3);
  });

  it("clear() vacía y persiste", async () => {
    const storage = await freshStorage({ clients: [aClient({ id: "c1" }), aClient({ id: "c2" })] });
    storage.clients.clear();
    await flush();

    expect(storage.clients.size).toBe(0);
    expect(__dbMock.persisted("clients")).toEqual([]);
  });

  it("replaceAll() reemplaza sin disparar persistencia (es para la carga inicial)", async () => {
    const storage = await freshStorage();
    await flush();
    const antes = __dbMock.saveCount("clients");

    storage.clients.replaceAll([aClient({ id: "cX" }) as never]);
    await flush();

    expect(storage.clients.get("cX")).toBeDefined();
    expect(__dbMock.saveCount("clients")).toBe(antes);
  });
});

describe("storage — tokens", () => {
  it("persiste el token al crearlo", async () => {
    const storage = await freshStorage();
    storage.tokens.set("tok-1", { userId: "u1", role: "ADMIN" });
    await flush();

    expect(__dbMock.persisted("tokens")).toEqual([
      expect.objectContaining({ key: "tok-1", value: { userId: "u1", role: "ADMIN" } }),
    ]);
  });

  it("lo borra al hacer logout", async () => {
    const storage = await freshStorage();
    storage.tokens.set("tok-1", { userId: "u1", role: "ADMIN" });
    await flush();
    storage.tokens.delete("tok-1");
    await flush();

    expect(__dbMock.persisted("tokens")).toEqual([]);
  });

  it("restaura los tokens guardados al arrancar", async () => {
    const storage = await freshStorage({
      tokens: [{ id: "tok-viejo", key: "tok-viejo", value: { userId: "u1", role: "OWNER" } }],
    });

    expect(storage.tokens.get("tok-viejo")).toEqual({ userId: "u1", role: "OWNER" });
  });

  it("ignora filas de token corruptas sin reventar el arranque", async () => {
    const storage = await freshStorage({
      tokens: [
        { id: "ok", key: "ok", value: { userId: "u1", role: "ADMIN" } },
        { id: "roto", key: null, value: null },
        null,
      ],
    });

    expect(storage.tokens.size).toBe(1);
    expect(storage.tokens.get("ok")).toBeDefined();
  });
});
