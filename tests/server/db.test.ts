/**
 * A diferencia del resto de tests del server, aquí NO se mockea `./db`: es el sujeto.
 * Lo que se mockea es `pg`, para no necesitar un Postgres de verdad.
 */
const mockQuery = jest.fn();
const mockPoolCtor = jest.fn(() => ({ query: mockQuery }));

jest.mock("pg", () => ({ Pool: mockPoolCtor }));

type Db = typeof import("../../server/db");

function loadDb(): Db {
  jest.resetModules();
  return require("../../server/db");
}

const URL_VALIDA = "postgresql://user:pass@localhost:5432/db";

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [] });
  mockPoolCtor.mockClear();
  process.env.DATABASE_URL = URL_VALIDA;
});

afterAll(() => {
  delete process.env.DATABASE_URL;
});

describe("configuración de la conexión", () => {
  it("toma la cadena de DATABASE_URL", () => {
    const db = loadDb();
    db.getDbPool();

    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: URL_VALIDA }),
    );
  });

  it("falla con un mensaje claro si DATABASE_URL no está definida", () => {
    delete process.env.DATABASE_URL;
    const db = loadDb();

    expect(() => db.getDbPool()).toThrow("DATABASE_URL no está configurada");
  });

  it("falla también si DATABASE_URL está vacía", () => {
    process.env.DATABASE_URL = "";
    const db = loadDb();

    expect(() => db.getDbPool()).toThrow("DATABASE_URL no está configurada");
  });

  it("NO deja credenciales hardcodeadas: sin entorno, no hay conexión posible", () => {
    // Cierra la deuda §1: si alguien vuelve a escribir una cadena en el código,
    // este test deja de pasar.
    delete process.env.DATABASE_URL;
    const db = loadDb();

    expect(() => db.getDbPool()).toThrow();
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it("configura el pool con límite y timeout de inactividad", () => {
    loadDb().getDbPool();

    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ max: 10, idleTimeoutMillis: 30_000 }),
    );
  });

  it("reutiliza el mismo pool en llamadas sucesivas", () => {
    const db = loadDb();
    const a = db.getDbPool();
    const b = db.getDbPool();

    expect(a).toBe(b);
    expect(mockPoolCtor).toHaveBeenCalledTimes(1);
  });
});

describe("ensureDbReady", () => {
  it("crea la tabla app_entity_state si no existe", async () => {
    await loadDb().ensureDbReady();

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS app_entity_state/);
    expect(sql).toMatch(/entity TEXT PRIMARY KEY/);
    expect(sql).toMatch(/payload JSONB NOT NULL/);
  });
});

describe("loadEntity", () => {
  it("devuelve el array guardado", async () => {
    mockQuery.mockResolvedValue({ rows: [{ payload: [{ id: "1" }, { id: "2" }] }] });

    await expect(loadDb().loadEntity("clients")).resolves.toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("consulta por el nombre de la entidad", async () => {
    await loadDb().loadEntity("appointments");

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE entity = $1"), ["appointments"]);
  });

  it("devuelve [] si la entidad no tiene fila", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await expect(loadDb().loadEntity("clients")).resolves.toEqual([]);
  });

  it.each([
    ["un objeto", { no: "soy un array" }],
    ["null", null],
    ["un número", 42],
    ["una cadena", "texto"],
  ])("devuelve [] si el payload es %s en vez de un array", async (_caso, payload) => {
    mockQuery.mockResolvedValue({ rows: [{ payload }] });

    await expect(loadDb().loadEntity("clients")).resolves.toEqual([]);
  });
});

describe("saveEntity", () => {
  it("hace upsert del array completo como JSONB", async () => {
    await loadDb().saveEntity("clients", [{ id: "1", nombre: "Ana" }]);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO app_entity_state/);
    expect(sql).toMatch(/ON CONFLICT \(entity\)/);
    expect(sql).toMatch(/DO UPDATE SET payload = EXCLUDED\.payload/);
    expect(params[0]).toBe("clients");
    expect(JSON.parse(params[1] as string)).toEqual([{ id: "1", nombre: "Ana" }]);
  });

  it("acepta cualquier iterable, no solo arrays", async () => {
    const mapa = new Map([["a", { id: "a" }], ["b", { id: "b" }]]);

    await loadDb().saveEntity("clients", mapa.values());

    expect(JSON.parse(mockQuery.mock.calls[0][1][1] as string)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("guarda un array vacío sin romperse", async () => {
    await loadDb().saveEntity("clients", []);

    expect(JSON.parse(mockQuery.mock.calls[0][1][1] as string)).toEqual([]);
  });

  it("refresca updated_at en cada escritura", async () => {
    await loadDb().saveEntity("clients", []);

    expect(mockQuery.mock.calls[0][0]).toMatch(/updated_at = NOW\(\)/);
  });
});
