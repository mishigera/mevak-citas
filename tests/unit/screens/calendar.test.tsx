jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
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
