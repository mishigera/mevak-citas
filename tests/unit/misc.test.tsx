jest.mock("@/contexts/auth", () => require("../setup/auth-mock"));

// `expo-router/html` solo existe al construir el HTML; en test se pinta plano.
jest.mock("expo-router/html", () => ({ ScrollViewStyleReset: () => null }));

import React from "react";
import { screen } from "@testing-library/react-native";
import NotFoundScreen from "@/app/+not-found";
import HtmlRoot from "@/app/+html";
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

    // La pantalla estaba en inglés (plantilla de Expo). El texto de usuario va en
    // español, como el resto de la app.
    expect(screen.getByText("Esta pantalla no existe.")).toBeTruthy();
  });

  it("ofrece volver al inicio", () => {
    renderScreen(<NotFoundScreen />);

    expect(screen.getByText("Volver al inicio")).toBeTruthy();
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

describe("plantilla HTML de web", () => {
  /**
   * No se renderiza con RNTL: `+html.tsx` devuelve etiquetas del DOM (`html`, `head`),
   * no componentes de React Native. Se invoca como función y se inspecciona el árbol.
   * Solo corre al construir el bundle web, nunca dentro de la app.
   */
  const arbol = HtmlRoot({ children: null }) as React.ReactElement<any>;

  function buscarMetas(nodo: any, encontrados: any[] = []): any[] {
    if (!nodo || typeof nodo !== "object") return encontrados;
    if (Array.isArray(nodo)) {
      nodo.forEach((n) => buscarMetas(n, encontrados));
      return encontrados;
    }
    if (nodo.type === "meta") encontrados.push(nodo.props);
    buscarMetas(nodo.props?.children, encontrados);
    return encontrados;
  }

  it("declara el documento en español", () => {
    expect(arbol.type).toBe("html");
    expect(arbol.props.lang).toBe("es");
  });

  it("pide viewport-fit=cover, sin el cual los safe-area insets valen 0 en la PWA", () => {
    const viewport = buscarMetas(arbol).find((m) => m.name === "viewport");

    expect(viewport?.content).toContain("viewport-fit=cover");
    expect(viewport?.content).toContain("width=device-width");
  });

  it("trae las meta que hacen que se abra como app desde la pantalla de inicio", () => {
    const metas = buscarMetas(arbol);
    const porNombre = (n: string) => metas.find((m) => m.name === n)?.content;

    expect(porNombre("apple-mobile-web-app-capable")).toBe("yes");
    expect(porNombre("apple-mobile-web-app-status-bar-style")).toBe("black-translucent");
    expect(porNombre("theme-color")).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
