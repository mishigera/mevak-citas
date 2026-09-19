/**
 * El sistema de movimiento en su rama de CSS, que es la que se sirve en Safari.
 *
 * Jest corre con `Platform.OS = "ios"`, así que la rama web no se ejercitaría nunca:
 * se fuerza mockeando `usaCSS`, que vive en `lib/motion` justo para esto. El resto del
 * módulo es el de verdad —la funcion se comparte, así que el almacén de preferencias
 * es el mismo objeto— y por eso `fijarPreferencias` sigue funcionando.
 */
import React from "react";
import { StyleSheet, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Curva, Motion } from "@/constants/motion";

jest.mock("@/lib/motion", () => ({ ...jest.requireActual("@/lib/motion"), usaCSS: true }));

// eslint-disable-next-line import/first -- el mock tiene que estar declarado antes
import { fijarPreferencias, reiniciarPreferencias, soportaLinear, useMotionPreferences } from "@/lib/motion";
import { Aparecer, Entrar, Flotar, Pop, PressableMotion, Stagger } from "@/components/motion";
import { Shimmer } from "@/components/motion/Shimmer";
import { GlassPopover } from "@/components/glass/GlassPopover";

function estiloDe(testID: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;
}

function estiloDeNodo(nodo: { props: Record<string, unknown> }): Record<string, unknown> {
  return (StyleSheet.flatten(nodo.props.style as never) ?? {}) as Record<string, unknown>;
}

afterEach(() => {
  act(() => reiniciarPreferencias());
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
  delete (globalThis as { CSS?: unknown }).CSS;
});

describe("entradas en CSS", () => {
  it("emite keyframes, duración y curva del sistema", () => {
    render(<Entrar testID="e"><Text>Hola</Text></Entrar>);
    const estilo = estiloDe("e");
    expect(estilo.animationKeyframes).toBeDefined();
    expect(estilo.animationDuration).toBe(`${Motion.duracion}ms`);
    expect(estilo.animationTimingFunction).toBe(Curva.suave);
  });

  it("usa `backwards` y NUNCA `both`: con `both` moriría el hover", () => {
    render(
      <>
        <Entrar testID="e"><Text>a</Text></Entrar>
        <Aparecer testID="a"><Text>b</Text></Aparecer>
        <Pop testID="p"><Text>c</Text></Pop>
      </>,
    );
    ["e", "a", "p"].forEach((id) => expect(estiloDe(id).animationFillMode).toBe("backwards"));
  });

  it("la opacidad cierra antes del final, para que el desenfoque no entre de golpe", () => {
    render(<Entrar testID="e"><Text>a</Text></Entrar>);
    const keyframes = (estiloDe("e").animationKeyframes as Record<string, Record<string, unknown>>[])[0];
    expect(keyframes["0%"].opacity).toBe(0);
    expect(keyframes["55%"].opacity).toBe(1);
    expect(keyframes["100%"].opacity).toBe(1);
  });

  it("el retraso del escalonado viaja como `animationDelay`", () => {
    render(
      <Stagger>
        <Text>uno</Text>
        <Text>dos</Text>
      </Stagger>,
    );
    // Los envoltorios no llevan testID, así que se busca por el texto y se sube al padre.
    const envoltorios = screen.UNSAFE_getAllByProps({ pointerEvents: undefined });
    const conRetraso = envoltorios
      .map((n) => StyleSheet.flatten(n.props.style) as Record<string, unknown>)
      .filter((s) => s && s.animationDelay);
    expect(conRetraso.map((s) => s.animationDelay)).toEqual(
      expect.arrayContaining([`${Motion.paso}ms`, `${Motion.paso * 2}ms`]),
    );
  });

  it("con movimiento reducido no emite ninguna animación", () => {
    act(() => fijarPreferencias({ movimientoReducido: true }));
    render(
      <>
        <Entrar testID="e"><Text>a</Text></Entrar>
        <Flotar testID="f"><Text>b</Text></Flotar>
      </>,
    );
    expect(estiloDe("e")?.animationKeyframes).toBeUndefined();
    expect(estiloDe("f")?.animationKeyframes).toBeUndefined();
  });

  it("el estado vacío flota en bucle", () => {
    render(<Flotar testID="f"><Text>vacío</Text></Flotar>);
    expect(estiloDe("f").animationIterationCount).toBe("infinite");
  });
});

describe("microinteracciones en CSS", () => {
  it("declara la transición del hover y del pulsado", () => {
    render(
      <PressableMotion testID="b" onPress={() => {}}>
        <Text>Pulsa</Text>
      </PressableMotion>,
    );
    const estilo = estiloDe("b");
    expect(String(estilo.transitionProperty)).toContain("transform");
    expect(estilo.transitionDuration).toBe(`${Motion.micro}ms`);
  });
});

describe("esqueleto en CSS", () => {
  it("barre un degradado en bucle, sin pulsar la opacidad", () => {
    render(<Shimmer testID="s" />);
    const estilo = estiloDe("s");
    expect(String(estilo.backgroundImage)).toContain("linear-gradient");
    expect(estilo.animationIterationCount).toBe("infinite");
    expect(estilo.opacity).toBeUndefined();
  });
});

describe("preferencias del navegador", () => {
  function Sonda() {
    const p = useMotionPreferences();
    return <Text testID="sonda">{`${p.movimientoReducido}-${p.transparenciaReducida}`}</Text>;
  }

  it("lee `prefers-reduced-transparency` por `matchMedia`", () => {
    (globalThis as { matchMedia?: unknown }).matchMedia = jest.fn(() => ({
      matches: true,
      addEventListener: jest.fn(),
    }));
    act(() => reiniciarPreferencias());
    render(<Sonda />);
    expect(screen.getByTestId("sonda").props.children).toBe("false-true");
  });

  it("detecta si el navegador entiende `linear()` como curva", () => {
    (globalThis as { CSS?: unknown }).CSS = { supports: (p: string) => p === "transition-timing-function" };
    expect(soportaLinear()).toBe(true);
    (globalThis as { CSS?: unknown }).CSS = { supports: () => { throw new Error("no"); } };
    expect(soportaLinear()).toBe(false);
  });
});

describe("el panel que nace del botón, en CSS", () => {
  function abrirPanel(visible: boolean) {
    render(
      <GlassPopover visible={visible} onClose={() => {}} titulo="Avisos" diametroOrigen={50} testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );
  }

  it("cerrado se recorta al círculo del botón y es invisible al puntero", () => {
    abrirPanel(false);
    // Montado pero cerrado no existe: el panel solo vive mientras se le necesita.
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("abierto recorta al panel entero y transiciona el clip-path", () => {
    abrirPanel(true);
    const estilo = estiloDe("panel");
    // La capa no anima opacidad: eso apagaría el desenfoque de dentro.
    expect(estilo.opacity).toBeUndefined();
    expect(estilo.visibility).toBeDefined();
    expect(screen.getByText("Contenido")).toBeTruthy();
  });

  it("la transición del recorte es la que anima, no un fundido", () => {
    abrirPanel(true);
    const conRecorte = screen
      .UNSAFE_getAllByProps({ pointerEvents: "none" })
      .map((n) => StyleSheet.flatten(n.props.style) as Record<string, unknown>)
      .filter((e) => e && typeof e.clipPath === "string");

    expect(conRecorte.length).toBeGreaterThan(0);
    expect(String(conRecorte[0].transitionProperty)).toContain("clip-path");
  });
});

/** Lo poco que un test necesita de un nodo: `react-test-renderer` no trae tipos. */
type NodoDePrueba = { props: Record<string, unknown> };

describe("el panel, ya medido", () => {
  /** El panel se recorta en píxeles, así que hasta que no se mide no hay recorte real. */
  function medirPanel(width: number, height: number) {
    const conLayout = screen.UNSAFE_root.findAll(
      (n: NodoDePrueba) => typeof n.props.onLayout === "function",
    );
    expect(conLayout.length).toBeGreaterThan(0);
    act(() => {
      fireEvent(conLayout[0], "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    });
  }

  function recortes(): string[] {
    return screen.UNSAFE_root
      .findAll((n: NodoDePrueba) => typeof estiloDeNodo(n).clipPath === "string")
      .map((n: NodoDePrueba) => String(estiloDeNodo(n).clipPath));
  }

  function Anfitrion({ origen }: { origen?: "arriba-derecha" | "abajo-izquierda" | "centro" }) {
    const [visible, setVisible] = React.useState(true);
    return (
      <>
        <Text testID="cerrar-desde-fuera" onPress={() => setVisible(false)}>
          cerrar
        </Text>
        <GlassPopover
          visible={visible}
          onClose={() => setVisible(false)}
          origen={origen}
          diametroOrigen={50}
          titulo="Avisos"
          testID="panel"
        >
          <Text>Contenido</Text>
        </GlassPopover>
      </>
    );
  }

  it("cerrándose se recorta al círculo del botón, en su esquina", () => {
    render(<Anfitrion />);
    medirPanel(320, 400);

    fireEvent.press(screen.getByTestId("cerrar-desde-fuera"));

    // Arriba a la derecha: pegado al borde superior y al derecho, y el resto recortado.
    // 320-50 = 270 por la izquierda, 400-50 = 350 por abajo, radio 25 = medio círculo.
    expect(recortes()[0]).toBe("inset(0px 0px 350px 270px round 25px)");
  });

  it("desde abajo a la izquierda el círculo cae en la otra esquina", () => {
    render(<Anfitrion origen="abajo-izquierda" />);
    medirPanel(320, 400);

    fireEvent.press(screen.getByTestId("cerrar-desde-fuera"));

    expect(recortes()[0]).toBe("inset(350px 270px 0px 0px round 25px)");
  });

  it("desde el centro el círculo queda centrado", () => {
    render(<Anfitrion origen="centro" />);
    medirPanel(320, 400);

    fireEvent.press(screen.getByTestId("cerrar-desde-fuera"));

    expect(recortes()[0]).toBe("inset(175px 135px 175px 135px round 25px)");
  });

  it("un panel más pequeño que el botón no genera un recorte negativo", () => {
    render(<Anfitrion />);
    medirPanel(30, 20);

    fireEvent.press(screen.getByTestId("cerrar-desde-fuera"));

    // El diámetro se recorta a la dimensión menor (20), nunca al revés.
    expect(recortes()[0]).toBe("inset(0px 0px 0px 10px round 10px)");
  });
});

describe("el panel y el teclado", () => {
  /**
   * En jest no hay DOM: el entorno de `jest-expo` es node. El componente ya lee
   * `globalThis.document` con cuidado justo por esto, así que aquí se le pone un
   * documento de mentira que solo sabe guardar oyentes y dispararlos.
   */
  function documentoFalso() {
    const oyentes = new Map<string, ((e: { key: string }) => void)[]>();
    const doc = {
      addEventListener: (tipo: string, f: (e: { key: string }) => void) => {
        oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), f]);
      },
      removeEventListener: (tipo: string, f: (e: { key: string }) => void) => {
        oyentes.set(tipo, (oyentes.get(tipo) ?? []).filter((g) => g !== f));
      },
    };
    (globalThis as { document?: unknown }).document = doc;
    return {
      pulsar: (key: string) => act(() => (oyentes.get("keydown") ?? []).forEach((f) => f({ key }))),
      oyentes: () => (oyentes.get("keydown") ?? []).length,
    };
  }

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("Escape lo cierra", () => {
    const teclado = documentoFalso();
    const onClose = jest.fn();
    render(
      <GlassPopover visible onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );

    teclado.pulsar("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("otra tecla cualquiera no lo cierra", () => {
    const teclado = documentoFalso();
    const onClose = jest.fn();
    render(
      <GlassPopover visible onClose={onClose} titulo="Avisos" testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );

    teclado.pulsar("a");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("cerrado no deja ningún oyente suelto en el documento", () => {
    const teclado = documentoFalso();
    const { rerender } = render(
      <GlassPopover visible onClose={jest.fn()} testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );
    expect(teclado.oyentes()).toBe(1);

    rerender(
      <GlassPopover visible={false} onClose={jest.fn()} testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );

    expect(teclado.oyentes()).toBe(0);
  });

  it("al cerrarse le devuelve el foco al botón que lo abrió", () => {
    const refOrigen = { current: { focus: jest.fn() } };
    const { rerender } = render(
      <GlassPopover visible onClose={jest.fn()} refOrigen={refOrigen} testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );

    rerender(
      <GlassPopover visible={false} onClose={jest.fn()} refOrigen={refOrigen} testID="panel">
        <Text>Contenido</Text>
      </GlassPopover>,
    );

    expect(refOrigen.current.focus).toHaveBeenCalled();
  });
});
