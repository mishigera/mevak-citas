/**
 * El panel de avisos: el cálculo (que es pura lógica), el estado de "leído" y la
 * campana montada de verdad.
 */
import React from "react";
import { Text } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { agruparPorDia, calcularAvisos, claveDia, MINUTOS_PROXIMA } from "@/components/avisos/calcular";
import { __reiniciarLeidos, useAvisosLeidos } from "@/components/avisos/leidos";
import { CampanaAvisos } from "@/components/avisos/CampanaAvisos";

jest.mock("@/contexts/auth", () => require("../setup/auth-mock"));

import {
  renderScreen,
  resetApi,
  mockApi,
  __resetAuth,
  __setAuthUser,
  fixtures,
} from "../setup/screen-harness";

const AHORA = new Date("2026-09-18T12:00:00.000Z");

function cita(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    dateTimeStart: "2026-09-18T12:15:00.000Z",
    dateTimeEnd: "2026-09-18T13:00:00.000Z",
    status: "SCHEDULED",
    client: { fullName: "María López" },
    ...over,
  };
}

beforeEach(() => {
  resetApi();
  __resetAuth();
  act(() => __reiniciarLeidos());
});

describe("calcularAvisos", () => {
  it("avisa de una cita que empieza dentro de la próxima media hora", () => {
    const avisos = calcularAvisos({ citas: [cita()], ahora: AHORA });

    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe("PROXIMA");
    expect(avisos[0].titulo).toBe("Cita en 15 min");
    expect(avisos[0].detalle).toContain("María López");
    expect(avisos[0].ruta).toBe("/appointment/a1");
  });

  it("no avisa de una cita que queda lejos", () => {
    const lejos = cita({
      dateTimeStart: new Date(AHORA.getTime() + (MINUTOS_PROXIMA + 5) * 60_000).toISOString(),
      dateTimeEnd: new Date(AHORA.getTime() + 90 * 60_000).toISOString(),
    });
    expect(calcularAvisos({ citas: [lejos], ahora: AHORA })).toHaveLength(0);
  });

  it("avisa de quien ya llegó y sigue esperando", () => {
    const avisos = calcularAvisos({ citas: [cita({ status: "ARRIVED" })], ahora: AHORA });

    expect(avisos[0].tipo).toBe("ESPERANDO");
    expect(avisos[0].titulo).toContain("María López");
  });

  it("avisa de la cita que terminó y nadie cerró", () => {
    const vieja = cita({
      dateTimeStart: "2026-09-18T09:00:00.000Z",
      dateTimeEnd: "2026-09-18T10:00:00.000Z",
    });
    const avisos = calcularAvisos({ citas: [vieja], ahora: AHORA });

    expect(avisos[0].tipo).toBe("SIN_CERRAR");
  });

  it("una cita terminada o cancelada no genera nada", () => {
    const cerradas = [
      cita({ id: "d", status: "DONE", dateTimeEnd: "2026-09-18T10:00:00.000Z" }),
      cita({ id: "c", status: "CANCELLED", dateTimeEnd: "2026-09-18T10:00:00.000Z" }),
    ];
    expect(calcularAvisos({ citas: cerradas, ahora: AHORA })).toHaveLength(0);
  });

  it("avisa del pago pendiente a la facialista, con su importe", () => {
    const avisos = calcularAvisos({
      pagos: [
        {
          id: "p1",
          facialistNetAmount: 250,
          createdAt: "2026-09-17T18:00:00.000Z",
          staff: { name: "Lucía" },
          client: { fullName: "Ana Gómez" },
        },
      ],
      ahora: AHORA,
    });

    expect(avisos[0].tipo).toBe("PAGO_PENDIENTE");
    expect(avisos[0].titulo).toContain("Lucía");
    expect(avisos[0].detalle).toContain("$250");
    expect(avisos[0].ruta).toBe("/admin/payments");
  });

  it("ignora un pago ya liquidado (sin importe pendiente)", () => {
    expect(calcularAvisos({ pagos: [{ id: "p2", facialistNetAmount: 0 }], ahora: AHORA })).toHaveLength(0);
  });

  it("avisa del bloqueo de hoy, y no del de otro día", () => {
    const avisos = calcularAvisos({
      bloqueos: [
        { id: "b1", startDateTime: "2026-09-18T15:00:00.000Z", endDateTime: "2026-09-18T17:00:00.000Z", reason: "Dentista" },
        { id: "b2", startDateTime: "2026-09-25T15:00:00.000Z", endDateTime: "2026-09-25T17:00:00.000Z" },
      ],
      ahora: AHORA,
    });

    expect(avisos).toHaveLength(1);
    expect(avisos[0].detalle).toContain("Dentista");
  });

  it("ordena en orden cronológico puro, sin subir las no leídas", () => {
    const avisos = calcularAvisos({
      citas: [
        cita({ id: "tarde", dateTimeStart: "2026-09-18T12:25:00.000Z", dateTimeEnd: "2026-09-18T13:00:00.000Z" }),
        cita({ id: "pronto", dateTimeStart: "2026-09-18T12:05:00.000Z", dateTimeEnd: "2026-09-18T12:50:00.000Z" }),
      ],
      ahora: AHORA,
    });

    expect(avisos.map((a) => a.id)).toEqual(["PROXIMA-pronto", "PROXIMA-tarde"]);
  });
});

describe("agruparPorDia", () => {
  it("nombra los días como los nombraría una persona", () => {
    const avisos = calcularAvisos({
      citas: [cita()],
      pagos: [{ id: "p1", facialistNetAmount: 100, createdAt: "2026-09-17T10:00:00.000Z" }],
      ahora: AHORA,
    });

    const grupos = agruparPorDia(avisos, AHORA);

    expect(grupos.map((g) => g.etiqueta)).toEqual(["Ayer", "Hoy"]);
    expect(grupos[1].avisos[0].tipo).toBe("PROXIMA");
  });

  it("claveDia se queda con el día del ISO", () => {
    expect(claveDia("2026-09-18T23:30:00.000Z")).toBe("2026-09-18");
  });
});

describe("avisos leídos", () => {
  function Sonda({ ids }: { ids: string[] }) {
    const { sinLeer, marcarTodos, estaLeido } = useAvisosLeidos(ids);
    return (
      <>
        <Text testID="sin-leer">{sinLeer}</Text>
        <Text testID="primero-leido">{String(estaLeido(ids[0]))}</Text>
        <Text testID="marcar" onPress={marcarTodos}>
          marcar
        </Text>
      </>
    );
  }

  it("empieza contando todos como sin leer y los apaga al marcarlos", async () => {
    renderScreen(<Sonda ids={["a", "b"]} />);
    expect(screen.getByTestId("sin-leer").props.children).toBe(2);

    fireEvent.press(screen.getByTestId("marcar"));

    await waitFor(() => expect(screen.getByTestId("sin-leer").props.children).toBe(0));
    expect(screen.getByTestId("primero-leido").props.children).toBe("true");
  });
});

describe("campana de avisos", () => {
  function montar(datos: Record<string, unknown> = {}) {
    __setAuthUser({ id: "u1", name: "Dueña", email: "d@m.test", role: "OWNER" });
    mockApi({
      "/api/appointments": [],
      "/api/blocks": [],
      "/api/payments/pending-facialist": [],
      ...datos,
    });
    return renderScreen(<CampanaAvisos />);
  }

  it("sin sesión no se monta", () => {
    __setAuthUser(null);
    renderScreen(<CampanaAvisos />);
    expect(screen.queryByTestId("campana-avisos")).toBeNull();
  });

  it("con sesión sale la campana y el panel empieza cerrado", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("campana-avisos")).toBeTruthy());
    expect(screen.queryByTestId("panel-avisos")).toBeNull();
  });

  it("al pulsarla se abre el panel y cuenta lo que hay", async () => {
    const dentroDeUnRato = new Date(Date.now() + 10 * 60_000).toISOString();
    const final = new Date(Date.now() + 60 * 60_000).toISOString();
    montar({
      "/api/appointments": [
        { ...fixtures.cita({ id: "a9" }), dateTimeStart: dentroDeUnRato, dateTimeEnd: final, client: { fullName: "María López" } },
      ],
    });

    await waitFor(() => expect(screen.getByTestId("campana-avisos")).toBeTruthy());
    fireEvent.press(screen.getByTestId("campana-avisos"));

    await waitFor(() => expect(screen.getByTestId("panel-avisos")).toBeTruthy());
    expect(screen.getByText("Hoy")).toBeTruthy();
    expect(screen.getByText(/María López/)).toBeTruthy();
  });

  it("sin nada que avisar, el panel lo dice en vez de quedarse vacío", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("campana-avisos")).toBeTruthy());

    fireEvent.press(screen.getByTestId("campana-avisos"));

    await waitFor(() => expect(screen.getByText("Todo en orden")).toBeTruthy());
  });
});
