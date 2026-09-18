jest.mock("@/contexts/auth", () => require("../../setup/auth-mock"));

import React from "react";
import { Alert } from "react-native";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import LoginScreen from "@/app/login";
import IndexPage from "@/app/index";
import {
  renderScreen, resetApi, mockRouter, __setAuthUser, __setAuthLoading,
  __resetAuth, __authSpies,
} from "../../setup/screen-harness";

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  resetApi();
  __resetAuth();
  mockRouter.replace.mockClear();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => alertSpy.mockRestore());

const escribirCredenciales = (email: string, password: string) => {
  fireEvent.changeText(screen.getByPlaceholderText("Correo electrónico"), email);
  fireEvent.changeText(screen.getByPlaceholderText("Contraseña"), password);
};

describe("pantalla de login", () => {
  it("muestra la marca y el formulario", () => {
    renderScreen(<LoginScreen />);

    expect(screen.getByText("Mevak Beauty Center")).toBeTruthy();
    expect(screen.getByText("Iniciar sesión")).toBeTruthy();
    expect(screen.getByPlaceholderText("Correo electrónico")).toBeTruthy();
    expect(screen.getByPlaceholderText("Contraseña")).toBeTruthy();
    expect(screen.getByText("Entrar")).toBeTruthy();
  });

  it("no ofrece cuentas de demostración", () => {
    renderScreen(<LoginScreen />);

    expect(screen.queryByText(/admin123/i)).toBeNull();
    expect(screen.queryByText(/demo/i)).toBeNull();
    expect(screen.getByText("Acceso restringido para personal autorizado.")).toBeTruthy();
  });

  it("la contraseña empieza oculta y se puede revelar", () => {
    renderScreen(<LoginScreen />);
    const campo = screen.getByPlaceholderText("Contraseña");

    expect(campo.props.secureTextEntry).toBe(true);

    fireEvent.press(screen.UNSAFE_getAllByProps({ hitSlop: 8 })[0]);

    expect(screen.getByPlaceholderText("Contraseña").props.secureTextEntry).toBe(false);
  });
});

describe("validación antes de enviar", () => {
  it.each([
    ["ambos vacíos", "", ""],
    ["sin correo", "", "secreta"],
    ["sin contraseña", "duena@mevak.test", ""],
  ])("avisa si faltan datos: %s", async (_caso, email, password) => {
    renderScreen(<LoginScreen />);
    escribirCredenciales(email, password);

    fireEvent.press(screen.getByText("Entrar"));

    expect(alertSpy).toHaveBeenCalledWith("Error", "Ingresa correo y contraseña");
    expect(__authSpies().login).not.toHaveBeenCalled();
  });
});

describe("envío del formulario", () => {
  it("normaliza el correo: sin espacios y en minúsculas", async () => {
    renderScreen(<LoginScreen />);
    escribirCredenciales("  DUENA@Mevak.Test  ", "secreta");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() =>
      expect(__authSpies().login).toHaveBeenCalledWith("duena@mevak.test", "secreta"),
    );
  });

  it("no toca la contraseña", async () => {
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "  Con Espacios  ");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() =>
      expect(__authSpies().login).toHaveBeenCalledWith("a@b.c", "  Con Espacios  "),
    );
  });

  it("navega a la app al entrar bien", async () => {
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "secreta");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)"));
  });

  it("da respuesta háptica al pulsar", async () => {
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "secreta");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalled());
  });

  it("también se envía desde el teclado", async () => {
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "secreta");

    fireEvent(screen.getByPlaceholderText("Contraseña"), "submitEditing");

    await waitFor(() => expect(__authSpies().login).toHaveBeenCalled());
  });
});

describe("errores al entrar", () => {
  it("distingue credenciales incorrectas", async () => {
    __authSpies().login.mockRejectedValueOnce(new Error("Credenciales incorrectas"));
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "mal");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Inicio de sesión", "Usuario o contraseña no válido"),
    );
  });

  it("reconoce también un mensaje con 401", async () => {
    __authSpies().login.mockRejectedValueOnce(new Error("HTTP 401"));
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "mal");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Inicio de sesión", "Usuario o contraseña no válido"),
    );
  });

  it("para cualquier otro fallo da un mensaje genérico", async () => {
    __authSpies().login.mockRejectedValueOnce(new Error("Network request failed"));
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "secreta");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Error", "No se pudo iniciar sesión. Intenta de nuevo."),
    );
  });

  it("no navega si falla", async () => {
    __authSpies().login.mockRejectedValueOnce(new Error("Credenciales incorrectas"));
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "mal");

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("deja volver a intentarlo tras un fallo", async () => {
    __authSpies().login.mockRejectedValueOnce(new Error("Credenciales incorrectas"));
    renderScreen(<LoginScreen />);
    escribirCredenciales("a@b.c", "mal");

    fireEvent.press(screen.getByText("Entrar"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    fireEvent.press(screen.getByText("Entrar"));

    await waitFor(() => expect(__authSpies().login).toHaveBeenCalledTimes(2));
  });
});

describe("sesión ya iniciada", () => {
  it("redirige fuera del login", () => {
    __setAuthUser({ id: "u1", name: "Dueña", email: "d@m.test", role: "OWNER" });

    renderScreen(<LoginScreen />);

    expect(screen.queryByText("Iniciar sesión")).toBeNull();
    expect(screen.getByTestId("redirect-/(tabs)")).toBeTruthy();
  });
});

describe("pantalla raíz", () => {
  it("muestra el cargador mientras comprueba la sesión", () => {
    __setAuthLoading(true);

    renderScreen(<IndexPage />);

    expect(screen.queryByTestId("redirect-/login")).toBeNull();
    expect(screen.UNSAFE_root).toBeTruthy();
  });

  it("manda al login si no hay sesión", () => {
    renderScreen(<IndexPage />);

    expect(screen.getByTestId("redirect-/login")).toBeTruthy();
  });

  it("manda a la app si hay sesión", () => {
    __setAuthUser({ id: "u1", name: "Dueña", email: "d@m.test", role: "OWNER" });

    renderScreen(<IndexPage />);

    expect(screen.getByTestId("redirect-/(tabs)")).toBeTruthy();
  });
});
