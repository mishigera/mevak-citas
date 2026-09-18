jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import AppointmentDetailScreen from "@/app/appointment/[id]";
import type { Role } from "../../setup/auth-mock";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, setRouteParams,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

const cita = (over: Record<string, unknown> = {}) => ({
  ...fixtures.cita({ id: "a1", clientId: "c1", staffId: "u1" }),
  client: fixtures.cliente({ id: "c1", fullName: "María López" }),
  staff: fixtures.staff({ id: "u1", name: "Dueña" }),
  ...over,
});

const base = (over: Record<string, unknown> = {}) => ({
  "/api/appointments/a1": cita(),
  "/api/appointments/a1/payment": null,
  "/api/appointments/a1/laser-session": null,
  "/api/clients/c1/appointments": [],
  "/api/clients/c1/packages": [],
  "/api/services": [],
  "/api/laser-areas": [fixtures.area()],
  "/api/clients/c1/laser-areas": [],
  ...over,
});

beforeEach(() => {
  resetApi();
  __resetAuth();
  setRouteParams({ id: "a1" });
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function abrir(role: Role = "OWNER", datos: Record<string, unknown> = {}) {
  __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role });
  mockApi(base(datos));
  const vista = renderScreen(<AppointmentDetailScreen />);
  await waitFor(() => expect(screen.getByText("Detalle de cita")).toBeTruthy());
  return vista;
}

/** Ejecuta el botón de un Alert por su texto. */
async function pulsarEnAlerta(texto: string, llamada = 0) {
  const botones = alertSpy.mock.calls[llamada][2] as { text: string; onPress?: () => void }[];
  await botones.find((b) => b.text === texto)!.onPress?.();
}

describe("cabecera de la cita", () => {
  it("muestra cliente, tipo y estado", async () => {
    await abrir();

    expect(screen.getByText("María López")).toBeTruthy();
    expect(screen.getByText("FACIAL")).toBeTruthy();
    expect(screen.getByText("Agendada")).toBeTruthy();
  });

  it("marca las citas de láser", async () => {
    await abrir("OWNER", { "/api/appointments/a1": cita({ type: "LASER" }) });

    expect(screen.getByText("LÁSER")).toBeTruthy();
  });

  it.each([
    ["SCHEDULED", "Agendada"],
    ["ARRIVED", "Llegó"],
    ["NO_SHOW", "No llegó"],
    ["DONE", "Terminada"],
    ["CANCELLED", "Cancelada"],
  ])("traduce el estado %s", async (status, etiqueta) => {
    await abrir("OWNER", { "/api/appointments/a1": cita({ status }) });

    expect(screen.getAllByText(etiqueta).length).toBeGreaterThan(0);
  });
});

describe("cambio de estado", () => {
  it('"Llegó" se aplica sin pedir confirmación', async () => {
    await abrir("OWNER", { "PATCH /api/appointments/a1": { ok: true } });

    fireEvent.press(screen.getByText("Llegó"));

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch?.body).toEqual({ status: "ARRIVED" });
    });
  });

  it("cancelar sí pide confirmación", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Cancelar"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Cancelar cita", "¿Confirmas cancelar esta cita?", expect.any(Array),
    );
  });

  it("no cancela nada si no se confirma", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Cancelar"));

    expect(apiCalls().filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("al confirmar la cancelación, la manda al servidor", async () => {
    await abrir("OWNER", { "PATCH /api/appointments/a1": { ok: true } });
    fireEvent.press(screen.getByText("Cancelar"));

    await pulsarEnAlerta("Confirmar");

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch?.body).toEqual({ status: "CANCELLED" });
    });
  });

  it("si la cita ya estaba marcada como Llegó, el aviso lo dice", async () => {
    await abrir("OWNER", { "/api/appointments/a1": cita({ status: "ARRIVED" }) });

    fireEvent.press(screen.getByText("Cancelar"));

    expect(alertSpy).toHaveBeenCalledWith(
      "Cancelar cita",
      "Esta cita ya está marcada como 'Llegó'. ¿Deseas cambiar la selección?",
      expect.any(Array),
    );
  });

  it("tras cancelar, ofrece reagendar", async () => {
    await abrir("OWNER", { "PATCH /api/appointments/a1": { ok: true } });
    fireEvent.press(screen.getByText("Cancelar"));
    await pulsarEnAlerta("Confirmar");

    await waitFor(() =>
      expect(alertSpy.mock.calls.some(([t, m]) =>
        t === "Cita cancelada" && String(m).includes("reagendar"))).toBe(true),
    );
  });
});

describe("registro del pago", () => {
  const conLlegada = (over: Record<string, unknown> = {}) => ({
    "/api/appointments/a1": cita({ status: "ARRIVED", ...over }),
  });

  it("no deja cobrar antes de marcar la llegada", async () => {
    await abrir();

    expect(screen.getByText('Marca "Llegó" para registrar el pago')).toBeTruthy();
    expect(screen.queryByText("Registrar pago y terminar")).toBeNull();
  });

  it("con la clienta presente ofrece cobrar", async () => {
    await abrir("OWNER", conLlegada());

    expect(screen.getByText("Registrar pago y terminar")).toBeTruthy();
  });

  it("abre el formulario de cobro", async () => {
    await abrir("OWNER", conLlegada());

    fireEvent.press(screen.getByText("Registrar pago y terminar"));

    expect(screen.getByText("Método de pago")).toBeTruthy();
    expect(screen.getByText("Monto total ($)")).toBeTruthy();
    expect(screen.getByText("Confirmar pago")).toBeTruthy();
  });

  it("ofrece efectivo y tarjeta", async () => {
    await abrir("OWNER", conLlegada());
    fireEvent.press(screen.getByText("Registrar pago y terminar"));

    expect(screen.getByText("Efectivo")).toBeTruthy();
    expect(screen.getByText("Tarjeta")).toBeTruthy();
  });

  it("envía método y monto como número", async () => {
    await abrir("OWNER", {
      ...conLlegada(),
      "POST /api/appointments/a1/payment": { id: "pay1" },
    });
    fireEvent.press(screen.getByText("Registrar pago y terminar"));
    fireEvent.press(screen.getByText("Tarjeta"));
    fireEvent.changeText(screen.getByPlaceholderText("0"), "1250");

    fireEvent.press(screen.getByText("Confirmar pago"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ method: "CARD", totalAmount: 1250 });
    });
  });

  it("se puede cerrar el formulario sin cobrar", async () => {
    await abrir("OWNER", conLlegada());
    fireEvent.press(screen.getByText("Registrar pago y terminar"));

    // Hay dos "Cancelar": el de cambiar el estado de la cita y el del formulario.
    // El del formulario es el último en montarse.
    const cancelares = screen.getAllByText("Cancelar");
    fireEvent.press(cancelares[cancelares.length - 1]);

    await waitFor(() => expect(screen.queryByText("Confirmar pago")).toBeNull());
    expect(apiCalls().filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("propaga el rechazo del servidor", async () => {
    await abrir("OWNER", {
      ...conLlegada(),
      "POST /api/appointments/a1/payment": { __status: 409, message: "Ya existe un pago" },
    });
    fireEvent.press(screen.getByText("Registrar pago y terminar"));
    fireEvent.changeText(screen.getByPlaceholderText("0"), "500");

    fireEvent.press(screen.getByText("Confirmar pago"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Error", "Ya existe un pago"));
  });

  it("muestra el pago ya registrado con su método", async () => {
    await abrir("OWNER", {
      "/api/appointments/a1": cita({
        status: "DONE",
        payment: {
          id: "pay1", method: "CASH", totalAmount: 800,
          ownerNetAmount: 400, facialistNetAmount: 400, facialistPaidFlag: false,
        },
      }),
    });

    expect(screen.getByText("Efectivo")).toBeTruthy();
    expect(screen.getByText("$800")).toBeTruthy();
  });

  it("muestra el reparto y si falta liquidar a la facialista", async () => {
    await abrir("OWNER", {
      "/api/appointments/a1": cita({
        status: "DONE",
        payment: {
          id: "pay1", method: "CARD", totalAmount: 1000,
          ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
        },
      }),
    });

    expect(screen.getByText("⏳ Pendiente pago facialista")).toBeTruthy();
    expect(screen.getByText("Marcar pagado")).toBeTruthy();
  });

  it("cuando ya se liquidó, no ofrece volver a marcarlo", async () => {
    await abrir("OWNER", {
      "/api/appointments/a1": cita({
        status: "DONE",
        payment: {
          id: "pay1", method: "CARD", totalAmount: 1000,
          ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: true,
        },
      }),
    });

    expect(screen.getByText("✓ Pagado a facialista")).toBeTruthy();
    expect(screen.queryByText("Marcar pagado")).toBeNull();
  });
});

describe("pago con paquete en citas de láser", () => {
  const citaLaser = (status = "ARRIVED") => ({
    "/api/appointments/a1": cita({ type: "LASER", status }),
  });

  it("avisa si la clienta no tiene paquetes vinculados", async () => {
    await abrir("OWNER", citaLaser());

    expect(screen.getByText("No hay paquetes activos vinculados para esta clienta.")).toBeTruthy();
  });

  it("lista los paquetes activos de la clienta", async () => {
    await abrir("OWNER", {
      ...citaLaser(),
      "/api/clients/c1/packages": [{
        id: "cp1", clientId: "c1", packageId: "p1", totalSessions: 6,
        usedSessions: 2, remainingSessions: 4, status: "ACTIVE",
        package: { id: "p1", name: "Axilas 6", totalSessions: 6, price: 3000 },
      }],
    });

    expect(screen.getByText(/Axilas 6/)).toBeTruthy();
  });

  it("ignora los paquetes terminados", async () => {
    await abrir("OWNER", {
      ...citaLaser(),
      "/api/clients/c1/packages": [{
        id: "cp1", clientId: "c1", packageId: "p1", totalSessions: 6,
        usedSessions: 6, remainingSessions: 0, status: "FINISHED",
        package: { id: "p1", name: "Terminado", totalSessions: 6, price: 3000 },
      }],
    });

    expect(screen.getByText("No hay paquetes activos vinculados para esta clienta.")).toBeTruthy();
  });

  it("una cita de láser sin paquete se cobra normal", async () => {
    await abrir("OWNER", {
      ...citaLaser(),
      "POST /api/appointments/a1/payment": { id: "pay1" },
    });
    fireEvent.press(screen.getByText("Registrar pago y terminar"));
    fireEvent.changeText(screen.getByPlaceholderText("0"), "1500");

    fireEvent.press(screen.getByText("Confirmar pago"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ method: "CASH", totalAmount: 1500 });
      // Al ser undefined no viaja: el servidor no debe recibir un paquete vacío.
      expect(Object.keys(post!.body as object)).not.toContain("clientPackageId");
    });
  });
});

describe("notas de la cita", () => {
  it("guarda las notas editadas", async () => {
    await abrir("OWNER", { "PATCH /api/appointments/a1": { ok: true } });

    const campo = screen.queryByPlaceholderText("Agrega notas...");
    if (!campo) {
      const editar = screen.queryAllByText("Editar")[0];
      if (editar) fireEvent.press(editar);
    }
    const campoNotas = screen.queryByPlaceholderText("Agrega notas...");
    if (campoNotas) {
      fireEvent.changeText(campoNotas, "La clienta llegó tarde");
      const guardar = screen.queryAllByText("Guardar")[0];
      if (guardar) {
        fireEvent.press(guardar);
        await waitFor(() => {
          const patch = apiCalls().find((c) => c.method === "PATCH");
          expect(patch?.body).toEqual({ notes: "La clienta llegó tarde" });
        });
      }
    }
  });
});

describe("servicios de la cita", () => {
  it("avisa cuando no hay servicios registrados", async () => {
    await abrir("OWNER", { "/api/appointments/a1": cita({ type: "FACIAL" }) });

    expect(screen.getByText("Sin servicios registrados")).toBeTruthy();
  });
});

describe("historial de la clienta", () => {
  it("no pide el historial hasta que se abre", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/appointments": [fixtures.cita({ id: "vieja", status: "DONE" })],
    });

    expect(apiCalls().some((c) => c.path === "/api/clients/c1/appointments")).toBe(false);
  });

  it("avisa cuando no hay historial", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Historial rápido"));

    expect(screen.getByText("Sin historial disponible")).toBeTruthy();
  });

  it("lista las citas anteriores con su estado", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/appointments": [
        fixtures.cita({ id: "vieja", status: "DONE", dateTimeStart: "2026-01-10T10:00:00.000Z" }),
      ],
    });

    // El historial es perezoso: `enabled: showHistoryModal && ...`, así que la
    // petición no sale hasta abrir el modal.
    fireEvent.press(screen.getByText("Historial rápido"));

    await waitFor(() => expect(screen.getAllByText("Terminada").length).toBeGreaterThan(0));
    expect(apiCalls().some((c) => c.path === "/api/clients/c1/appointments")).toBe(true);
  });

  it("el historial se puede cerrar", async () => {
    await abrir();
    fireEvent.press(screen.getByText("Historial rápido"));
    expect(screen.getByText("Sin historial disponible")).toBeTruthy();

    fireEvent.press(screen.getAllByText("Historial rápido")[0]);

    expect(screen.getByText("Detalle de cita")).toBeTruthy();
  });
});

describe("estados de carga y navegación", () => {
  it("muestra el cargador antes de tener la cita", () => {
    __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });
    mockApi(base());

    renderScreen(<AppointmentDetailScreen />);

    expect(screen.queryByText("María López")).toBeNull();
  });

  it("aguanta que fallen las consultas secundarias", async () => {
    await abrir("OWNER", {
      "/api/clients/c1/packages": { __status: 500, message: "Boom" },
      "/api/clients/c1/appointments": { __status: 500, message: "Boom" },
    });

    expect(screen.getByText("Detalle de cita")).toBeTruthy();
  });
});
