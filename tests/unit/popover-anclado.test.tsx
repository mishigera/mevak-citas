/**
 * Paneles anclados a un campo de formulario.
 *
 * El fallo que motiva esto se vio en un teléfono: en web, react-native-web pone
 * `z-index: 0` en toda `View`, así que un panel dentro de un campo quedaba **debajo** de
 * los campos siguientes, y su fondo de "tocar fuera para cerrar" solo cubría el campo —
 * se podían abrir dos paneles a la vez—. Con `anclaRef` el panel sale del árbol y se
 * coloca solo, pegado al campo.
 *
 * Jest corre como iOS: la rama web se fuerza con `usaCSS`, y `Portal` resuelve a su
 * versión nativa (pinta en el sitio), que es suficiente para comprobar la posición.
 */
jest.mock("@/lib/motion", () => ({ ...jest.requireActual("@/lib/motion"), usaCSS: true }));

// eslint-disable-next-line import/first -- el mock tiene que estar declarado antes
import React, { useRef } from "react";
// eslint-disable-next-line import/first
import { StyleSheet, Text, View } from "react-native";
// eslint-disable-next-line import/first
import { act, render, screen } from "@testing-library/react-native";
// eslint-disable-next-line import/first
import { GlassPopover, posicionAnclada, type RectAncla } from "@/components/glass/GlassPopover";

describe("posicionAnclada", () => {
  const campo = (top: number, alto = 50): RectAncla => ({ top, bottom: top + alto, left: 16, width: 358 });

  it("con sitio debajo, va debajo del campo y del mismo ancho", () => {
    const p = posicionAnclada(campo(100), 844, 300);

    expect(p).toMatchObject({ top: 156, left: 16, width: 358, origen: "arriba-izquierda" });
    expect(p.bottom).toBeUndefined();
  });

  /** "Hora fin" está abajo del todo del formulario: su panel no cabe debajo. */
  it("sin sitio debajo, se abre hacia arriba y nace del borde de abajo", () => {
    const p = posicionAnclada(campo(700), 844, 300);

    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(844 - 700 + 6);
    expect(p.origen).toBe("abajo-izquierda");
  });

  it("sin sitio en ningún lado, va al que tenga más y recorta el alto a lo que hay", () => {
    const p = posicionAnclada(campo(300), 600, 900);

    expect(p.origen).toBe("abajo-izquierda");
    expect(p.maxHeight).toBe(300 - 6 - 12);
  });

  it("respeta el alto máximo que pida quien lo usa", () => {
    expect(posicionAnclada(campo(100), 844, 0, 280).maxHeight).toBe(280);
  });

  it("antes de medir el panel, decide con el alto máximo", () => {
    // Sin medir (alto 0) y con máximo 300: 700 + 50 deja 82 px debajo, no cabe.
    expect(posicionAnclada(campo(700), 844, 0, 300).origen).toBe("abajo-izquierda");
  });
});

describe("GlassPopover anclado, en web", () => {
  function Anfitrion({ rect, estiloNativo = { maxHeight: 280 } }: { rect: RectAncla; estiloNativo?: object }) {
    const ref = useRef<View | null>(null);
    return (
      <View
        ref={(nodo) => {
          ref.current = nodo;
          // En jest no hay DOM: se le da al nodo lo que devolvería el navegador.
          if (nodo) (nodo as unknown as { getBoundingClientRect: () => RectAncla }).getBoundingClientRect = () => rect;
        }}
      >
        <GlassPopover visible onClose={() => {}} titulo="Elegir hora" anclaRef={ref} testID="panel" style={estiloNativo}>
          <Text>09:00</Text>
        </GlassPopover>
      </View>
    );
  }

  const estilo = () => StyleSheet.flatten(screen.getByTestId("panel").props.style) as Record<string, unknown>;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("se coloca contra la ventana, pegado al campo", () => {
    render(<Anfitrion rect={{ top: 200, bottom: 250, left: 16, width: 180 }} />);
    act(() => jest.advanceTimersByTime(32));

    expect(estilo()).toMatchObject({ position: "fixed", top: 256, left: 16, width: 180, maxHeight: 280 });
  });

  /**
   * Visto en el navegador, no en los tests: el campo pasa `top: 54` para nativo, y al
   * abrir hacia arriba ese `top` sobrevivía al `bottom` calculado. El panel se quedaba
   * clavado arriba con un hueco de 150 px hasta el campo.
   */
  it("abriendo hacia arriba no hereda el `top` que el campo pasa para nativo", () => {
    (globalThis as { innerHeight?: number }).innerHeight = 844;
    render(
      <Anfitrion
        rect={{ top: 508, bottom: 558, left: 201, width: 173 }}
        estiloNativo={{ top: 54, left: 0, right: 0, maxHeight: 300 }}
      />,
    );
    act(() => jest.advanceTimersByTime(32));

    expect(estilo()).toMatchObject({ top: "auto", bottom: 844 - 508 + 6, left: 201, right: "auto", width: 173 });
  });

  it("abriendo hacia abajo tampoco hereda `left/right` del campo", () => {
    (globalThis as { innerHeight?: number }).innerHeight = 844;
    render(
      <Anfitrion rect={{ top: 200, bottom: 250, left: 16, width: 180 }} estiloNativo={{ top: 54, left: 0, right: 0, maxHeight: 300 }} />,
    );
    act(() => jest.advanceTimersByTime(32));

    expect(estilo()).toMatchObject({ top: 256, bottom: "auto", left: 16, right: "auto" });
  });

  it("va por encima de todo lo demás de la pantalla", () => {
    render(<Anfitrion rect={{ top: 200, bottom: 250, left: 16, width: 180 }} />);
    act(() => jest.advanceTimersByTime(32));

    expect(estilo().zIndex).toBeGreaterThan(1000);
  });

  /** Era la segunda mitad del fallo: el fondo solo tapaba el campo. */
  it("el fondo que cierra al tocar fuera cubre la ventana entera", () => {
    render(<Anfitrion rect={{ top: 200, bottom: 250, left: 16, width: 180 }} />);
    act(() => jest.advanceTimersByTime(32));

    const fondo = StyleSheet.flatten(screen.getByLabelText("Cerrar panel").props.style) as Record<string, unknown>;
    expect(fondo).toMatchObject({ position: "fixed", top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("un panel sin ancla sigue colocándose con su `style`, como antes", () => {
    render(
      <GlassPopover visible onClose={() => {}} titulo="Avisos" testID="panel" style={{ top: 50, right: 10 }}>
        <Text>x</Text>
      </GlassPopover>,
    );
    act(() => jest.advanceTimersByTime(32));

    expect(estilo()).toMatchObject({ position: "absolute", top: 50, right: 10 });
  });
});

describe("posicionAnclada con ancho mínimo", () => {
  /** El calendario en la media columna de Bloqueos quedaba en 170 px: "1011 12". */
  it("un campo estrecho a la izquierda: el panel crece hacia la derecha", () => {
    const p = posicionAnclada({ top: 200, bottom: 250, left: 16, width: 170 }, 844, 300, Infinity, 300, 390);

    expect(p).toMatchObject({ left: 16, width: 300, origen: "arriba-izquierda" });
  });

  it("un campo estrecho a la derecha: se alinea por su borde derecho y nace de esa esquina", () => {
    const p = posicionAnclada({ top: 200, bottom: 250, left: 204, width: 170 }, 844, 300, Infinity, 300, 390);

    expect(p.left).toBe(204 + 170 - 300);
    expect(p.origen).toBe("arriba-derecha");
  });

  it("nunca se sale de la ventana", () => {
    const p = posicionAnclada({ top: 200, bottom: 250, left: 300, width: 80 }, 844, 300, Infinity, 360, 390);

    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + p.width).toBeLessThanOrEqual(390 - 12);
  });

  it("sin ancho mínimo mide lo que el campo, como antes", () => {
    expect(posicionAnclada({ top: 200, bottom: 250, left: 16, width: 170 }, 844, 300).width).toBe(170);
  });
});

describe("el panel anclado sigue al campo", () => {
  /**
   * Visto en el navegador: con el formulario de Bloqueos recién abierto, la primera
   * medición se tomó mientras la maquetación aún se movía y el panel se quedó 68 px por
   * encima del campo. Solo se volvía a medir con scroll o resize.
   */
  it("si el campo se mueve solo, el panel lo sigue sin scroll ni resize", () => {
    jest.useFakeTimers();
    (globalThis as { innerHeight?: number }).innerHeight = 844;
    let rect: RectAncla = { top: 239, bottom: 283.5, left: 32, width: 158 };

    function Anfitrion() {
      const ref = useRef<View | null>(null);
      return (
        <View
          ref={(nodo) => {
            ref.current = nodo;
            if (nodo) (nodo as unknown as { getBoundingClientRect: () => RectAncla }).getBoundingClientRect = () => rect;
          }}
        >
          <GlassPopover visible onClose={() => {}} titulo="Elegir fecha" anclaRef={ref} testID="panel">
            <Text>x</Text>
          </GlassPopover>
        </View>
      );
    }

    render(<Anfitrion />);
    act(() => jest.advanceTimersByTime(32));
    const top = () => (StyleSheet.flatten(screen.getByTestId("panel").props.style) as { top: number }).top;
    expect(top()).toBe(289.5);

    // La fila baja 68 px cuando termina de entrar el formulario.
    rect = { top: 307, bottom: 351.5, left: 32, width: 158 };
    act(() => jest.advanceTimersByTime(200));

    expect(top()).toBe(357.5);
    jest.useRealTimers();
  });
});
