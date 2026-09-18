jest.mock("@/contexts/auth", () => require("../setup/auth-mock"));

import React from "react";
import { screen } from "@testing-library/react-native";
import NotFoundScreen from "@/app/+not-found";
import { redirectSystemPath } from "@/app/+native-intent";
import { Colors } from "@/constants/colors";
import { renderScreen, resetApi, __resetAuth } from "../setup/screen-harness";

beforeEach(() => {
  resetApi();
  __resetAuth();
});

describe("pantalla 404", () => {
  it("explica que la ruta no existe", () => {
    renderScreen(<NotFoundScreen />);

    expect(screen.getByText("This screen doesn't exist.")).toBeTruthy();
  });

  it("ofrece volver al inicio", () => {
    renderScreen(<NotFoundScreen />);

    expect(screen.getByText("Go to home screen!")).toBeTruthy();
    expect(screen.getByTestId("link-/")).toBeTruthy();
  });
});

describe("redirección de enlaces del sistema", () => {
  it("manda cualquier ruta externa al inicio", () => {
    expect(redirectSystemPath({ path: "mevakbeautycenter://cliente/123", initial: true })).toBe("/");
  });

  it("hace lo mismo en arranques no iniciales", () => {
    expect(redirectSystemPath({ path: "/lo/que/sea", initial: false })).toBe("/");
  });
});

describe("paleta de colores", () => {
  it("define los colores de marca", () => {
    expect(Colors.primary).toBe("#c18297");
    expect(Colors.background).toBe("#FFFFFF");
  });

  it("todos los valores son hex válidos", () => {
    const planos = Object.entries(Colors).filter(([, v]) => typeof v === "string");

    expect(planos.length).toBeGreaterThan(10);
    planos.forEach(([clave, valor]) => {
      expect({ clave, valor }).toMatchObject({ valor: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/) });
    });
  });

  it("tiene un color por cada estado de cita", () => {
    ["SCHEDULED", "ARRIVED", "NO_SHOW", "DONE", "CANCELLED"].forEach((estado) => {
      expect(Colors.statusColors[estado as keyof typeof Colors.statusColors]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
