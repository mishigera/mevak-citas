/**
 * El diálogo de vidrio de `alerta()`: qué enseña, qué botón responde a cada forma de
 * cerrarlo y en qué orden salen los avisos que llegan seguidos.
 *
 * Con reloj falso: el panel abre y cierra con temporizadores (`popover.test.tsx`).
 */
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Motion } from "@/constants/motion";
import { DialogoAlerta } from "@/components/DialogoAlerta";
import { alerta } from "@/lib/alerta";

const pasar = (ms = 32) => act(() => jest.advanceTimersByTime(ms));
const avisar = (...args: Parameters<typeof alerta>) => {
  act(() => alerta(...args));
  pasar();
};
const cerrado = () => pasar(Motion.panelCerrar + 32);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function confirmacion() {
  const cancelar = jest.fn();
  const eliminar = jest.fn();
  return {
    cancelar,
    eliminar,
    botones: [
      { text: "Cancelar", style: "cancel" as const, onPress: cancelar },
      { text: "Eliminar", style: "destructive" as const, onPress: eliminar },
    ],
  };
}

describe("DialogoAlerta", () => {
  it("cerrado no enseña nada", () => {
    render(<DialogoAlerta />);
    expect(screen.queryByTestId("dialogo-alerta")).toBeNull();
  });

  it("enseña el título, el mensaje y los botones con su nombre", () => {
    render(<DialogoAlerta />);
    const { botones } = confirmacion();

    avisar("Eliminar bloqueo", "¿Confirmas eliminar este bloqueo?", botones);

    expect(screen.getByText("Eliminar bloqueo")).toBeTruthy();
    expect(screen.getByText("¿Confirmas eliminar este bloqueo?")).toBeTruthy();
    expect(screen.getByLabelText("Cancelar")).toBeTruthy();
    expect(screen.getByLabelText("Eliminar")).toBeTruthy();
  });

  it("un botón llama a su onPress y cierra", () => {
    render(<DialogoAlerta />);
    const { botones, cancelar, eliminar } = confirmacion();
    avisar("Eliminar bloqueo", "¿Seguro?", botones);

    fireEvent.press(screen.getByLabelText("Eliminar"));
    cerrado();

    expect(eliminar).toHaveBeenCalledTimes(1);
    expect(cancelar).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialogo-alerta")).toBeNull();
  });

  it("un doble toque no responde dos veces", () => {
    render(<DialogoAlerta />);
    const { botones, eliminar } = confirmacion();
    avisar("Eliminar bloqueo", "¿Seguro?", botones);

    fireEvent.press(screen.getByLabelText("Eliminar"));
    fireEvent.press(screen.getByLabelText("Eliminar"));

    expect(eliminar).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["la ✕", "Cerrar"],
    ["tocar fuera", "Cerrar panel"],
  ])("cerrar con %s es cancelar", (_c, etiqueta) => {
    render(<DialogoAlerta />);
    const { botones, cancelar, eliminar } = confirmacion();
    avisar("Eliminar bloqueo", "¿Seguro?", botones);

    fireEvent.press(screen.getByLabelText(etiqueta));

    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(eliminar).not.toHaveBeenCalled();
  });

  it("un aviso de un solo botón responde con ese botón aunque se cierre tocando fuera", () => {
    // "Cliente generado": el `onPress` del Aceptar es el que vuelve a la lista.
    render(<DialogoAlerta />);
    const aceptar = jest.fn();
    avisar("Cliente generado", "María se creó correctamente.", [{ text: "Aceptar", onPress: aceptar }]);

    fireEvent.press(screen.getByLabelText("Cerrar panel"));

    expect(aceptar).toHaveBeenCalledTimes(1);
  });

  it("con dos botones y ninguno de cancelar, cerrar solo cierra", () => {
    render(<DialogoAlerta />);
    const uno = jest.fn();
    const otro = jest.fn();
    avisar("Elige", undefined, [{ text: "Uno", onPress: uno }, { text: "Otro", onPress: otro }]);

    fireEvent.press(screen.getByLabelText("Cerrar panel"));

    expect(uno).not.toHaveBeenCalled();
    expect(otro).not.toHaveBeenCalled();
  });

  it("un aviso sin botones lleva un Aceptar", () => {
    render(<DialogoAlerta />);

    avisar("Servicio creado");

    expect(screen.getByLabelText("Aceptar")).toBeTruthy();
  });

  it("dos avisos seguidos salen uno detrás de otro", () => {
    render(<DialogoAlerta />);

    avisar("Primero");
    avisar("Segundo");

    expect(screen.getByText("Primero")).toBeTruthy();
    expect(screen.queryByText("Segundo")).toBeNull();

    fireEvent.press(screen.getByLabelText("Aceptar"));
    pasar();

    expect(screen.getByText("Segundo")).toBeTruthy();
  });

  it("desmontado, alerta() vuelve a Alert.alert", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { unmount } = render(<DialogoAlerta />);
    unmount();

    alerta("Error", "x");

    expect(spy).toHaveBeenCalledWith("Error", "x");
    spy.mockRestore();
  });
});
