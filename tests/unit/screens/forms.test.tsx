jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import NewClientScreen from "@/app/client/new";
import BlocksScreen from "@/app/blocks";
import UsersScreen from "@/app/admin/users";
import {
  renderScreen, resetApi, mockApi, apiCalls, mockRouter, pressIcon,
  __setAuthUser, __resetAuth, fixtures, elegirFecha, elegirHora,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  resetApi();
  __resetAuth();
  __setAuthUser({ id: "u1", name: "Jefa", email: "a@m.test", role: "OWNER" });
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  mockRouter.canGoBack.mockReturnValue(true);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** Ejecuta el botón de un Alert por su texto. */
async function pulsarEnAlerta(texto: string, llamada = 0) {
  const botones = alertSpy.mock.calls[llamada][2] as { text: string; onPress?: () => void }[];
  const boton = botones.find((b) => b.text === texto);
  expect(boton).toBeDefined();
  await boton!.onPress?.();
}

// ---------------------------------------------------------------- Nuevo cliente
describe("alta de cliente", () => {
  const rellenarMinimo = () => {
    fireEvent.changeText(screen.getByPlaceholderText("Nombre y apellidos"), "  Ana Gómez  ");
    fireEvent.changeText(screen.getByPlaceholderText("555-1234"), "  5551112222  ");
  };

  it("muestra el formulario", () => {
    mockApi({});
    renderScreen(<NewClientScreen />);

    expect(screen.getByText("Nuevo cliente")).toBeTruthy();
    expect(screen.getByPlaceholderText("Nombre y apellidos")).toBeTruthy();
    expect(screen.getByPlaceholderText("555-1234")).toBeTruthy();
    expect(screen.getByText("Guardar cliente")).toBeTruthy();
  });

  it("recorta espacios de nombre y teléfono", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente({ fullName: "Ana Gómez" }) });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ fullName: "Ana Gómez", phone: "5551112222" });
    });
  });

  it("omite los campos opcionales vacíos en vez de mandarlos en blanco", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente() });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() => expect(apiCalls().some((c) => c.method === "POST")).toBe(true));
    const post = apiCalls().find((c) => c.method === "POST")!;
    // Al ser undefined, JSON.stringify los elimina: no viajan como cadenas vacías.
    expect(Object.keys(post.body as object).sort()).toEqual(["fullName", "phone"]);
  });

  it("envía los campos opcionales cuando se rellenan", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente() });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();
    fireEvent.changeText(screen.getByPlaceholderText("correo@ejemplo.com"), "ana@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("1990-05-15"), "1992-03-04");
    fireEvent.changeText(screen.getByPlaceholderText("Profesión u ocupación"), "Diseñadora");

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({
        email: "ana@test.com", birthDate: "1992-03-04", occupation: "Diseñadora",
      });
    });
  });

  it("confirma con el nombre del cliente creado", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente({ fullName: "Ana Gómez" }) });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Cliente generado", "Ana Gómez se creó correctamente.", expect.any(Array),
      ),
    );
  });

  it("al aceptar vuelve al listado de clientes", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente({ fullName: "Ana Gómez" }) });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();
    fireEvent.press(screen.getByText("Guardar cliente"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    await pulsarEnAlerta("Aceptar");

    expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/clients");
  });

  it("limpia el formulario tras crear", async () => {
    mockApi({ "POST /api/clients": fixtures.cliente() });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Nombre y apellidos").props.value).toBe(""),
    );
  });

  it("explica el fallo si el servidor rechaza", async () => {
    mockApi({ "POST /api/clients": { __status: 400, message: "fullName y phone son requeridos" } });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Error", "No se pudo generar el cliente. fullName y phone son requeridos",
      ),
    );
  });

  it("no navega si falla", async () => {
    mockApi({ "POST /api/clients": { __status: 500, message: "Boom" } });
    renderScreen(<NewClientScreen />);
    rellenarMinimo();

    fireEvent.press(screen.getByText("Guardar cliente"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("se puede cerrar sin guardar", () => {
    mockApi({});
    renderScreen(<NewClientScreen />);

    pressIcon("close");

    expect(mockRouter.back).toHaveBeenCalled();
    expect(apiCalls().filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- Bloqueos
describe("bloqueos de disponibilidad", () => {
  const bloqueo = (over: Record<string, unknown> = {}) => ({
    id: "b1", userId: "u1",
    startDateTime: "2026-10-01T09:00:00", endDateTime: "2026-10-01T13:00:00",
    reason: "Vacaciones", ...over,
  });

  const abrirFormulario = () => pressIcon("add");

  const rellenarBloqueo = async () => {
    await elegirFecha("Fecha inicio", "2026-11-01");
    await elegirHora("Hora inicio", "09:00");
    await elegirFecha("Fecha fin", "2026-11-01");
    await elegirHora("Hora fin", "13:00");
  };

  it("avisa cuando no hay bloqueos", async () => {
    mockApi({ "/api/blocks": [] });
    renderScreen(<BlocksScreen />);

    await waitFor(() => expect(screen.getByText("Sin bloqueos")).toBeTruthy());
    expect(screen.getByText("Toca + para agregar un bloqueo de disponibilidad")).toBeTruthy();
  });

  it("lista los bloqueos con su motivo", async () => {
    mockApi({ "/api/blocks": [bloqueo()] });
    renderScreen(<BlocksScreen />);

    await waitFor(() => expect(screen.getByText("Vacaciones")).toBeTruthy());
  });

  it("un bloqueo sin motivo no rompe la lista", async () => {
    mockApi({ "/api/blocks": [bloqueo({ reason: undefined })] });
    renderScreen(<BlocksScreen />);

    await waitFor(() => expect(screen.getByText("Mi agenda")).toBeTruthy());
    expect(screen.queryByText("Vacaciones")).toBeNull();
  });

  it("compone fecha y hora en un ISO al guardar", async () => {
    mockApi({ "/api/blocks": [], "POST /api/blocks": { id: "nuevo" } });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Sin bloqueos")).toBeTruthy());
    abrirFormulario();
    await rellenarBloqueo();

    fireEvent.press(screen.getByText("Guardar bloqueo"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({
        startDateTime: "2026-11-01T09:00:00",
        endDateTime: "2026-11-01T13:00:00",
      });
    });
  });

  it("manda el motivo cuando se escribe", async () => {
    mockApi({ "/api/blocks": [], "POST /api/blocks": { id: "nuevo" } });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Sin bloqueos")).toBeTruthy());
    abrirFormulario();
    await rellenarBloqueo();
    fireEvent.changeText(screen.getByPlaceholderText("Ej: Vacaciones, no trabajo"), "  Congreso  ");

    fireEvent.press(screen.getByText("Guardar bloqueo"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({ reason: "Congreso" });
    });
  });

  it("propaga el error del servidor tal cual", async () => {
    mockApi({
      "/api/blocks": [],
      "POST /api/blocks": { __status: 400, message: "La fecha/hora de fin debe ser mayor a inicio" },
    });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Sin bloqueos")).toBeTruthy());
    abrirFormulario();
    await rellenarBloqueo();

    fireEvent.press(screen.getByText("Guardar bloqueo"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Error", "La fecha/hora de fin debe ser mayor a inicio"),
    );
  });

  it("pide confirmación antes de borrar", async () => {
    mockApi({ "/api/blocks": [bloqueo()] });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Vacaciones")).toBeTruthy());

    pressIcon("trash-outline");

    expect(alertSpy).toHaveBeenCalledWith(
      "Eliminar bloqueo", "¿Confirmas eliminar este bloqueo?", expect.any(Array),
    );
  });

  it("no borra nada si no se confirma", async () => {
    mockApi({ "/api/blocks": [bloqueo()] });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Vacaciones")).toBeTruthy());

    pressIcon("trash-outline");

    expect(apiCalls().filter((c) => c.method === "DELETE")).toHaveLength(0);
  });

  it("borra al confirmar", async () => {
    mockApi({ "/api/blocks": [bloqueo()], "DELETE /api/blocks/b1": { ok: true } });
    renderScreen(<BlocksScreen />);
    await waitFor(() => expect(screen.getByText("Vacaciones")).toBeTruthy());
    pressIcon("trash-outline");

    await pulsarEnAlerta("Eliminar");

    await waitFor(() =>
      expect(apiCalls().some((c) => c.method === "DELETE" && c.path === "/api/blocks/b1")).toBe(true),
    );
  });
});

// ---------------------------------------------------------------- Usuarios
describe("gestión de usuarios", () => {
  const usuarios = [
    fixtures.staff({ id: "u1", name: "Jefa", role: "OWNER" }),
    fixtures.staff({ id: "u2", name: "Lucía", role: "FACIALIST", email: "lucia@m.test" }),
    fixtures.staff({ id: "u3", name: "Bea", role: "RECEPTION", isActive: false }),
  ];

  it("lista al personal", async () => {
    mockApi({ "/api/users": usuarios });
    renderScreen(<UsersScreen />);

    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());
    expect(screen.getByText("Jefa")).toBeTruthy();
    expect(screen.getByText("Bea")).toBeTruthy();
  });

  it("crea un usuario normalizando nombre y correo", async () => {
    mockApi({ "/api/users": usuarios, "POST /api/users": { id: "nuevo" } });
    renderScreen(<UsersScreen />);
    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre completo"), "  Nueva Persona  ");
    fireEvent.changeText(screen.getByPlaceholderText("Correo electrónico"), "  NUEVA@Mevak.Test ");
    fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), "secreta123");
    fireEvent.press(screen.getByText("Crear usuario"));

    await waitFor(() => {
      const post = apiCalls().find((c) => c.method === "POST");
      expect(post?.body).toMatchObject({
        name: "Nueva Persona", email: "nueva@mevak.test", password: "secreta123",
      });
    });
  });

  it("avisa si el correo ya existe", async () => {
    mockApi({
      "/api/users": usuarios,
      "POST /api/users": { __status: 400, message: "Email ya registrado" },
    });
    renderScreen(<UsersScreen />);
    await waitFor(() => expect(screen.getByText("Lucía")).toBeTruthy());
    pressIcon("add");

    fireEvent.changeText(screen.getByPlaceholderText("Nombre completo"), "X");
    fireEvent.changeText(screen.getByPlaceholderText("Correo electrónico"), "lucia@m.test");
    fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), "p");
    fireEvent.press(screen.getByText("Crear usuario"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Error", "Email ya registrado"));
  });

  it("aguanta una lista vacía", async () => {
    mockApi({ "/api/users": [] });
    renderScreen(<UsersScreen />);

    await waitFor(() => expect(screen.getByText("Usuarios")).toBeTruthy());
  });
});
