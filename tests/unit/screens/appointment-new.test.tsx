jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import NewAppointmentScreen from "@/app/appointment/new";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon,
  __setAuthUser, __resetAuth, fixtures, elegirFecha, elegirHora, setRouteParams,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

const clientes = [
  fixtures.cliente({ id: "c1", fullName: "María López", phone: "5551112222" }),
  fixtures.cliente({ id: "c2", fullName: "Ana Gómez", phone: "5553334444" }),
];
const staff = [
  fixtures.staff({ id: "u1", name: "Dueña", role: "OWNER" }),
  fixtures.staff({ id: "u2", name: "Lucía", role: "FACIALIST" }),
];
const servicios = [
  fixtures.servicio({ id: "s1", name: "Limpieza profunda", type: "FACIAL", price: 800, durationMinutes: 90 }),
  fixtures.servicio({ id: "s2", name: "Dermapen", type: "FACIAL", price: 1500, durationMinutes: 45 }),
];

beforeEach(() => {
  resetApi();
  __resetAuth();
  __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  mockRouter.canGoBack.mockReturnValue(true);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockApi({ "/api/clients": clientes, "/api/users/staff": staff, "/api/services": servicios });
});
afterEach(() => alertSpy.mockRestore());

async function abrir() {
  const vista = renderScreen(<NewAppointmentScreen />);
  await waitFor(() => expect(screen.getByText("Nueva cita")).toBeTruthy());
  return vista;
}

async function elegirCliente(nombre: string) {
  fireEvent.press(screen.getByText("Seleccionar cliente"));
  await waitFor(() => expect(screen.getByPlaceholderText("Buscar...")).toBeTruthy());
  fireEvent.press(screen.getByText(nombre));
}

async function elegirStaff(nombre: string) {
  fireEvent.press(screen.getByText("Seleccionar staff"));
  await waitFor(() => expect(screen.getByText("Seleccionar staff")).toBeTruthy());
  fireEvent.press(screen.getByText(nombre));
}

async function rellenarHorario(fecha = "2026-11-05", inicio = "10:00", fin = "11:00") {
  await elegirFecha("Fecha", fecha);
  await elegirHora("Hora inicio", inicio);
  await elegirHora("Hora fin", fin);
}

describe("formulario de nueva cita", () => {
  it("muestra las secciones del formulario", async () => {
    await abrir();

    expect(screen.getByText("Tipo de cita")).toBeTruthy();
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.getByText("Staff asignado")).toBeTruthy();
    expect(screen.getByText("Fecha")).toBeTruthy();
    expect(screen.getByText("Crear cita")).toBeTruthy();
  });

  it("ofrece los dos tipos de cita", async () => {
    await abrir();

    expect(screen.getByText("FACIAL")).toBeTruthy();
    expect(screen.getByText("LASER")).toBeTruthy();
  });

  it("empieza sin cliente ni staff elegidos", async () => {
    await abrir();

    expect(screen.getByText("Seleccionar cliente")).toBeTruthy();
    expect(screen.getByText("Seleccionar staff")).toBeTruthy();
  });
});

describe("selector de cliente", () => {
  it("lista los clientes con su teléfono", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Seleccionar cliente"));

    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
    expect(screen.getByText("5551112222")).toBeTruthy();
    expect(screen.getByText("Ana Gómez")).toBeTruthy();
  });

  it("filtra por nombre sin distinguir mayúsculas", async () => {
    await abrir();
    fireEvent.press(screen.getByText("Seleccionar cliente"));
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("Buscar..."), "ANA");

    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.queryByText("María López")).toBeNull();
  });

  it("al elegir, vuelve al formulario con el nombre puesto", async () => {
    await abrir();

    await elegirCliente("Ana Gómez");

    // El panel no desaparece de golpe: colapsa hacia el botón que lo abrió, así que
    // durante unas décimas el nombre está dos veces (en la lista que se cierra y en
    // la fila) y el buscador sigue montado.
    await waitFor(() => expect(screen.getAllByText("Ana Gómez")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByPlaceholderText("Buscar...")).toBeNull());
    expect(screen.getByText("Crear cita")).toBeTruthy();
  });

  it("se puede cerrar sin elegir", async () => {
    await abrir();
    fireEvent.press(screen.getByText("Seleccionar cliente"));
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    // El panel se cierra por su propio botón, no por una flecha de cabecera.
    fireEvent.press(screen.getByLabelText("Cerrar"));

    expect(screen.getByText("Seleccionar cliente")).toBeTruthy();
  });
});

describe("selector de staff", () => {
  it("distingue laserista de facialista", async () => {
    await abrir();

    fireEvent.press(screen.getByText("Seleccionar staff"));

    await waitFor(() => expect(screen.getByText("Dueña")).toBeTruthy());
    expect(screen.getByText("Laserista/Owner")).toBeTruthy();
    expect(screen.getByText("Facialista")).toBeTruthy();
  });

  it("al elegir queda reflejado en el formulario", async () => {
    await abrir();

    await elegirStaff("Lucía");

    // Ver el comentario del selector de cliente: el panel tarda en colapsar.
    await waitFor(() => expect(screen.getAllByText("Lucía")).toHaveLength(1));
    expect(screen.getByText("Crear cita")).toBeTruthy();
  });
});

describe("crear la cita", () => {
  it("compone las fechas ISO a partir de fecha y horas", async () => {
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "nueva" }) });
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario("2026-11-05", "10:00", "11:30");

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({
        dateTimeStart: "2026-11-05T10:00:00",
        dateTimeEnd: "2026-11-05T11:30:00",
        clientId: "c2",
        staffId: "u2",
        type: "FACIAL",
      });
    });
  });

  it("manda LASER si se cambia el tipo", async () => {
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "nueva" }) });
    await abrir();
    fireEvent.press(screen.getByText("LASER"));
    await elegirCliente("Ana Gómez");
    await elegirStaff("Dueña");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ type: "LASER" });
    });
  });

  it("incluye las notas", async () => {
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "nueva" }) });
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();
    fireEvent.changeText(screen.getByPlaceholderText("Notas sobre la cita..."), "Primera visita");

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ notes: "Primera visita" });
    });
  });

  it("al crearse abre la cita nueva y limpia la pila de modales", async () => {
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "cita-nueva" }) });
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/appointment/cita-nueva"));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });
});

describe("conflictos de horario", () => {
  const prepararConflicto = (message: string) =>
    mockApi({ "POST /api/appointments": { __status: 409, message } });

  it("trata el choque con otra cita como aviso de horario, no como error genérico", async () => {
    prepararConflicto("Conflicto de horario con otra cita");
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Horario no disponible", "Conflicto de horario con otra cita"),
    );
  });

  it("hace lo mismo con un bloqueo de disponibilidad", async () => {
    prepararConflicto("El staff tiene un bloqueo en ese horario");
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Horario no disponible", "El staff tiene un bloqueo en ese horario"),
    );
  });

  it("un 409 que no habla de horario cae en el error genérico", async () => {
    prepararConflicto("Otra cosa distinta");
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Error", "Otra cosa distinta"));
  });

  it("un 400 es error genérico aunque mencione horario", async () => {
    mockApi({ "POST /api/appointments": { __status: 400, message: "Conflicto de horario" } });
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Error", "Conflicto de horario"));
  });

  it("no navega si hubo conflicto", async () => {
    prepararConflicto("Conflicto de horario con otra cita");
    await abrir();
    await elegirCliente("Ana Gómez");
    await elegirStaff("Lucía");
    await rellenarHorario();

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe("salir sin crear", () => {
  it("vuelve atrás", async () => {
    await abrir();

    pressIcon("close");

    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("si no hay a dónde volver, va al calendario", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await abrir();

    pressIcon("close");

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/calendar");
  });
});

/**
 * La hora de fin sale de lo que duran los servicios. Antes se tecleaba a mano y el
 * formulario siempre arrancaba en 10:00–11:00, durase lo que durase la cita.
 */
describe("servicios y duración", () => {
  it("lista los servicios del tipo elegido con su duración y precio", async () => {
    await abrir();

    expect(screen.getByText("Limpieza profunda")).toBeTruthy();
    expect(screen.getByText("90 min · $800")).toBeTruthy();
  });

  it("elegir un servicio mueve la hora de fin", async () => {
    await abrir();
    await elegirHora("Hora inicio", "10:00");

    fireEvent.press(screen.getByLabelText("Limpieza profunda"));

    // 10:00 + 90 min
    await waitFor(() => expect(screen.getByLabelText("Hora fin").props.accessibilityValue.text).toBe("11:30"));
  });

  it("dos servicios suman sus duraciones", async () => {
    await abrir();
    await elegirHora("Hora inicio", "10:00");

    fireEvent.press(screen.getByLabelText("Limpieza profunda"));
    fireEvent.press(screen.getByLabelText("Dermapen"));

    // 90 + 45
    await waitFor(() => expect(screen.getByLabelText("Hora fin").props.accessibilityValue.text).toBe("12:15"));
  });

  it("quitar un servicio recalcula", async () => {
    await abrir();
    await elegirHora("Hora inicio", "10:00");
    fireEvent.press(screen.getByLabelText("Limpieza profunda"));
    fireEvent.press(screen.getByLabelText("Dermapen"));

    fireEvent.press(screen.getByLabelText("Dermapen"));

    await waitFor(() => expect(screen.getByLabelText("Hora fin").props.accessibilityValue.text).toBe("11:30"));
  });

  it("mover el inicio arrastra el fin conservando la duración", async () => {
    await abrir();
    fireEvent.press(screen.getByLabelText("Limpieza profunda"));
    await elegirHora("Hora inicio", "16:00");

    await waitFor(() => expect(screen.getByLabelText("Hora fin").props.accessibilityValue.text).toBe("17:30"));
  });

  it("guarda los servicios elegidos junto con la cita", async () => {
    mockApi({
      "/api/clients": clientes,
      "/api/users/staff": staff,
      "/api/services": servicios,
      "POST /api/appointments": { id: "nueva" },
      "PUT /api/appointments/nueva/services": [],
    });
    await abrir();
    await elegirCliente("María López");
    await elegirStaff("Dueña");
    fireEvent.press(screen.getByLabelText("Limpieza profunda"));

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() =>
      expect(apiCalls().some((c) => c.method === "PUT" && c.path === "/api/appointments/nueva/services")).toBe(true),
    );
    const put = apiCalls().find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ serviceIds: ["s1"] });
  });

  it("sin servicios elegidos no llama al endpoint de servicios", async () => {
    mockApi({
      "/api/clients": clientes,
      "/api/users/staff": staff,
      "/api/services": servicios,
      "POST /api/appointments": { id: "nueva" },
    });
    await abrir();
    await elegirCliente("María López");
    await elegirStaff("Dueña");

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => expect(apiCalls().some((c) => c.method === "POST")).toBe(true));
    expect(apiCalls().some((c) => c.method === "PUT")).toBe(false);
  });

  it("avisa si el catálogo no tiene servicios de ese tipo", async () => {
    mockApi({ "/api/clients": clientes, "/api/users/staff": staff, "/api/services": [] });
    await abrir();

    expect(screen.getByText(/No hay servicios de facial en el catálogo/)).toBeTruthy();
  });
});

// Plan p008: tocar un hueco del inicio abre Nueva cita con todo lo que ya se sabe.
describe("desde un hueco del inicio", () => {
  afterEach(() => setRouteParams({}));

  it("llega con profesional, día y hora, y dura una hora de entrada", async () => {
    setRouteParams({ staffId: "u2", staffName: "Lucía", date: "2026-11-05", hora: "12:30", type: "FACIAL" });
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "nueva" }) });
    await abrir();
    await elegirCliente("Ana Gómez");

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({
        dateTimeStart: "2026-11-05T12:30:00",
        dateTimeEnd: "2026-11-05T13:30:00",
        staffId: "u2",
        type: "FACIAL",
      });
    });
  });

  it("una hora mal escrita no se usa: se queda en las 10:00", async () => {
    setRouteParams({ staffId: "u2", staffName: "Lucía", date: "2026-11-05", hora: "mediodía" });
    mockApi({ "POST /api/appointments": fixtures.cita({ id: "nueva" }) });
    await abrir();
    await elegirCliente("Ana Gómez");

    fireEvent.press(screen.getByText("Crear cita"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ dateTimeStart: "2026-11-05T10:00:00", dateTimeEnd: "2026-11-05T11:00:00" });
    });
  });
});
