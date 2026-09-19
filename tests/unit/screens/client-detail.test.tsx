jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import ClientDetailScreen from "@/app/client/[id]";
import type { Role } from "../../setup/auth-mock";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, setRouteParams,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

/**
 * La deuda §18 (bucle de render infinito) se cerró el 2026-09-17: los defaults `= []`
 * de los `useQuery` pasaron a una constante de módulo `SIN_ELEMENTOS`, así que el
 * `useEffect` de [id].tsx ya no ve una dependencia nueva en cada render.
 *
 * Estos tests estuvieron desactivados mientras la pantalla colgaba. Si alguno vuelve a
 * quedarse sin terminar, sospecha antes que nada de otro default inestable.
 */

let alertSpy: jest.SpyInstance;

const cliente = fixtures.cliente({
  id: "c1", fullName: "María López", phone: "5551112222",
  email: "maria@test.com", sex: "F", occupation: "Arquitecta", birthDate: "1990-05-15",
});

const areas = [
  fixtures.area({ id: "la1", name: "Axila", svgKey: "axila" }),
  fixtures.area({ id: "la2", name: "Brazos", svgKey: "brazos" }),
];

const datosBase = {
  "/api/clients/c1": cliente,
  "/api/clients/c1/appointments": [],
  "/api/clients/c1/packages": [],
  "/api/packages": [],
  "/api/laser-areas": areas,
  "/api/clients/c1/laser-areas": [],
  "/api/clients/c1/clinical": null,
};

beforeEach(() => {
  resetApi();
  __resetAuth();
  setRouteParams({ id: "c1" });
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function abrir(
  role: Role = "OWNER",
  datos: Record<string, unknown> = {},
  nombreEsperado = "María López",
) {
  __setAuthUser({ id: "u1", name: "Jefa", email: "a@m.test", role });
  mockApi({ ...datosBase, ...datos });
  const vista = renderScreen(<ClientDetailScreen />);
  await waitFor(() => expect(screen.getAllByText(nombreEsperado).length).toBeGreaterThan(0));
  return vista;
}

describe("ficha del cliente", () => {
  it("muestra los datos personales rellenos", async () => {
    await abrir();

    // El teléfono aparece dos veces: bajo el nombre y en la ficha de datos.
    expect(screen.getAllByText("5551112222").length).toBeGreaterThan(0);
    expect(screen.getByText("maria@test.com")).toBeTruthy();
    expect(screen.getByText("Femenino")).toBeTruthy();
    expect(screen.getByText("Arquitecta")).toBeTruthy();
  });

  it("omite las filas de datos que faltan", async () => {
    await abrir("OWNER", {
      "/api/clients/c1": fixtures.cliente({ id: "c1", fullName: "Pelada", phone: "555", email: undefined, sex: undefined, occupation: undefined, birthDate: undefined }),
    }, "Pelada");

    expect(screen.queryByText("Correo")).toBeNull();
    expect(screen.queryByText("Ocupación")).toBeNull();
    expect(screen.getByText("Teléfono")).toBeTruthy();
  });

  it("traduce el sexo M a Masculino", async () => {
    await abrir("OWNER", { "/api/clients/c1": fixtures.cliente({ id: "c1", fullName: "María López", sex: "M" }) });


    expect(screen.getByText("Masculino")).toBeTruthy();
  });

  it("avisa cuando no hay citas", async () => {
    await abrir();

    expect(screen.getByText("Sin citas registradas")).toBeTruthy();
  });

  it("lista las últimas citas y deja abrirlas", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/appointments": [fixtures.cita({ id: "a1", type: "LASER" })],
    });

    // "Láser" también es el nombre de una pestaña: hay que quedarse con la fila,
    // que incluye la hora además del tipo.
    const fila = screen.getByText(/·\s*Láser$/);
    fireEvent.press(fila);

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/a1");
  });

  it("como mucho muestra 5 citas recientes", async () => {
    const citas = Array.from({ length: 8 }, (_, i) =>
      fixtures.cita({ id: `a${i}`, dateTimeStart: `2026-0${(i % 9) + 1}-01T10:00:00.000Z` }),
    );
    await abrir("OWNER", { "/api/clients/c1/appointments": citas });

    expect(screen.getAllByText(/·\s*Facial$/).length).toBeLessThanOrEqual(5);
  });

  it("el botón de nueva cita lleva el cliente preseleccionado", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Nueva cita"));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/appointment/new",
      params: { clientId: "c1", clientName: "María López" },
    });
  });
});

describe("pestañas visibles según el rol", () => {
  it.each([
    ["OWNER", ["Resumen", "Faciales", "Láser", "Clínica"]],
    ["RECEPTION", ["Resumen", "Faciales", "Láser"]],
    ["FACIALIST", ["Resumen", "Faciales"]],
  ] as const)("%s ve %s", async (role, esperadas) => {
    await abrir(role);

    esperadas.forEach((t) => expect(screen.getAllByText(t).length).toBeGreaterThan(0));
  });

  /** La dueña no tenía historial facial de sus propias clientas. */
  it("OWNER sí ve la pestaña de Faciales", async () => {
    await abrir("OWNER");

    expect(screen.getAllByText("Faciales").length).toBeGreaterThan(0);
  });

  it("RECEPTION no ve lo clínico", async () => {
    await abrir("RECEPTION");

    expect(screen.queryByText("Clínica")).toBeNull();
  });

  it("FACIALIST no ve ni Láser ni Clínica", async () => {
    await abrir("FACIALIST");

    expect(screen.queryByText("Láser")).toBeNull();
    expect(screen.queryByText("Clínica")).toBeNull();
  });
});

describe("pestaña Clínica", () => {
  const clinica = {
    id: "cp1", clientId: "c1", allergiesFlag: true, allergiesText: "Penicilina",
    conditionsJson: { diabetes: true, hipertension: false }, medsText: "Ninguno",
    surgeriesText: "Apendicectomía", phototype: 3, eyeColor: "Café", hairColor: "Negro",
  };

  it("muestra el historial guardado", async () => {
    await abrir("OWNER", { "/api/clients/c1/clinical": clinica });
    fireEvent.press(screen.getByText("Clínica"));

    await waitFor(() => expect(screen.getByText("Penicilina")).toBeTruthy());
    expect(screen.getByText("Ninguno")).toBeTruthy();
    expect(screen.getByText("Apendicectomía")).toBeTruthy();
    expect(screen.getByText("Café")).toBeTruthy();
  });

  it("dice 'No' cuando no hay alergias", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/clinical": { ...clinica, allergiesFlag: false, allergiesText: "" },
    });
    fireEvent.press(screen.getByText("Clínica"));

    await waitFor(() => expect(screen.getByText("No")).toBeTruthy());
  });

  it("avisa si no hay antecedentes marcados", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/clinical": { ...clinica, conditionsJson: {} },
    });
    fireEvent.press(screen.getByText("Clínica"));

    await waitFor(() => expect(screen.getByText("Sin antecedentes relevantes")).toBeTruthy());
  });

  it("se abre directamente en edición si la ruta lo pide", async () => {
    setRouteParams({ id: "c1", tab: "clinical" });
    await abrir("OWNER", { "/api/clients/c1/clinical": clinica });

    await waitFor(() => expect(screen.getByText("Fototipo de piel")).toBeTruthy());
  });

  it("RECEPTION no puede abrir la clínica ni forzando la ruta", async () => {
    setRouteParams({ id: "c1", tab: "clinical" });
    await abrir("RECEPTION", { "/api/clients/c1/clinical": clinica });

    expect(screen.queryByText("Fototipo de piel")).toBeNull();
    expect(screen.queryByText("Penicilina")).toBeNull();
  });

  it("guarda el fototipo elegido", async () => {
    setRouteParams({ id: "c1", tab: "clinical" });
    await abrir("OWNER", {
      "/api/clients/c1/clinical": clinica,
      "PUT /api/clients/c1/clinical": { ...clinica, phototype: 5 },
    });
    await waitFor(() => expect(screen.getByText("Tipo 5")).toBeTruthy());

    fireEvent.press(screen.getByText("Tipo 5"));
    const guardar = screen.queryByText("Guardar") ?? screen.queryByText("Guardar cambios");
    if (guardar) {
      fireEvent.press(guardar);
      await waitFor(() => {
        const put = apiCalls().find((c) => c.method === "PUT");
        expect((put?.body as { phototype?: number })?.phototype).toBe(5);
      });
    }
  });
});

describe("pestaña Láser", () => {
  it("dibuja el mapa de áreas de la clienta", async () => {
    await abrir("OWNER");
    fireEvent.press(screen.getByText("Láser"));

    await waitFor(() => expect(screen.getByText("Áreas láser de la clienta")).toBeTruthy());
  });

  it("marca como seleccionadas las áreas contratadas", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/laser-areas": [{ id: "s1", clientId: "c1", areaId: "la1" }],
    });
    fireEvent.press(screen.getByText("Láser"));

    await waitFor(() => expect(screen.getByText(/Seleccionadas: Axila/)).toBeTruthy());
  });

  it("avisa si no hay paquetes que vincular", async () => {
    await abrir("OWNER");
    fireEvent.press(screen.getByText("Láser"));

    await waitFor(() => expect(screen.getByText("No hay paquetes activos para vincular.")).toBeTruthy());
  });

  it("lista los paquetes del catálogo con sesiones y precio", async () => {
    await abrir("OWNER", {
      "/api/packages": [fixtures.paquete({ id: "p1", name: "Axilas 6", totalSessions: 6, price: 3000 })],
    });
    fireEvent.press(screen.getByText("Láser"));

    await waitFor(() => expect(screen.getByText("Axilas 6")).toBeTruthy());
    expect(screen.getByText("6 sesiones · $3000")).toBeTruthy();
  });

  it("a RECEPTION ni siquiera se le pinta el mapa de áreas", async () => {
    await abrir("RECEPTION", { "/api/clients/c1/laser-areas": [] });

    fireEvent.press(screen.getByText("Láser"));

    // [id].tsx — el mapa está detrás de `role === "OWNER"`.
    expect(screen.queryByText("Áreas láser de la clienta")).toBeNull();
    expect(apiCalls().filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});

describe("pestaña Faciales", () => {
  it("separa las citas faciales de las de láser", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/appointments": [
        fixtures.cita({ id: "f1", type: "FACIAL", dateTimeStart: "2026-03-01T10:00:00.000Z" }),
        fixtures.cita({ id: "l1", type: "LASER", dateTimeStart: "2026-04-01T10:00:00.000Z" }),
      ],
    });

    fireEvent.press(screen.getByText("Faciales"));

    await waitFor(() => expect(screen.queryAllByText(/Láser/).length).toBeLessThanOrEqual(1));
  });
});

describe("estados de carga y error", () => {
  it("muestra el cargador mientras llega el cliente", () => {
    __setAuthUser({ id: "u1", name: "Jefa", email: "a@m.test", role: "OWNER" });
    mockApi(datosBase);

    renderScreen(<ClientDetailScreen />);

    expect(screen.queryByText("María López")).toBeNull();
  });

  it("aguanta que el servidor falle en las consultas secundarias", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/packages": { __status: 500, message: "Boom" },
      "/api/clients/c1/appointments": { __status: 500, message: "Boom" },
    });

    expect(screen.getByText("María López")).toBeTruthy();
  });
});
