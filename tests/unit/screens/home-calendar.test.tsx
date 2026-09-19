jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import HomeScreen from "@/app/(tabs)/index";
import CalendarScreen from "@/app/(tabs)/calendar";
import type { Role } from "../../setup/auth-mock";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

const hoy = new Date();
const claveHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

const citaCon = (over: Record<string, unknown> = {}) => ({
  ...fixtures.cita({ id: "a1", clientId: "c1", staffId: "u1" }),
  dateTimeStart: `${claveHoy}T10:00:00.000Z`,
  dateTimeEnd: `${claveHoy}T11:00:00.000Z`,
  client: fixtures.cliente({ id: "c1", fullName: "María López" }),
  staff: fixtures.staff({ id: "u1", name: "Dueña" }),
  ...over,
});

beforeEach(() => {
  resetApi();
  __resetAuth();
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
});

function entrar(role: Role = "OWNER", id = "u1") {
  __setAuthUser({ id, name: "María Fernanda López", email: "a@m.test", role });
}

// ---------------------------------------------------------------- Home
describe("pantalla de inicio", () => {
  it("saluda usando solo el primer nombre", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("Hola, María")).toBeTruthy());
  });

  it("marca el día de hoy en la etiqueta de fecha", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText(/^Hoy, /)).toBeTruthy());
  });

  it("avisa cuando el día no tiene citas", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("Sin citas")).toBeTruthy());
    expect(screen.getByText("Toca + para agregar")).toBeTruthy();
  });

  it("lista las citas del día con el nombre de la clienta", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon()] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
  });

  it("concuerda el singular y el plural del contador", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon()] });
    renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText("1 cita")).toBeTruthy());
  });

  it("usa el plural con varias citas", async () => {
    entrar();
    mockApi({
      "/api/appointments": [citaCon({ id: "a1" }), citaCon({ id: "a2" }), citaCon({ id: "a3" })],
    });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("3 citas")).toBeTruthy());
  });

  it("dice 0 citas, en plural, cuando no hay ninguna", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("0 citas")).toBeTruthy());
  });

  describe("qué citas ve cada rol", () => {
    const agenda = [
      citaCon({ id: "mia", staffId: "u1", client: fixtures.cliente({ fullName: "Clienta Mía" }) }),
      citaCon({ id: "ajena", staffId: "u9", client: fixtures.cliente({ fullName: "Clienta Ajena" }) }),
    ];

    it("OWNER ve toda la agenda del día", async () => {
      entrar("OWNER", "u1");
      mockApi({ "/api/appointments": agenda });

      renderScreen(<HomeScreen />);

      await waitFor(() => expect(screen.getByText("Clienta Mía")).toBeTruthy());
      expect(screen.getByText("Clienta Ajena")).toBeTruthy();
    });

    /**
     * Deuda §27: era el caso roto. La recepcionista nunca es la profesional de una
     * cita, así que con el filtro viejo su pantalla de inicio salía SIEMPRE vacía.
     */
    it("RECEPTION ve toda la agenda del día, no una lista vacía", async () => {
      entrar("RECEPTION", "u-recepcion");
      mockApi({ "/api/appointments": agenda });

      renderScreen(<HomeScreen />);

      await waitFor(() => expect(screen.getByText("Clienta Mía")).toBeTruthy());
      expect(screen.getByText("Clienta Ajena")).toBeTruthy();
      expect(screen.queryByText("Sin citas")).toBeNull();
    });

    it("FACIALIST solo ve las suyas", async () => {
      entrar("FACIALIST", "u1");
      mockApi({ "/api/appointments": agenda });

      renderScreen(<HomeScreen />);

      await waitFor(() => expect(screen.getByText("Clienta Mía")).toBeTruthy());
      expect(screen.queryByText("Clienta Ajena")).toBeNull();
    });

    it("el contador refleja solo lo que el rol puede ver", async () => {
      entrar("FACIALIST", "u1");
      mockApi({ "/api/appointments": agenda });

      renderScreen(<HomeScreen />);

      await waitFor(() => expect(screen.getByText("1 cita")).toBeTruthy());
    });
  });

  it("abre el detalle al tocar una cita", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon({ id: "cita-x" })] });
    renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.press(screen.getByText("María López"));

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/cita-x");
  });

  it("el + crea una cita nueva", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });
    renderScreen(<HomeScreen />);
    await waitFor(() => expect(screen.getByText("Sin citas")).toBeTruthy());

    pressIcon("add");

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/new");
  });

  it("consulta la agenda del día actual", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(apiCalls().length).toBeGreaterThan(0));
    expect(apiCalls()[0].path).toBe("/api/appointments");
  });

  it("aguanta que el servidor falle", async () => {
    entrar();
    mockApi({ "/api/appointments": { __status: 500, message: "Boom" } });

    renderScreen(<HomeScreen />);

    await waitFor(() => expect(screen.getByText("Hola, María")).toBeTruthy());
  });
});

// ---------------------------------------------------------------- Calendario
describe("agenda", () => {
  it("muestra el título", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(screen.getByText("Agenda")).toBeTruthy());
  });

  it("avisa cuando el día elegido no tiene citas", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(screen.getByText("Sin citas")).toBeTruthy());
    expect(screen.getByText("No hay citas para este día")).toBeTruthy();
  });

  it("lista las citas del día seleccionado", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon()] });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
  });

  it("abre el detalle al tocar una cita", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon({ id: "cita-y" })] });
    renderScreen(<CalendarScreen />);
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.press(screen.getByText("María López"));

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/cita-y");
  });

  it("el + crea una cita nueva", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });
    renderScreen(<CalendarScreen />);
    await waitFor(() => expect(screen.getByText("Agenda")).toBeTruthy());

    pressIcon("add");

    expect(mockRouter.push).toHaveBeenCalledWith("/appointment/new");
  });

  it("pide las citas del mes y las del día por separado", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(apiCalls().length).toBeGreaterThanOrEqual(2));
    // Solo se miran las citas: la campana de avisos del header pide además sus
    // bloqueos y sus pagos pendientes, y eso no es asunto de esta pantalla.
    const citas = apiCalls().filter((c) => c.path === "/api/appointments");
    expect(citas.length).toBeGreaterThanOrEqual(2);
  });

  it("cambiar de mes vuelve a consultar", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });
    renderScreen(<CalendarScreen />);
    await waitFor(() => expect(screen.getByText("Agenda")).toBeTruthy());
    const antes = apiCalls().length;

    pressIcon("chevron-forward");

    await waitFor(() => expect(apiCalls().length).toBeGreaterThan(antes));
  });

  it("se puede volver al mes anterior", async () => {
    entrar();
    mockApi({ "/api/appointments": [] });
    renderScreen(<CalendarScreen />);
    await waitFor(() => expect(screen.getByText("Agenda")).toBeTruthy());
    const antes = apiCalls().length;

    pressIcon("chevron-back");

    await waitFor(() => expect(apiCalls().length).toBeGreaterThan(antes));
  });

  it("aguanta que fallen las citas del mes", async () => {
    entrar();
    mockApi({ "/api/appointments": { __status: 500, message: "Boom" } });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(screen.getByText("Agenda")).toBeTruthy());
  });

  it("una cita cancelada sigue apareciendo en el día", async () => {
    entrar();
    mockApi({ "/api/appointments": [citaCon({ status: "CANCELLED" })] });

    renderScreen(<CalendarScreen />);

    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
  });
});
