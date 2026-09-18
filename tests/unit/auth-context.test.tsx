import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch as expoFetch } from "expo/fetch";
import { AuthProvider, useAuth, type Role } from "@/contexts/auth";
import { getAuthToken } from "@/lib/query-client";

const mockFetch = expoFetch as unknown as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const usuario = (role: Role = "OWNER") => ({
  id: "u1", name: "Dueña", email: "duena@mevak.test", role,
});

const ok = (body: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body }) as never;

const falla = (status = 401, body: unknown = { message: "Unauthorized" }) =>
  ({ ok: false, status, statusText: "", text: async () => JSON.stringify(body), json: async () => body }) as never;

/** Monta el hook y espera a que termine la comprobación inicial de sesión. */
async function montar() {
  const vista = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(vista.result.current.isLoading).toBe(false));
  return vista;
}

beforeEach(async () => {
  mockFetch.mockReset();
  await AsyncStorage.clear();
});

describe("arranque sin sesión previa", () => {
  it("termina de cargar sin usuario", async () => {
    const { result } = await montar();

    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("no llama al servidor si no hay token guardado", async () => {
    await montar();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("restaurar sesión guardada", () => {
  beforeEach(async () => {
    await AsyncStorage.setItem("auth_token", "token-guardado");
    await AsyncStorage.setItem("auth_user", JSON.stringify(usuario()));
  });

  it("revalida contra /api/auth/me y restaura al usuario", async () => {
    mockFetch.mockResolvedValue(ok(usuario()));

    const { result } = await montar();

    expect(result.current.user).toMatchObject({ id: "u1", role: "OWNER" });
    expect(mockFetch.mock.calls[0][0]).toContain("/api/auth/me");
  });

  it("manda el token guardado como Bearer", async () => {
    mockFetch.mockResolvedValue(ok(usuario()));
    await montar();

    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token-guardado");
  });

  it("refresca los datos del usuario con lo que responde el servidor", async () => {
    mockFetch.mockResolvedValue(ok({ ...usuario(), name: "Nombre Nuevo", role: "ADMIN" }));

    const { result } = await montar();

    expect(result.current.user).toMatchObject({ name: "Nombre Nuevo", role: "ADMIN" });
    expect(JSON.parse((await AsyncStorage.getItem("auth_user"))!)).toMatchObject({ name: "Nombre Nuevo" });
  });

  it("si el token ya no vale, limpia la sesión guardada", async () => {
    mockFetch.mockResolvedValue(falla(401));

    const { result } = await montar();

    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem("auth_token")).toBeNull();
    expect(await AsyncStorage.getItem("auth_user")).toBeNull();
  });

  it("si el servidor no responde, no deja la app colgada cargando", async () => {
    mockFetch.mockRejectedValue(new Error("Sin red"));

    const { result } = await montar();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("no revalida si falta uno de los dos valores guardados", async () => {
    await AsyncStorage.removeItem("auth_user");

    await montar();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("guarda usuario y token tras entrar", async () => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(ok({ token: "token-fresco", ...usuario() }));

    await act(async () => {
      await result.current.login("duena@mevak.test", "secreta");
    });

    expect(result.current.user).toMatchObject({ id: "u1", role: "OWNER" });
    expect(await AsyncStorage.getItem("auth_token")).toBe("token-fresco");
  });

  it("deja el token listo para las siguientes peticiones", async () => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(ok({ token: "token-fresco", ...usuario() }));

    await act(async () => {
      await result.current.login("duena@mevak.test", "secreta");
    });

    expect(getAuthToken()).toBe("token-fresco");
  });

  it("no guarda el token en el objeto de usuario", async () => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(ok({ token: "token-fresco", ...usuario() }));

    await act(async () => {
      await result.current.login("duena@mevak.test", "secreta");
    });

    expect(result.current.user).not.toHaveProperty("token");
    expect(await AsyncStorage.getItem("auth_user")).not.toContain("token-fresco");
  });

  it("propaga el error de credenciales y no deja sesión a medias", async () => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(falla(401, { message: "Credenciales incorrectas" }));

    await expect(
      act(async () => {
        await result.current.login("duena@mevak.test", "mal");
      }),
    ).rejects.toMatchObject({ message: "Credenciales incorrectas" });

    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem("auth_token")).toBeNull();
  });
});

describe("logout", () => {
  async function conSesion() {
    const vista = await montar();
    mockFetch.mockResolvedValue(ok({ token: "token-activo", ...usuario() }));
    await act(async () => {
      await vista.result.current.login("duena@mevak.test", "secreta");
    });
    mockFetch.mockReset();
    return vista;
  }

  it("avisa al servidor y borra la sesión local", async () => {
    const { result } = await conSesion();
    mockFetch.mockResolvedValue(ok({ ok: true }));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockFetch.mock.calls[0][0]).toContain("/api/auth/logout");
    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem("auth_token")).toBeNull();
    expect(getAuthToken()).toBeNull();
  });

  it("cierra sesión igualmente si el servidor falla", async () => {
    const { result } = await conSesion();
    mockFetch.mockRejectedValue(new Error("Sin red"));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(await AsyncStorage.getItem("auth_token")).toBeNull();
  });

  it("no llama al servidor si no había sesión", async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.logout();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("permisos por rol", () => {
  /**
   * Estos flags duplican lo que `requireRole` hace en el servidor (deuda §9).
   * La tabla debe coincidir con `tests/server/routes.permissions.test.ts`.
   */
  const esperado: Record<Role, Record<string, boolean>> = {
    ADMIN: { canViewClinical: true, canManageServices: true, canViewReports: true, canCreateBlocks: true, isOwnerOrAdmin: true },
    OWNER: { canViewClinical: true, canManageServices: false, canViewReports: true, canCreateBlocks: true, isOwnerOrAdmin: true },
    RECEPTION: { canViewClinical: false, canManageServices: false, canViewReports: false, canCreateBlocks: false, isOwnerOrAdmin: false },
    FACIALIST: { canViewClinical: false, canManageServices: false, canViewReports: false, canCreateBlocks: true, isOwnerOrAdmin: false },
  };

  it.each(Object.keys(esperado) as Role[])("%s tiene los flags correctos", async (role) => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(ok({ token: "t", ...usuario(role) }));

    await act(async () => {
      await result.current.login("x@y.z", "p");
    });

    Object.entries(esperado[role]).forEach(([flag, valor]) => {
      expect({ [flag]: result.current[flag as keyof typeof result.current] })
        .toEqual({ [flag]: valor });
    });
  });

  it("sin sesión, todos los permisos están cerrados", async () => {
    const { result } = await montar();

    expect(result.current.canViewClinical).toBe(false);
    expect(result.current.canManageServices).toBe(false);
    expect(result.current.canViewReports).toBe(false);
    expect(result.current.canCreateBlocks).toBe(false);
    expect(result.current.isOwnerOrAdmin).toBe(false);
  });

  it("los permisos se cierran al salir", async () => {
    const { result } = await montar();
    mockFetch.mockResolvedValue(ok({ token: "t", ...usuario("ADMIN") }));
    await act(async () => {
      await result.current.login("x@y.z", "p");
    });
    expect(result.current.canManageServices).toBe(true);

    mockFetch.mockResolvedValue(ok({ ok: true }));
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.canManageServices).toBe(false);
  });
});

describe("useAuth fuera del provider", () => {
  it("falla con un mensaje claro", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useAuth())).toThrow(/must be inside AuthProvider/i);

    spy.mockRestore();
  });
});
