jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { screen } from "@testing-library/react-native";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import TabLayout from "@/app/(tabs)/_layout";
import RootLayout from "@/app/_layout";
import {
  renderScreen, resetApi, __setAuthUser, __setAuthLoading, __resetAuth,
} from "../../setup/screen-harness";

const glass = isLiquidGlassAvailable as unknown as jest.Mock;

beforeEach(() => {
  resetApi();
  __resetAuth();
  glass.mockReturnValue(false);
});

describe("layout de pestañas", () => {
  it("no pinta nada mientras se comprueba la sesión", () => {
    __setAuthLoading(true);

    renderScreen(<TabLayout />);

    expect(screen.queryByTestId("tabs")).toBeNull();
    expect(screen.queryByTestId("redirect-/login")).toBeNull();
  });

  it("manda al login si no hay sesión", () => {
    renderScreen(<TabLayout />);

    expect(screen.getByTestId("redirect-/login")).toBeTruthy();
  });

  it("con sesión pinta las pestañas", () => {
    __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });

    renderScreen(<TabLayout />);

    expect(screen.getByTestId("tabs")).toBeTruthy();
  });

  it("registra las cuatro pestañas", () => {
    __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });

    renderScreen(<TabLayout />);

    expect(screen.getAllByTestId("tabs-screen")).toHaveLength(4);
  });

  it("usa las pestañas nativas cuando el sistema las soporta", () => {
    glass.mockReturnValue(true);
    __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });

    renderScreen(<TabLayout />);

    expect(screen.getByTestId("native-tabs")).toBeTruthy();
    expect(screen.getByTestId("native-tab-index")).toBeTruthy();
    expect(screen.getByTestId("native-tab-calendar")).toBeTruthy();
    expect(screen.getByTestId("native-tab-clients")).toBeTruthy();
    expect(screen.getByTestId("native-tab-more")).toBeTruthy();
  });

  it("las pestañas nativas llevan sus etiquetas en español", () => {
    glass.mockReturnValue(true);
    __setAuthUser({ id: "u1", name: "Dueña", email: "a@m.test", role: "OWNER" });

    renderScreen(<TabLayout />);

    ["Inicio", "Agenda", "Clientes", "Más"].forEach((etiqueta) =>
      expect(screen.getByText(etiqueta)).toBeTruthy(),
    );
  });

  it.each(["OWNER", "RECEPTION", "FACIALIST"] as const)(
    "%s ve las mismas cuatro pestañas", (role) => {
      __setAuthUser({ id: "u1", name: "X", email: "a@m.test", role });

      renderScreen(<TabLayout />);

      expect(screen.getAllByTestId("tabs-screen")).toHaveLength(4);
    });
});

describe("layout raíz", () => {
  it("monta la app dentro del ErrorBoundary y el Stack", () => {
    renderScreen(<RootLayout />);

    expect(screen.getByTestId("stack")).toBeTruthy();
  });

  it("registra todas las rutas del stack", () => {
    renderScreen(<RootLayout />);

    // login, (tabs) y las 10 pantallas modales.
    expect(screen.getAllByTestId("stack-screen").length).toBeGreaterThanOrEqual(12);
  });

  it("no pinta el stack mientras la sesión está cargando", () => {
    __setAuthLoading(true);

    renderScreen(<RootLayout />);

    expect(screen.queryByTestId("stack")).toBeNull();
  });
});
