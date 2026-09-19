/**
 * El panel que nace del botón: lo que hace, no cómo se ve.
 *
 * Su parte visual —el recorte que crece desde el círculo— es CSS y se comprueba en
 * `motion-web.test.tsx`. Aquí va el comportamiento: qué se monta, qué se desmonta, qué
 * lo cierra y qué sigue siendo pulsable mientras se cierra.
 */
import React, { useState } from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Motion } from "@/constants/motion";
import { GlassPopover } from "@/components/glass/GlassPopover";
import { fijarPreferencias, reiniciarPreferencias } from "@/lib/motion";

function Anfitrion({ conFondo = true }: { conFondo?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Text testID="abrir" onPress={() => setAbierto(true)}>
        abrir
      </Text>
      <GlassPopover
        visible={abierto}
        onClose={() => setAbierto(false)}
        titulo="Avisos"
        conFondo={conFondo}
        testID="panel"
      >
        <Text>Contenido del panel</Text>
      </GlassPopover>
    </>
  );
}

afterEach(() => {
  act(() => reiniciarPreferencias());
  jest.useRealTimers();
});

/**
 * El panel se abre y se cierra con temporizadores: un fotograma para arrancar la
 * transición y `Motion.panelCerrar` para que el colapso se vea antes de desmontar.
 *
 * Con relojes de verdad eso es un `waitFor` que espera 340 ms reales, y ahí estaba el
 * problema: bajo carga —la suite entera en paralelo— el desmontaje llegaba tarde y los
 * tres tests que lo esperaban fallaban de forma intermitente. Además, cada disparo caía
 * fuera de `act()` y React lo avisaba. Con relojes falsos el tiempo lo manda el test.
 */
function conRelojes() {
  jest.useFakeTimers();
  return {
    abrir: () => act(() => jest.advanceTimersByTime(32)),
    cerrar: () => act(() => jest.advanceTimersByTime(Motion.panelCerrar + 32)),
  };
}

describe("GlassPopover", () => {
  it("cerrado no monta nada: ni contenido, ni foco que robar", () => {
    render(<Anfitrion />);
    expect(screen.queryByTestId("panel")).toBeNull();
    expect(screen.queryByText("Contenido del panel")).toBeNull();
  });

  it("al abrirse monta su cabecera y su contenido", () => {
    render(<Anfitrion />);
    fireEvent.press(screen.getByTestId("abrir"));

    expect(screen.getByTestId("panel")).toBeTruthy();
    expect(screen.getByText("Avisos")).toBeTruthy();
    expect(screen.getByText("Contenido del panel")).toBeTruthy();
  });

  it("su botón de cerrar lo cierra, pero el panel sigue montado mientras colapsa", () => {
    const reloj = conRelojes();
    render(<Anfitrion />);
    fireEvent.press(screen.getByTestId("abrir"));
    reloj.abrir();

    fireEvent.press(screen.getByLabelText("Cerrar"));

    // No desaparece de golpe: colapsa hacia el botón que lo abrió.
    expect(screen.queryByTestId("panel")).toBeTruthy();
    reloj.cerrar();
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("tocar fuera lo cierra", () => {
    const reloj = conRelojes();
    render(<Anfitrion />);
    fireEvent.press(screen.getByTestId("abrir"));
    reloj.abrir();

    fireEvent.press(screen.getByLabelText("Cerrar panel"));
    reloj.cerrar();

    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("sin fondo no hay capa que cierre al tocar fuera", () => {
    render(<Anfitrion conFondo={false} />);
    fireEvent.press(screen.getByTestId("abrir"));

    expect(screen.queryByLabelText("Cerrar panel")).toBeNull();
    expect(screen.getByText("Contenido del panel")).toBeTruthy();
  });

  it("con movimiento reducido se abre igual, sin animar", () => {
    act(() => fijarPreferencias({ movimientoReducido: true }));
    render(<Anfitrion />);

    fireEvent.press(screen.getByTestId("abrir"));

    expect(screen.getByText("Contenido del panel")).toBeTruthy();
  });

  it("navegar a otra pantalla lo cierra: no se queda flotando encima", () => {
    const { usePathname } = jest.requireMock("expo-router");
    usePathname.mockReturnValue("/(tabs)");
    const onClose = jest.fn();

    const { rerender } = render(
      <GlassPopover visible onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido del panel</Text>
      </GlassPopover>,
    );
    expect(onClose).not.toHaveBeenCalled();

    usePathname.mockReturnValue("/client/7");
    rerender(
      <GlassPopover visible onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido del panel</Text>
      </GlassPopover>,
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    usePathname.mockReturnValue("/");
  });

  it("si ya estaba cerrado, navegar no dispara un cierre de más", () => {
    const { usePathname } = jest.requireMock("expo-router");
    usePathname.mockReturnValue("/(tabs)");
    const onClose = jest.fn();

    const { rerender } = render(
      <GlassPopover visible={false} onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido del panel</Text>
      </GlassPopover>,
    );

    usePathname.mockReturnValue("/client/7");
    rerender(
      <GlassPopover visible={false} onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido del panel</Text>
      </GlassPopover>,
    );

    expect(onClose).not.toHaveBeenCalled();
    usePathname.mockReturnValue("/");
  });

  it("sin desenfoque disponible sigue siendo legible: superficie sólida", () => {
    act(() => fijarPreferencias({ hayDesenfoque: false }));
    render(<Anfitrion />);

    fireEvent.press(screen.getByTestId("abrir"));

    expect(screen.getByText("Contenido del panel")).toBeTruthy();
  });
});
