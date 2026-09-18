/**
 * `server/index.ts` es un IIFE: al importarlo monta los middlewares y llama a
 * `server.listen`. Para testearlo sin abrir un puerto se mockea `./routes`, que es
 * quien crea el servidor HTTP — y de paso se captura la app de Express ya configurada.
 */
import request from "supertest";
import type { Express } from "express";

const mockListen = jest.fn((_opts: unknown, cb?: () => void) => cb?.());
const mockCapturadas: Express[] = [];
let mockMontar: ((app: Express) => void) | null = null;

jest.mock("../../server/routes", () => ({
  registerRoutes: jest.fn(async (app: Express) => {
    mockCapturadas.push(app);
    // Las rutas de prueba se montan AQUÍ, donde irían las reales: antes del
    // manejador de errores. Si se añadieran después, Express no lo usaría.
    mockMontar?.(app);
    return { listen: mockListen };
  }),
}));

const envOriginal = { ...process.env };

/**
 * OJO: el entorno NO se restaura aquí sino en afterEach. El middleware de CORS lee
 * `process.env.ALLOWED_ORIGINS` en cada petición (index.ts:20), no al cargar el módulo,
 * así que restaurarlo antes de la petición dejaría el test sin efecto.
 */
async function arrancar(
  env: Record<string, string | undefined> = {},
  montar?: (app: Express) => void,
) {
  jest.resetModules();
  mockCapturadas.length = 0;
  mockListen.mockClear();
  mockMontar = montar ?? null;

  Object.entries(env).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });

  require("../../server/index");
  await new Promise((r) => setImmediate(r));

  return mockCapturadas[0];
}

afterEach(() => {
  process.env = { ...envOriginal };
});

// Silencia los logs de arranque del server.
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("arranque", () => {
  it("escucha en el puerto 5000 por defecto", async () => {
    await arrancar({ PORT: undefined });

    expect(mockListen).toHaveBeenCalledWith(
      expect.objectContaining({ port: 5000 }), expect.any(Function),
    );
  });

  it("respeta la variable PORT", async () => {
    await arrancar({ PORT: "8080" });

    expect(mockListen).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8080 }), expect.any(Function),
    );
  });
});

describe("CORS", () => {
  it("refleja el origin si está en ALLOWED_ORIGINS", async () => {
    const app = await arrancar({ ALLOWED_ORIGINS: "https://app.mevak.com,https://otro.com" });

    const res = await request(app).get("/api/x").set("Origin", "https://app.mevak.com");

    expect(res.headers["access-control-allow-origin"]).toBe("https://app.mevak.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("ignora espacios y entradas vacías en ALLOWED_ORIGINS", async () => {
    const app = await arrancar({ ALLOWED_ORIGINS: "  https://app.mevak.com ,, " });

    const res = await request(app).get("/api/x").set("Origin", "https://app.mevak.com");

    expect(res.headers["access-control-allow-origin"]).toBe("https://app.mevak.com");
  });

  it("no refleja un origin desconocido", async () => {
    const app = await arrancar({ ALLOWED_ORIGINS: "https://app.mevak.com" });

    const res = await request(app).get("/api/x").set("Origin", "https://malicioso.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it.each([
    "http://localhost:8081",
    "http://127.0.0.1:19006",
    "https://localhost:3000",
    "https://127.0.0.1:5173",
  ])("acepta %s por la excepción de desarrollo", async (origin) => {
    const app = await arrancar({ ALLOWED_ORIGINS: undefined });

    const res = await request(app).get("/api/x").set("Origin", origin);

    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("responde 200 al preflight OPTIONS", async () => {
    const app = await arrancar({ ALLOWED_ORIGINS: "https://app.mevak.com" });

    const res = await request(app).options("/api/x").set("Origin", "https://app.mevak.com");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
  });

  /**
   * DEUDA §10 — la excepción de localhost no mira NODE_ENV, así que también aplica
   * en producción, y con credenciales permitidas. El test lo deja por escrito.
   */
  it("la excepción de localhost sigue activa con NODE_ENV=production (deuda §10)", async () => {
    const app = await arrancar({ NODE_ENV: "production", ALLOWED_ORIGINS: undefined });

    const res = await request(app).get("/api/x").set("Origin", "http://localhost:9999");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:9999");
  });
});

describe("parseo del cuerpo", () => {
  it("expone el cuerpo crudo en req.rawBody", async () => {
    let visto: unknown;
    const app = await arrancar({}, (a) =>
      a.post("/api/eco", (req, res) => {
        visto = (req as { rawBody?: unknown }).rawBody;
        res.json(req.body);
      }),
    );

    const res = await request(app).post("/api/eco").send({ hola: "mundo" });

    expect(res.body).toEqual({ hola: "mundo" });
    expect(Buffer.isBuffer(visto)).toBe(true);
  });

  it("acepta formularios urlencoded", async () => {
    const app = await arrancar({}, (a) => a.post("/api/form", (req, res) => res.json(req.body)));

    const res = await request(app).post("/api/form").type("form").send("a=1&b=2");

    expect(res.body).toEqual({ a: "1", b: "2" });
  });
});

describe("manejador de errores", () => {
  it("usa el status del error y devuelve su mensaje", async () => {
    const app = await arrancar({}, (a) =>
      a.get("/api/boom", () => {
        throw Object.assign(new Error("No encontrado"), { status: 404 });
      }),
    );

    const res = await request(app).get("/api/boom");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No encontrado" });
  });

  it("acepta statusCode además de status", async () => {
    const app = await arrancar({}, (a) =>
      a.get("/api/boom", () => {
        throw Object.assign(new Error("Prohibido"), { statusCode: 403 });
      }),
    );

    expect((await request(app).get("/api/boom")).status).toBe(403);
  });

  it("cae a 500 y a Internal Server Error si el error no dice nada", async () => {
    const app = await arrancar({}, (a) =>
      a.get("/api/boom", () => {
        throw {};
      }),
    );

    const res = await request(app).get("/api/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal Server Error" });
  });
});

describe("servido del frontend", () => {
  it("las rutas /api no se tragan el catch-all del SPA", async () => {
    const app = await arrancar({}, (a) => a.get("/api/ping", (_req, res) => res.json({ ok: true })));

    const res = await request(app).get("/api/ping");

    expect(res.body).toEqual({ ok: true });
  });

  it("sirve el index.html del build estático para rutas del cliente", async () => {
    const app = await arrancar();

    const res = await request(app).get("/cualquier/ruta/del/spa");

    // static-build/index.html existe en el repo; si faltara, el server devuelve 503.
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) expect(res.body.message).toMatch(/static-build/);
  });
});

describe("log de peticiones", () => {
  it("registra solo las rutas /api", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const app = await arrancar({}, (a) => a.get("/api/loggeada", (_req, res) => res.json({ ok: true })));
    spy.mockClear();

    await request(app).get("/api/loggeada");
    await new Promise((r) => setImmediate(r));

    const lineas = spy.mock.calls.map((c) => String(c[0]));
    expect(lineas.some((l) => l.includes("GET /api/loggeada 200"))).toBe(true);
    spy.mockRestore();
  });

  it("recorta las líneas largas a 80 caracteres", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const app = await arrancar({}, (a) =>
      a.get("/api/larga", (_req, res) => res.json({ relleno: "x".repeat(500) })),
    );
    spy.mockClear();

    await request(app).get("/api/larga");
    await new Promise((r) => setImmediate(r));

    const linea = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("/api/larga"));
    expect(linea!.length).toBeLessThanOrEqual(80);
    expect(linea).toMatch(/…$/);
    spy.mockRestore();
  });
});
