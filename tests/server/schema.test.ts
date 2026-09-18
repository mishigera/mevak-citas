import { users, insertUserSchema } from "@shared/schema";

/**
 * `shared/schema.ts` es VESTIGIAL (deuda §5): describe una tabla `users` con
 * `username`/`password` que no se parece al `User` real de `server/storage.ts`
 * (`name`, `email`, `passwordHash`, `role`, `isActive`). Nadie lo importa, pero
 * `drizzle.config.ts` lo apunta y `npm run db:push` la crearía.
 *
 * Estos tests fijan lo que el archivo dice hoy, para que borrarlo o convertirlo
 * en el schema de verdad sea una decisión consciente y no un despiste.
 */

describe("shared/schema (vestigial)", () => {
  it("declara la tabla users", () => {
    expect(users).toBeDefined();
  });

  it("el schema de alta solo acepta username y password", () => {
    const parsed = insertUserSchema.parse({ username: "ana", password: "secreta" });

    expect(parsed).toEqual({ username: "ana", password: "secreta" });
  });

  it("descarta los campos que no están en el pick", () => {
    const parsed = insertUserSchema.parse({
      username: "ana", password: "secreta", id: "no-deberia-colarse", role: "ADMIN",
    });

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("role");
  });

  it.each([
    ["sin username", { password: "p" }],
    ["sin password", { username: "u" }],
    ["vacío", {}],
  ])("rechaza %s", (_caso, entrada) => {
    expect(() => insertUserSchema.parse(entrada)).toThrow();
  });

  it("NO describe el modelo real: no tiene email, role ni isActive", () => {
    // Si algún día esto falla, es que el schema se convirtió en el de verdad
    // y hay que cerrar la deuda §5.
    const forma = insertUserSchema.parse({ username: "u", password: "p" });

    expect(Object.keys(forma).sort()).toEqual(["password", "username"]);
  });
});
