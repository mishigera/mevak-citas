import { Pool } from "pg";

let _pool: Pool | null = null;

function getDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL no está configurada");
  }
  return dbUrl;
}

export function getDbPool(): Pool {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  return _pool;
}

export async function ensureDbReady() {
  const pool = getDbPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_entity_state (
      entity TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function loadEntity<T>(entity: string): Promise<T[]> {
  const pool = getDbPool();
  const result = await pool.query<{ payload: unknown }>(
    "SELECT payload FROM app_entity_state WHERE entity = $1",
    [entity],
  );

  if (!result.rows.length) return [];
  const payload = result.rows[0].payload;
  if (!Array.isArray(payload)) return [];
  return payload as T[];
}

export async function saveEntity<T extends { id: string }>(entity: string, values: Iterable<T>) {
  const pool = getDbPool();
  const payload = JSON.stringify(Array.from(values));

  await pool.query(
    `
      INSERT INTO app_entity_state (entity, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (entity)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [entity, payload],
  );
}
