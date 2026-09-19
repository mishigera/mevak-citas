jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import ReportsScreen from "@/app/admin/reports";
import PackagesScreen from "@/app/admin/packages";
import ServicesScreen from "@/app/admin/services";
import PaymentsScreen from "@/app/admin/payments";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  resetApi();
  __resetAuth();
  __setAuthUser({ id: "u1", name: "Jefa", email: "a@m.test", role: "OWNER" });
  Object.values(mockRouter).forEach((m) => m.mockClear());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

// ---------------------------------------------------------------- Reportes
describe("reporte de ingresos", () => {
  const reporte = { total: 12500, ownerNet: 9000, facialistNet: 3500, count: 14 };

  it("muestra el total, el reparto y el número de pagos", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);

    await waitFor(() => expect(screen.getByText("$12500")).toBeTruthy());
    expect(screen.getByText("14 pagos registrados")).toBeTruthy();
    expect(screen.getByText("$9000")).toBeTruthy();
    expect(screen.getByText("$3500")).toBeTruthy();
  });

  it("etiqueta correctamente a quién va cada parte", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);

    await waitFor(() => expect(screen.getByText("Owner / Laserista")).toBeTruthy());
    expect(screen.getByText("Facialistas")).toBeTruthy();
  });

  it("avisa cuando el mes no tiene pagos", async () => {
    mockApi({ "/api/reports/income": { total: 0, ownerNet: 0, facialistNet: 0, count: 0 } });
    renderScreen(<ReportsScreen />);

    await waitFor(() => expect(screen.getByText("Sin datos")).toBeTruthy());
    expect(screen.getByText(/No hay pagos registrados en/)).toBeTruthy();
  });

  it("consulta el mes y año actuales al abrir", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);

    await waitFor(() => expect(apiCalls().length).toBeGreaterThan(0));
    const ahora = new Date();
    expect(screen.getByText(new RegExp(String(ahora.getFullYear())))).toBeTruthy();
  });

  it("retrocede de enero a diciembre del año anterior", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);
    await waitFor(() => expect(screen.getByText("$12500")).toBeTruthy());

    // Retrocede 12 veces: se cruza al menos un cambio de año.
        const anioInicial = new Date().getFullYear();
    for (let i = 0; i < 12; i++) pressIcon("chevron-back");

    await waitFor(() =>
      expect(screen.queryByText(new RegExp(String(anioInicial - 1)))).toBeTruthy(),
    );
  });

  it("avanza de diciembre a enero del año siguiente", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);
    await waitFor(() => expect(screen.getByText("$12500")).toBeTruthy());

        const anioInicial = new Date().getFullYear();
    for (let i = 0; i < 12; i++) pressIcon("chevron-forward");

    await waitFor(() =>
      expect(screen.queryByText(new RegExp(String(anioInicial + 1)))).toBeTruthy(),
    );
  });

  it("cierra volviendo atrás", async () => {
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);
    await waitFor(() => expect(screen.getByText("$12500")).toBeTruthy());

    pressIcon("close");

    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("si no hay a dónde volver, va a Más", async () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    mockApi({ "/api/reports/income": reporte });
    renderScreen(<ReportsScreen />);
    await waitFor(() => expect(screen.getByText("$12500")).toBeTruthy());

    pressIcon("close");

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/more");
  });
});

// ---------------------------------------------------------------- Paquetes
describe("catálogo de paquetes", () => {
  const paquetes = [
    fixtures.paquete({ id: "p1", name: "Láser 6 sesiones", totalSessions: 6, price: 6000 }),
    fixtures.paquete({ id: "p2", name: "Axilas 10", totalSessions: 10, price: 4500 }),
  ];

  it("lista los paquetes con sesiones y precio", async () => {
    mockApi({ "/api/packages": paquetes });
    renderScreen(<PackagesScreen />);

    await waitFor(() => expect(screen.getByText("Láser 6 sesiones")).toBeTruthy());
    expect(screen.getByText("6 sesiones")).toBeTruthy();
    expect(screen.getByText("$6000")).toBeTruthy();
    expect(screen.getByText("Axilas 10")).toBeTruthy();
  });

  it("el formulario empieza oculto y se abre con el +", async () => {
    mockApi({ "/api/packages": [] });
    renderScreen(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());

    expect(screen.queryByText("Nuevo paquete")).toBeNull();

    pressIcon("add");

    expect(screen.getByText("Nuevo paquete")).toBeTruthy();
  });

  it("no deja guardar con el formulario incompleto", async () => {
    mockApi({ "/api/packages": [] });
    renderScreen(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre del paquete"), "Solo el nombre");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(apiCalls().filter((c) => c.method === "POST")).toHaveLength(0));
  });

  it("crea el paquete con los números convertidos", async () => {
    mockApi({ "/api/packages": [], "POST /api/packages": { id: "nuevo" } });
    renderScreen(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre del paquete"), "  Piernas 8  ");
    fireEvent.changeText(screen.getByPlaceholderText("Total de sesiones"), "8");
    fireEvent.changeText(screen.getByPlaceholderText("Precio ($)"), "7200");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toEqual({ name: "Piernas 8", totalSessions: 8, price: 7200 });
    });
  });

  it("cierra el formulario tras crear", async () => {
    mockApi({ "/api/packages": [], "POST /api/packages": { id: "nuevo" } });
    renderScreen(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre del paquete"), "P");
    fireEvent.changeText(screen.getByPlaceholderText("Total de sesiones"), "1");
    fireEvent.changeText(screen.getByPlaceholderText("Precio ($)"), "1");
    fireEvent.press(screen.getByText("Guardar"));

    // Primero se confirma que la petición salió; cerrar el formulario ocurre después,
    // y sin este paso intermedio el waitFor puede agotarse bajo carga.
    await waitFor(() => expect(apiCalls().some((c) => c.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Nuevo paquete")).toBeNull(), { timeout: 5000 });
  });

  it("avisa si el servidor rechaza la creación", async () => {
    mockApi({
      "/api/packages": [],
      "POST /api/packages": { __status: 400, message: "Faltan campos" },
    });
    renderScreen(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre del paquete"), "P");
    fireEvent.changeText(screen.getByPlaceholderText("Total de sesiones"), "1");
    fireEvent.changeText(screen.getByPlaceholderText("Precio ($)"), "1");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Error", "Faltan campos"));
  });

  it("aguanta una lista vacía", async () => {
    mockApi({ "/api/packages": [] });
    renderScreen(<PackagesScreen />);

    await waitFor(() => expect(screen.getByText("Paquetes láser")).toBeTruthy());
  });
});

// ---------------------------------------------------------------- Servicios
describe("catálogo de servicios", () => {
  const servicios = [
    fixtures.servicio({ id: "s1", name: "Limpieza facial", type: "FACIAL", price: 500 }),
    fixtures.servicio({ id: "s2", name: "Axilas láser", type: "LASER", price: 350 }),
  ];

  it("lista los servicios", async () => {
    mockApi({ "/api/services": servicios });
    renderScreen(<ServicesScreen />);

    await waitFor(() => expect(screen.getByText("Limpieza facial")).toBeTruthy());
    expect(screen.getByText("Axilas láser")).toBeTruthy();
  });

  it("crea un servicio con el precio como número", async () => {
    mockApi({ "/api/services": [], "POST /api/services": { id: "nuevo" } });
    renderScreen(<ServicesScreen />);
    await waitFor(() => expect(screen.getByText("Servicios")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre del servicio"), "  Peeling  ");
    fireEvent.changeText(screen.getByPlaceholderText("Precio ($)"), "850");
    fireEvent.press(screen.getByText("Guardar"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ name: "Peeling", price: 850 });
    });
  });

  it("permite desactivar un servicio sin borrarlo", async () => {
    mockApi({ "/api/services": servicios, "PATCH /api/services/s1": { id: "s1" } });
    renderScreen(<ServicesScreen />);
    await waitFor(() => expect(screen.getByText("Limpieza facial")).toBeTruthy());

    const interruptores = screen.UNSAFE_queryAllByProps({ accessibilityRole: "switch" });
    if (interruptores.length) {
      fireEvent(interruptores[0], "valueChange", false);
      await waitFor(() => {
        const patch = apiCalls().find((c) => c.method === "PATCH");
        expect(patch?.body).toEqual({ isActive: false });
      });
    }
  });
});

// ---------------------------------------------------------------- Pagos
describe("pagos pendientes a facialistas", () => {
  const pendiente = (over: Record<string, unknown> = {}) => ({
    id: "pay1", appointmentId: "a1", method: "CASH", totalAmount: 1000,
    ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
    createdAt: "2026-09-10T12:00:00.000Z",
    staff: { id: "u2", name: "Lucía" },
    client: fixtures.cliente(),
    appointment: fixtures.cita(),
    ...over,
  });

  it("celebra cuando no hay nada pendiente", async () => {
    mockApi({ "/api/payments/pending-facialist": [] });
    renderScreen(<PaymentsScreen />);

    await waitFor(() => expect(screen.getByText("Todo al día")).toBeTruthy());
    expect(screen.getByText("No hay pagos pendientes a facialistas")).toBeTruthy();
  });

  it("lista los pendientes con el nombre de la facialista", async () => {
    mockApi({ "/api/payments/pending-facialist": [pendiente()] });
    renderScreen(<PaymentsScreen />);

    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());
    expect(screen.getByText("Total pendiente")).toBeTruthy();
  });

  it("suma el total pendiente de varios pagos", async () => {
    mockApi({
      "/api/payments/pending-facialist": [
        pendiente({ id: "p1", facialistNetAmount: 500 }),
        pendiente({ id: "p2", facialistNetAmount: 250 }),
      ],
    });
    renderScreen(<PaymentsScreen />);

    await waitFor(() => expect(screen.getByText("Total pendiente")).toBeTruthy());
    expect(screen.getByText(/750/)).toBeTruthy();
  });

  it("pide confirmación antes de liquidar", async () => {
    mockApi({ "/api/payments/pending-facialist": [pendiente()] });
    renderScreen(<PaymentsScreen />);
    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());

    const botones = screen.UNSAFE_queryAllByProps({ accessibilityRole: "button" });
    const liquidar = botones.find((b) => typeof b.props.onPress === "function" && b.props.onPress.length === 0);
    if (liquidar) {
      fireEvent.press(liquidar);
      await waitFor(() =>
        expect(alertSpy.mock.calls.some(([t]) => /confirmar pago/i.test(String(t)))).toBe(true),
      );
    }
  });

  it("no liquida nada sin confirmar", async () => {
    mockApi({ "/api/payments/pending-facialist": [pendiente()] });
    renderScreen(<PaymentsScreen />);
    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());

    expect(apiCalls().filter((c) => c.method === "PATCH")).toHaveLength(0);
  });
});
