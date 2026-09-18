jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import ClientsScreen from "@/app/(tabs)/clients";
import MoreScreen from "@/app/(tabs)/more";
import type { Role } from "../../setup/auth-mock";
import {
  renderScreen, resetApi, mockApi, mockRouter, pressIcon,
  __setAuthUser, __resetAuth, __authSpies, fixtures,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

const entrarComo = (role: Role) =>
  __setAuthUser({ id: "u1", name: "María Fernanda López", email: "a@m.test", role });

beforeEach(() => {
  resetApi();
  __resetAuth();
  Object.values(mockRouter).forEach((m) => typeof m.mockClear === "function" && m.mockClear());
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

// ---------------------------------------------------------------- Clientes
describe("listado de clientes", () => {
  const clientes = [
    fixtures.cliente({ id: "c1", fullName: "María López", phone: "5551112222" }),
    fixtures.cliente({ id: "c2", fullName: "Ana Gómez", phone: "5553334444" }),
    fixtures.cliente({ id: "c3", fullName: "Sofía Ruiz", phone: "5555556666" }),
  ];

  beforeEach(() => entrarComo("RECEPTION"));

  it("lista los clientes", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);

    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());
    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.getByText("Sofía Ruiz")).toBeTruthy();
  });

  it("filtra por nombre sin distinguir mayúsculas", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("Buscar por nombre o teléfono..."), "ANA");

    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.queryByText("María López")).toBeNull();
    expect(screen.queryByText("Sofía Ruiz")).toBeNull();
  });

  it("filtra por teléfono", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("Buscar por nombre o teléfono..."), "5553334444");

    expect(screen.getByText("Ana Gómez")).toBeTruthy();
    expect(screen.queryByText("María López")).toBeNull();
  });

  it("avisa cuando la búsqueda no encuentra nada, citando el término", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);
    await waitFor(() => expect(screen.getByText("María López")).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("Buscar por nombre o teléfono..."), "Zutano");

    expect(screen.getByText("Sin resultados")).toBeTruthy();
    expect(screen.getByText('No se encontró "Zutano"')).toBeTruthy();
  });

  it("distingue lista vacía de búsqueda sin resultados", async () => {
    mockApi({ "/api/clients": [] });
    renderScreen(<ClientsScreen />);

    await waitFor(() => expect(screen.getByText("Sin clientes")).toBeTruthy());
    expect(screen.getByText("Toca + para agregar un cliente")).toBeTruthy();
  });

  it("abre la ficha al tocar un cliente", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);
    await waitFor(() => expect(screen.getByText("Ana Gómez")).toBeTruthy());

    fireEvent.press(screen.getByText("Ana Gómez"));

    expect(mockRouter.push).toHaveBeenCalledWith("/client/c2");
  });

  it("el + lleva a crear cliente", async () => {
    mockApi({ "/api/clients": clientes });
    renderScreen(<ClientsScreen />);
    await waitFor(() => expect(screen.getByText("Clientes")).toBeTruthy());

    pressIcon("add");

    expect(mockRouter.push).toHaveBeenCalledWith("/client/new");
  });

  it("aguanta que el servidor falle", async () => {
    mockApi({ "/api/clients": { __status: 500, message: "Boom" } });
    renderScreen(<ClientsScreen />);

    await waitFor(() => expect(screen.getByText("Clientes")).toBeTruthy());
  });
});

// ---------------------------------------------------------------- Más
describe("pantalla Más", () => {
  const abrir = (role: Role) => {
    entrarComo(role);
    mockApi({});
    return renderScreen(<MoreScreen />);
  };

  it("saluda con el nombre y el rol traducido", () => {
    abrir("OWNER");

    expect(screen.getByText("María Fernanda López")).toBeTruthy();
    expect(screen.getByText("Propietaria / Laserista")).toBeTruthy();
  });

  it.each([
    ["ADMIN", "Administrador"],
    ["OWNER", "Propietaria / Laserista"],
    ["RECEPTION", "Recepcionista"],
    ["FACIALIST", "Facialista"],
  ] as const)("traduce el rol %s", (role, etiqueta) => {
    abrir(role);
    expect(screen.getByText(etiqueta)).toBeTruthy();
  });

  describe("menú según permisos", () => {
    it("ADMIN ve todo", () => {
      abrir("ADMIN");

      expect(screen.getByText("Mis bloqueos")).toBeTruthy();
      expect(screen.getByText("Pagos pendientes facialistas")).toBeTruthy();
      expect(screen.getByText("Reporte de ingresos")).toBeTruthy();
      expect(screen.getByText("Servicios")).toBeTruthy();
      expect(screen.getByText("Paquetes")).toBeTruthy();
      expect(screen.getByText("Usuarios")).toBeTruthy();
    });

    it("OWNER no gestiona catálogos ni usuarios", () => {
      abrir("OWNER");

      expect(screen.getByText("Mis bloqueos")).toBeTruthy();
      expect(screen.getByText("Pagos pendientes facialistas")).toBeTruthy();
      expect(screen.getByText("Reporte de ingresos")).toBeTruthy();
      expect(screen.queryByText("Servicios")).toBeNull();
      expect(screen.queryByText("Usuarios")).toBeNull();
    });

    it("RECEPTION no ve dinero, ni catálogos, ni bloqueos", () => {
      abrir("RECEPTION");

      expect(screen.queryByText("Mis bloqueos")).toBeNull();
      expect(screen.queryByText("Pagos pendientes facialistas")).toBeNull();
      expect(screen.queryByText("Reporte de ingresos")).toBeNull();
      expect(screen.queryByText("Servicios")).toBeNull();
      expect(screen.queryByText("Usuarios")).toBeNull();
    });

    it("FACIALIST solo gestiona sus bloqueos", () => {
      abrir("FACIALIST");

      expect(screen.getByText("Mis bloqueos")).toBeTruthy();
      expect(screen.queryByText("Pagos pendientes facialistas")).toBeNull();
      expect(screen.queryByText("Reporte de ingresos")).toBeNull();
    });
  });

  describe("navegación del menú", () => {
    it.each([
      ["Mis bloqueos", "/blocks"],
      ["Pagos pendientes facialistas", "/admin/payments"],
      ["Reporte de ingresos", "/admin/reports"],
      ["Servicios", "/admin/services"],
      ["Paquetes", "/admin/packages"],
      ["Usuarios", "/admin/users"],
    ])("%s lleva a %s", (etiqueta, ruta) => {
      abrir("ADMIN");

      fireEvent.press(screen.getByText(etiqueta));

      expect(mockRouter.push).toHaveBeenCalledWith(ruta);
    });
  });

  describe("cerrar sesión", () => {
    it("pide confirmación", () => {
      abrir("OWNER");

      fireEvent.press(screen.getByText("Cerrar sesión"));

      expect(alertSpy).toHaveBeenCalledWith(
        "Cerrar sesión", "¿Deseas cerrar tu sesión?", expect.any(Array),
      );
    });

    it("no cierra nada si no se confirma", () => {
      abrir("OWNER");

      fireEvent.press(screen.getByText("Cerrar sesión"));

      expect(__authSpies().logout).not.toHaveBeenCalled();
    });

    it("al confirmar, cierra sesión y vuelve al login", async () => {
      abrir("OWNER");
      fireEvent.press(screen.getByText("Cerrar sesión"));

      const botones = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      const confirmar = botones.find((b) => b.text === "Cerrar sesión");
      await confirmar!.onPress!();

      expect(__authSpies().logout).toHaveBeenCalled();
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    });

    it("ofrece cancelar", () => {
      abrir("OWNER");
      fireEvent.press(screen.getByText("Cerrar sesión"));

      const botones = alertSpy.mock.calls[0][2] as { text: string; style?: string }[];
      expect(botones.find((b) => b.text === "Cancelar")?.style).toBe("cancel");
    });
  });
});
