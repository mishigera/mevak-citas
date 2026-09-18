/**
 * Reemplazo en memoria de `server/db.ts`.
 *
 * Existe porque importar `server/storage.ts` construye `new DbStorage()` en el acto
 * (storage.ts:374) y el constructor llama a `ensureDbReady()` → conexión real a Postgres.
 * Sin este mock, cualquier test que toque el server intenta abrir un pool.
 *
 * Solo simula `loadEntity`/`saveEntity`, que son triviales: leer y escribir un array.
 */

/**
 * El estado cuelga de `globalThis` a propósito: `freshStorage()` llama a
 * `jest.resetModules()`, que reinstancia este módulo y le daría un `Map` nuevo a
 * `server/storage` — distinto del que ve el test. Anclarlo aquí lo mantiene compartido.
 */
type MockState = { store: Map<string, unknown[]>; saves: string[] };
const g = globalThis as { __dbMockState?: MockState };
g.__dbMockState ??= { store: new Map(), saves: [] };

const store = g.__dbMockState.store;
const saves = g.__dbMockState.saves;

export const __dbMock = {
  reset() {
    store.clear();
    saves.length = 0;
  },
  /**
   * Precarga una entidad como si ya estuviera en la base.
   * Clona en profundidad a propósito: varias rutas mutan los objetos en sitio
   * (p. ej. `payment.facialistPaidFlag = ...`), y sin clonar eso contaminaría
   * el fixture compartido entre tests.
   */
  seed(entity: string, values: unknown[]) {
    store.set(entity, structuredClone(values));
  },
  /** Lo que quedó persistido para una entidad. */
  persisted<T = unknown>(entity: string): T[] {
    return (store.get(entity) ?? []) as T[];
  },
  saves,
  /** Cuántas veces se persistió una entidad. */
  saveCount(entity: string) {
    return saves.filter((e) => e === entity).length;
  },
};

export const ensureDbReady = jest.fn(async (): Promise<void> => {});

export const loadEntity = jest.fn(async <T>(entity: string): Promise<T[]> => {
  return (store.get(entity) ?? []) as T[];
});

export const saveEntity = jest.fn(
  async <T extends { id: string }>(entity: string, values: Iterable<T>): Promise<void> => {
    store.set(entity, Array.from(values));
    saves.push(entity);
  },
);

export const getDbPool = jest.fn(() => {
  throw new Error("getDbPool no debe usarse en tests: la capa de datos está mockeada");
});
