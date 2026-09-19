/**
 * Harness para los tests de pantallas de `app/`.
 *
 * Cada archivo de test de pantalla debe declarar arriba del todo:
 *   jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, render, screen, fireEvent, waitFor, type RenderOptions } from "@testing-library/react-native";
import { fetch as expoFetch } from "expo/fetch";
import { useLocalSearchParams, router } from "expo-router";

export * from "./auth-mock";

/**
 * Las pantallas ahora animan de verdad (entradas escalonadas, paneles que crecen desde
 * un botón), y con diecisiete archivos en paralelo el segundo por defecto de `waitFor`
 * se queda corto en una máquina cargada: los tests empiezan a fallar por reloj y no por
 * código. Cinco segundos no ralentizan nada —`waitFor` sale en cuanto la condición se
 * cumple— y quitan de en medio esa intermitencia.
 *
 * Va aquí y no en `app-setup.ts` porque ese fichero es `setupFiles`, se ejecuta antes
 * de que exista `expect`, y cargar la librería de testing allí revienta la suite entera.
 */
configure({ asyncUtilTimeout: 5000 });

const mockFetch = expoFetch as unknown as jest.Mock;

/** El router mockeado, para aseverar sobre la navegación. */
export const mockRouter = router as unknown as {
  push: jest.Mock; replace: jest.Mock; back: jest.Mock; navigate: jest.Mock;
  dismiss: jest.Mock; dismissAll: jest.Mock; setParams: jest.Mock;
  canGoBack: jest.Mock;
};

/** Fija los parámetros de ruta que verá la pantalla (`useLocalSearchParams`). */
export function setRouteParams(params: Record<string, string>) {
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(params);
}

/**
 * Anchos de referencia. `movil` es el que se aplica por defecto: las pantallas se
 * escribieron contra el layout compacto y ahi deben seguir comprobandose.
 */
export const VIEWPORTS = {
  movil: { width: 390, height: 844 },
  ipadVertical: { width: 820, height: 1180 },
  ipadApaisado: { width: 1024, height: 768 },
} as const;

type Viewport = { width: number; height: number };

function viewportGlobal() {
  return globalThis as { __mockViewport?: Viewport };
}

/**
 * Cambia el ancho que vera la pantalla (`useBreakpoint`). Se revierte a movil al
 * terminar cada test, así que solo afecta al test que lo llama.
 *
 *   setViewport(VIEWPORTS.ipadApaisado);
 */
export function setViewport(v: Viewport) {
  viewportGlobal().__mockViewport = { ...v };
}

afterEach(() => {
  setViewport(VIEWPORTS.movil);
});

type Respuesta = unknown | ((body: unknown, peticion: { search: string }) => unknown);
type Rutas = Record<string, Respuesta>;

const rutasActivas: Rutas = {};
const llamadas: { method: string; path: string; search: string; body: unknown }[] = [];

/**
 * Define qué responde la API. Las claves son `"GET /api/clients"` o solo `"/api/clients"`
 * (cualquier método). Gana la coincidencia más específica.
 * Un valor función recibe el cuerpo de la petición y sus parámetros (`{ search }`, con
 * el `?`), y devuelve la respuesta: así una misma ruta responde distinto según el día.
 * Para forzar un error: `{ __status: 500, message: "..." }`.
 */
export function mockApi(rutas: Rutas) {
  Object.assign(rutasActivas, rutas);
}

/** Todo lo que la pantalla pidió a la API, en orden. */
export function apiCalls() {
  return llamadas;
}

export function resetApi() {
  Object.keys(rutasActivas).forEach((k) => delete rutasActivas[k]);
  llamadas.length = 0;
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, opciones?: { method?: string; body?: string }) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const method = (opciones?.method ?? "GET").toUpperCase();
    const body = opciones?.body ? JSON.parse(opciones.body) : undefined;
    // `search` aparte del `path`: las rutas se resuelven por ruta, pero hay pantallas
    // (el corte de caja, sin ir más lejos) cuyo comportamiento ESTÁ en los parámetros.
    llamadas.push({ method, path, search: parsed.search, body });

    const definicion =
      rutasActivas[`${method} ${path}`] ?? rutasActivas[path] ?? undefined;

    if (definicion === undefined) {
      return respuesta({ message: `Sin mock para ${method} ${path}` }, 404);
    }

    const valor = typeof definicion === "function"
      ? (definicion as (b: unknown, p: { search: string }) => unknown)(body, { search: parsed.search })
      : definicion;

    const status = (valor as { __status?: number })?.__status;
    return respuesta(valor, status ?? 200);
  });
}

function respuesta(cuerpo: unknown, status: number) {
  const texto = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => texto,
    json: async () => cuerpo,
  };
}

/** Renderiza una pantalla con QueryClient limpio. */
export function renderScreen(ui: React.ReactElement, opciones?: RenderOptions) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  clientesVivos.push(queryClient);
  return { queryClient, ...render(ui, { wrapper, ...opciones }) };
}

/**
 * Los QueryClient dejan observadores y temporizadores activos al terminar el test,
 * y Jest se queja de que el worker no cierra. Se limpian aquí.
 */
const clientesVivos: QueryClient[] = [];

afterEach(() => {
  clientesVivos.forEach((c) => {
    c.cancelQueries();
    c.clear();
    c.unmount();
  });
  clientesVivos.length = 0;
});

/** Datos de ejemplo reutilizables entre pantallas. */
export const fixtures = {
  cliente: (over: Record<string, unknown> = {}) => ({
    id: "c1", fullName: "María López", phone: "5551234567",
    email: "maria@test.com", sex: "F", createdAt: "2026-01-15T10:00:00.000Z", ...over,
  }),
  staff: (over: Record<string, unknown> = {}) => ({
    id: "u1", name: "Dueña", email: "duena@mevak.test", role: "OWNER",
    isActive: true, createdAt: "2026-01-01T00:00:00.000Z", ...over,
  }),
  cita: (over: Record<string, unknown> = {}) => ({
    id: "a1", dateTimeStart: "2026-10-01T10:00:00.000Z",
    dateTimeEnd: "2026-10-01T11:00:00.000Z", clientId: "c1", staffId: "u1",
    type: "FACIAL", status: "SCHEDULED", ...over,
  }),
  servicio: (over: Record<string, unknown> = {}) => ({
    id: "s1", name: "Limpieza facial", type: "FACIAL",
    price: 500, durationMinutes: 60, isActive: true, ...over,
  }),
  paquete: (over: Record<string, unknown> = {}) => ({
    id: "p1", name: "Láser 6 sesiones", type: "LASER",
    totalSessions: 6, price: 6000, isActive: true, ...over,
  }),
  area: (over: Record<string, unknown> = {}) => ({
    id: "la1", name: "Axila", svgKey: "axila", bodySide: "both", isActive: true, ...over,
  }),
};

/**
 * Pulsa el botón que contiene un icono concreto (`<Ionicons name="add" />`).
 * Más estable que buscar por `hitSlop` o por posición: RNTL propaga el press
 * hacia el primer ancestro con manejador.
 */
export function pressIcon(name: string, indice = 0) {
  const iconos = screen.UNSAFE_queryAllByProps({ name });
  const icono = iconos[indice];
  if (!icono) {
    throw new Error(
      `No hay ningún icono "${name}"${indice ? ` en la posición ${indice}` : ""}. ` +
        `Disponibles: ${[...new Set(screen.UNSAFE_queryAllByProps({ size: 24 }).map((n) => n.props.name))].join(", ")}`,
    );
  }
  fireEvent.press(icono);
}

/**
 * Elige una fecha en un `CampoFecha`.
 *
 * Antes la fecha era un `<TextInput>` y bastaba con `changeText`. Ahora se navega por
 * meses hasta el que toca y se pulsa el día, que es justo lo que hace una persona; y
 * así el test tampoco depende de en qué mes esté hoy.
 */
export async function elegirFecha(etiqueta: string, clave: string) {
  const [año, mes, dia] = clave.split("-");
  fireEvent.press(screen.getByLabelText(etiqueta));
  await waitFor(() => expect(screen.getByLabelText("Mes siguiente")).toBeTruthy());

  const objetivo = `Mes visible: ${año}-${mes}`;
  for (let i = 0; i < 48 && !screen.queryByLabelText(objetivo); i++) {
    const [actualAño, actualMes] = screen
      .getByLabelText(/^Mes visible: /)
      .props.accessibilityLabel.replace("Mes visible: ", "")
      .split("-");
    const adelante =
      Number(año) > Number(actualAño) ||
      (año === actualAño && Number(mes) > Number(actualMes));
    fireEvent.press(screen.getByLabelText(adelante ? "Mes siguiente" : "Mes anterior"));
  }

  if (!screen.queryByLabelText(objetivo)) {
    throw new Error(`No se pudo llegar al mes ${año}-${mes} en el selector "${etiqueta}"`);
  }
  fireEvent.press(screen.getByLabelText(String(Number(dia))));
}

/** Elige una hora en un `CampoHora`. Las opciones van de 15 en 15 minutos. */
export async function elegirHora(etiqueta: string, hora: string) {
  fireEvent.press(screen.getByLabelText(etiqueta));
  await waitFor(() => expect(screen.getByLabelText(hora)).toBeTruthy());
  fireEvent.press(screen.getByLabelText(hora));
}
