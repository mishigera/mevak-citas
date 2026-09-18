import { fetch as expoFetch } from "expo/fetch";

type QC = typeof import("@/lib/query-client");

const mockFetch = expoFetch as unknown as jest.Mock;

function load(env: Record<string, string | undefined> = {}): QC {
  jest.resetModules();
  Object.entries(env).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  return require("@/lib/query-client");
}

const respuesta = (body: unknown, { ok = true, status = 200 } = {}) =>
  ({
    ok, status, statusText: "",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  }) as unknown as Response;

const envLimpio = {
  EXPO_PUBLIC_API_URL: undefined,
  EXPO_PUBLIC_DOMAIN: undefined,
};

beforeEach(() => {
  mockFetch.mockReset();
  delete (globalThis as { location?: unknown }).location;
});

describe("getApiUrl", () => {
  it("usa EXPO_PUBLIC_API_URL cuando está definida", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://localhost:5050" });
    expect(getApiUrl()).toBe("http://localhost:5050/");
  });

  it("antepone https:// a un dominio sin protocolo", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "api.mevak.com" });
    expect(getApiUrl()).toBe("https://api.mevak.com/");
  });

  it("respeta https:// explícito", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "https://api.mevak.com" });
    expect(getApiUrl()).toBe("https://api.mevak.com/");
  });

  it("ignora espacios alrededor", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "  http://localhost:5050  " });
    expect(getApiUrl()).toBe("http://localhost:5050/");
  });

  it("cae a EXPO_PUBLIC_DOMAIN si no hay API_URL", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_DOMAIN: "mevak.com" });
    expect(getApiUrl()).toBe("https://mevak.com/");
  });

  it("prefiere API_URL sobre DOMAIN", () => {
    const { getApiUrl } = load({
      EXPO_PUBLIC_API_URL: "http://uno.test",
      EXPO_PUBLIC_DOMAIN: "dos.test",
    });
    expect(getApiUrl()).toBe("http://uno.test/");
  });

  it("en navegador usa el host actual", () => {
    (globalThis as { location?: unknown }).location = { protocol: "https:", host: "app.mevak.com" };
    const { getApiUrl } = load(envLimpio);
    expect(getApiUrl()).toBe("https://app.mevak.com/");
  });

  it("cae a localhost:5000 sin entorno ni navegador", () => {
    const { getApiUrl } = load(envLimpio);
    expect(getApiUrl()).toBe("http://localhost:5000/");
  });

  it("lanza si la URL configurada está vacía", () => {
    const { getApiUrl } = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "   " });
    expect(() => getApiUrl()).toThrow(/empty/i);
  });
});

describe("token de autenticación", () => {
  it("se guarda y se recupera", () => {
    const { setAuthToken, getAuthToken } = load(envLimpio);
    setAuthToken("abc123");
    expect(getAuthToken()).toBe("abc123");
  });

  it("se puede limpiar", () => {
    const { setAuthToken, getAuthToken } = load(envLimpio);
    setAuthToken("abc123");
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });

  it("viaja como Bearer en la cabecera", async () => {
    const qc = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://api.test" });
    qc.setAuthToken("mi-token");
    mockFetch.mockResolvedValue(respuesta({ ok: true }));

    await qc.apiRequest("GET", "/api/clients");

    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer mi-token");
  });

  it("no manda cabecera si no hay sesión", async () => {
    const qc = load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://api.test" });
    mockFetch.mockResolvedValue(respuesta({ ok: true }));

    await qc.apiRequest("GET", "/api/clients");

    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
});

describe("apiRequest", () => {
  const cargar = () => load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://api.test" });

  it("compone la URL absoluta a partir del path", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({}));

    await qc.apiRequest("GET", "/api/clients");

    expect(mockFetch.mock.calls[0][0]).toBe("http://api.test/api/clients");
  });

  it("serializa el cuerpo y pone Content-Type", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({}));

    await qc.apiRequest("POST", "/api/clients", { fullName: "Ana" });

    const [, opciones] = mockFetch.mock.calls[0];
    expect(opciones.method).toBe("POST");
    expect(opciones.body).toBe(JSON.stringify({ fullName: "Ana" }));
    expect(opciones.headers["Content-Type"]).toBe("application/json");
  });

  it("sin cuerpo no manda Content-Type", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({}));

    await qc.apiRequest("GET", "/api/clients");

    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty("Content-Type");
  });
});

describe("manejo de errores", () => {
  const cargar = () => load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://api.test" });

  it("extrae el message de un error JSON del servidor", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(
      respuesta({ message: "Credenciales incorrectas" }, { ok: false, status: 401 }),
    );

    await expect(qc.apiRequest("POST", "/api/auth/login", {}))
      .rejects.toMatchObject({ status: 401, message: "Credenciales incorrectas" });
  });

  it("usa el cuerpo crudo si no es JSON", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta("Se cayó el servidor", { ok: false, status: 500 }));

    await expect(qc.apiRequest("GET", "/api/x"))
      .rejects.toMatchObject({ status: 500, message: "Se cayó el servidor" });
  });

  it("cae a HTTP <status> si el cuerpo viene vacío", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta("", { ok: false, status: 503 }));

    await expect(qc.apiRequest("GET", "/api/x"))
      .rejects.toMatchObject({ status: 503, message: "HTTP 503" });
  });

  it("guarda el cuerpo completo en details", async () => {
    const qc = cargar();
    const cuerpo = { message: "Faltan campos", campos: ["phone"] };
    mockFetch.mockResolvedValue(respuesta(cuerpo, { ok: false, status: 400 }));

    await expect(qc.apiRequest("POST", "/api/clients", {}))
      .rejects.toMatchObject({ details: cuerpo });
  });

  it("no lanza con una respuesta correcta", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({ id: "1" }));

    await expect(qc.apiRequest("GET", "/api/clients/1")).resolves.toBeDefined();
  });

  describe("getErrorMessage", () => {
    it("usa el mensaje de un ApiError", () => {
      const { getErrorMessage, ApiError } = cargar();
      expect(getErrorMessage(new ApiError(404, "No encontrado"))).toBe("No encontrado");
    });

    it("usa el mensaje de un Error normal", () => {
      const { getErrorMessage } = cargar();
      expect(getErrorMessage(new Error("Se rompió"))).toBe("Se rompió");
    });

    it("cae al texto por defecto con algo que no es un error", () => {
      const { getErrorMessage } = cargar();
      expect(getErrorMessage("una cadena suelta")).toBe("Error inesperado");
      expect(getErrorMessage(null, "Vaya")).toBe("Vaya");
    });
  });
});

describe("getQueryFn", () => {
  const cargar = () => load({ ...envLimpio, EXPO_PUBLIC_API_URL: "http://api.test" });

  it("arma la URL uniendo el queryKey con /", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta([]));

    await qc.getQueryFn({ on401: "throw" })({ queryKey: ["/api/clients", "c1"] } as never);

    expect(mockFetch.mock.calls[0][0]).toBe("http://api.test/api/clients/c1");
  });

  it("devuelve null ante un 401 si así se configura", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({}, { ok: false, status: 401 }));

    const fn = qc.getQueryFn({ on401: "returnNull" });
    await expect(fn({ queryKey: ["/api/auth/me"] } as never)).resolves.toBeNull();
  });

  it("lanza ante un 401 si está en modo throw", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({ message: "Unauthorized" }, { ok: false, status: 401 }));

    const fn = qc.getQueryFn({ on401: "throw" });
    await expect(fn({ queryKey: ["/api/auth/me"] } as never)).rejects.toMatchObject({ status: 401 });
  });

  it("propaga errores que no son 401 aunque esté en returnNull", async () => {
    const qc = cargar();
    mockFetch.mockResolvedValue(respuesta({ message: "Boom" }, { ok: false, status: 500 }));

    const fn = qc.getQueryFn({ on401: "returnNull" });
    await expect(fn({ queryKey: ["/api/x"] } as never)).rejects.toMatchObject({ status: 500 });
  });
});

describe("configuración del QueryClient", () => {
  it("no refetchea solo: staleTime infinito y sin reintentos", () => {
    const { queryClient } = load(envLimpio);
    const opciones = queryClient.getDefaultOptions();

    expect(opciones.queries).toMatchObject({
      staleTime: Infinity, retry: false, refetchOnWindowFocus: false, refetchInterval: false,
    });
    expect(opciones.mutations).toMatchObject({ retry: false });
  });
});
