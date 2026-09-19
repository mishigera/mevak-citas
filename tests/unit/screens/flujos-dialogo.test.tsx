jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

/**
 * Los flujos que dependen de una confirmación, recorridos con el diálogo de vidrio
 * montado, como en la app (deuda §36, plan p007).
 *
 * Los tests de cada pantalla espían `Alert.alert` y llaman a mano al `onPress` del
 * botón: prueban que se pide la confirmación, no que alguien pueda contestarla. Así
 * pasaron meses en verde mientras en web ninguno de estos flujos hacía nada. Aquí se
 * pulsa el botón del diálogo de verdad y se espera a la petición.
 */
import React from "react";
import { screen, fireEvent, waitFor, within } from "@testing-library/react-native";
import { DialogoAlerta } from "@/components/DialogoAlerta";
import AppointmentDetailScreen from "@/app/appointment/[id]";
import BlocksScreen from "@/app/blocks";
import PaymentsScreen from "@/app/admin/payments";
import NewClientScreen from "@/app/client/new";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon, setRouteParams,
  __setAuthUser, __resetAuth, fixtures,
} from "../../setup/screen-harness";

function conDialogo(pantalla: React.ReactElement) {
  return renderScreen(<>{pantalla}<DialogoAlerta /></>);
}

/** Espera al diálogo con ese texto y pulsa uno de sus botones. */
async function contestar(texto: string | RegExp, boton: string) {
  await waitFor(() => expect(within(screen.getByTestId("dialogo-alerta")).getByText(texto)).toBeTruthy());
  fireEvent.press(within(screen.getByTestId("dialogo-alerta")).getByLabelText(boton));
}

beforeEach(() => {
  resetApi();
  __resetAuth();
  __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
});

describe("detalle de cita", () => {
  const cita = (over: Record<string, unknown> = {}) => ({
    ...fixtures.cita({ id: "a1", clientId: "c1", staffId: "u1" }),
    client: fixtures.cliente({ id: "c1", fullName: "María López" }),
    staff: fixtures.staff({ id: "u1", name: "Dueña" }),
    ...over,
  });

  async function abrir(datos: Record<string, unknown> = {}) {
    setRouteParams({ id: "a1" });
    mockApi({
      "/api/appointments/a1": cita(),
      "/api/clients/c1/appointments": [],
      "/api/clients/c1/packages": [],
      "/api/services": [],
      "/api/laser-areas": [],
      "/api/clients/c1/laser-areas": [],
      ...datos,
    });
    conDialogo(<AppointmentDetailScreen />);
    await waitFor(() => expect(screen.queryByTestId("cargando-cita")).toBeNull());
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
  }

  it("cancelar una cita la cancela y después ofrece reagendarla", async () => {
    await abrir({ "PATCH /api/appointments/a1": { ok: true } });

    fireEvent.press(screen.getByText("Cancelar"));
    await contestar("¿Confirmas cancelar esta cita?", "Confirmar");

    await waitFor(() => {
      const patch = apiCalls().find((c) => c.method === "PATCH");
      expect(patch?.body).toEqual({ status: "CANCELLED" });
    });

    await contestar("¿Deseas reagendar esta cita?", "Sí, reagendar");

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining("/appointment/new?clientId=c1")),
    );
  });

  it("anular un pago llama al servidor", async () => {
    await abrir({
      "/api/appointments/a1": cita({
        status: "DONE",
        payment: { id: "p1", method: "CASH", totalAmount: 800, ownerNetAmount: 400, facialistNetAmount: 400, facialistPaidFlag: false },
      }),
      "DELETE /api/payments/p1": { ok: true },
    });

    fireEvent.press(screen.getByLabelText("Anular pago"));
    await contestar(/El cobro se borra/, "Anular");

    await waitFor(() =>
      expect(apiCalls().some((c) => c.method === "DELETE" && c.path === "/api/payments/p1")).toBe(true),
    );
  });

  it("decir que no al diálogo no toca nada", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Cancelar"));
    await contestar("¿Confirmas cancelar esta cita?", "Cancelar");

    expect(apiCalls().filter((c) => c.method === "PATCH")).toHaveLength(0);
  });
});

it("eliminar un bloqueo lo elimina", async () => {
  mockApi({
    "/api/blocks": [{
      id: "b1", userId: "u1", reason: "Vacaciones",
      startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T13:00:00",
    }],
    "DELETE /api/blocks/b1": { ok: true },
  });
  conDialogo(<BlocksScreen />);
  await waitFor(() => expect(screen.getByText("Vacaciones")).toBeTruthy());

  pressIcon("trash-outline");
  await contestar("¿Confirmas eliminar este bloqueo?", "Eliminar");

  await waitFor(() =>
    expect(apiCalls().some((c) => c.method === "DELETE" && c.path === "/api/blocks/b1")).toBe(true),
  );
});

it("marcar como pagado a la facialista lo marca", async () => {
  mockApi({
    "/api/payments/pending-facialist": [{
      id: "pay1", appointmentId: "a1", method: "CASH", totalAmount: 1000,
      ownerNetAmount: 500, facialistNetAmount: 500, facialistPaidFlag: false,
      createdAt: "2026-09-10T12:00:00.000Z", staff: { id: "u2", name: "Lucía" },
      client: fixtures.cliente(), appointment: fixtures.cita(),
    }],
    "PATCH /api/payments/pay1/facialist-paid": { ok: true },
  });
  conDialogo(<PaymentsScreen />);
  await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());

  fireEvent.press(screen.getByText("Pagar"));
  await contestar("¿Marcar como pagado a Lucía?", "Confirmar");

  await waitFor(() =>
    expect(apiCalls().some((c) => c.method === "PATCH" && c.path === "/api/payments/pay1/facialist-paid")).toBe(true),
  );
});

it("crear una clienta vuelve a la lista al aceptar el aviso", async () => {
  mockApi({ "POST /api/clients": fixtures.cliente({ fullName: "Ana Gómez" }) });
  conDialogo(<NewClientScreen />);

  fireEvent.changeText(screen.getByPlaceholderText("Nombre y apellidos"), "Ana Gómez");
  fireEvent.changeText(screen.getByPlaceholderText("555-1234"), "5551112222");
  fireEvent.press(screen.getByText("Guardar cliente"));
  await contestar("Ana Gómez se creó correctamente.", "Aceptar");

  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/clients"));
});
