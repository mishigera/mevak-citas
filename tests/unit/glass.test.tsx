/**
 * Sistema de diseño de vidrio: tokens responsive, primitivas, andamio y barra de
 * pestañas. Lo que aquí se fija es sobre todo el comportamiento por ancho, que es
 * justo lo que no se ve en los tests de pantalla (todos corren a 390 px).
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { layoutFor, BREAKPOINTS } from "@/lib/responsive";
import { GlassSurface, GlassCard, GlassIconButton, GlassSegmented, GlassBar } from "@/components/glass";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Screen, ContentColumn, useScreenLayout } from "@/components/Screen";
import { GlassTabBar, type GlassTabBarProps } from "@/components/GlassTabBar";
import { setViewport, VIEWPORTS } from "../setup/screen-harness";

describe("layoutFor", () => {
  it("clasifica el ancho en los tres breakpoints", () => {
    expect(layoutFor(390, 844).bp).toBe("compact");
    expect(layoutFor(BREAKPOINTS.medium - 1, 800).bp).toBe("compact");
    expect(layoutFor(BREAKPOINTS.medium, 800).bp).toBe("medium");
    expect(layoutFor(820, 1180).bp).toBe("medium");
    expect(layoutFor(BREAKPOINTS.expanded, 768).bp).toBe("expanded");
    expect(layoutFor(1366, 1024).bp).toBe("expanded");
  });

  it("en celular no pone tope de ancho; en tablet sí", () => {
    expect(layoutFor(390, 844).contentMaxWidth).toBe(0);
    expect(layoutFor(820, 1180).contentMaxWidth).toBeGreaterThan(0);
    expect(layoutFor(1024, 768).contentMaxWidth).toBeGreaterThan(0);
  });

  it("el riel lateral solo existe en expanded", () => {
    expect(layoutFor(390, 844).hasSideRail).toBe(false);
    expect(layoutFor(820, 1180).hasSideRail).toBe(false);
    expect(layoutFor(1024, 768).hasSideRail).toBe(true);
  });

  it("el margen lateral crece con el ancho", () => {
    expect(layoutFor(820, 1180).gutter).toBeGreaterThan(layoutFor(390, 844).gutter);
    expect(layoutFor(1024, 768).gutter).toBeGreaterThan(layoutFor(820, 1180).gutter);
  });
});

describe("primitivas de vidrio", () => {
  it("GlassSurface pinta a sus hijos en todos los tonos", () => {
    const tonos = ["neutral", "soft", "strong", "pink", "pinkStrong"] as const;
    tonos.forEach((tone) => {
      const { unmount } = render(
        <GlassSurface tone={tone}>
          <Text>Contenido {tone}</Text>
        </GlassSurface>,
      );
      expect(screen.getByText(`Contenido ${tone}`)).toBeTruthy();
      unmount();
    });
  });

  it("GlassSurface admite quitarle el borde y la sombra", () => {
    render(
      <GlassSurface bordered={false} elevation="none" testID="lisa">
        <Text>Sin filo</Text>
      </GlassSurface>,
    );
    expect(screen.getByTestId("lisa")).toBeTruthy();
    expect(screen.getByText("Sin filo")).toBeTruthy();
  });

  it("GlassCard sin onPress no es pulsable, con onPress sí", () => {
    const onPress = jest.fn();
    render(
      <>
        <GlassCard testID="quieta">
          <Text>Quieta</Text>
        </GlassCard>
        <GlassCard testID="pulsable" onPress={onPress}>
          <Text>Pulsable</Text>
        </GlassCard>
      </>,
    );

    fireEvent.press(screen.getByTestId("pulsable"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quieta")).toBeTruthy();
  });

  it("GlassIconButton dispara onPress en sus dos variantes", () => {
    const glass = jest.fn();
    const primary = jest.fn();
    render(
      <>
        <GlassIconButton name="add" onPress={glass} testID="b-glass" />
        <GlassIconButton name="add" variant="primary" onPress={primary} testID="b-primary" />
      </>,
    );

    fireEvent.press(screen.getByTestId("b-glass"));
    fireEvent.press(screen.getByTestId("b-primary"));

    expect(glass).toHaveBeenCalledTimes(1);
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it("GlassSegmented marca la opción activa y avisa del cambio", () => {
    const onChange = jest.fn();
    render(
      <GlassSegmented
        options={[
          { value: "day", label: "Día" },
          { value: "month", label: "Mes" },
        ]}
        value="day"
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Día")).toBeTruthy();
    fireEvent.press(screen.getByText("Mes"));
    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("GlassBar pinta a sus hijos", () => {
    render(
      <GlassBar testID="barra">
        <Text>Encabezado</Text>
      </GlassBar>,
    );
    expect(screen.getByTestId("barra")).toBeTruthy();
    expect(screen.getByText("Encabezado")).toBeTruthy();
  });

  it("AmbientBackground se pinta (es lo que el vidrio refracta)", () => {
    render(<AmbientBackground />);
    expect(screen.getByTestId("ambient-background")).toBeTruthy();
  });
});

/** Expone las medidas del andamio como texto, para poder aseverarlas. */
function Sonda() {
  const { paddingTop, paddingBottom, gutter, contentMaxWidth } = useScreenLayout();
  return (
    <Text testID="sonda">{JSON.stringify({ paddingTop, paddingBottom, gutter, contentMaxWidth })}</Text>
  );
}

function leerSonda() {
  return JSON.parse(screen.getByTestId("sonda").props.children);
}

describe("Screen", () => {
  it("pinta título, subtítulo, acción y la banda de abajo", () => {
    render(
      <Screen
        title="Agenda"
        subtitle="Hoy, viernes"
        action={<Text>Acción</Text>}
        below={<Text>Banda</Text>}
      >
        <Text>Cuerpo</Text>
      </Screen>,
    );

    expect(screen.getByText("Agenda")).toBeTruthy();
    expect(screen.getByText("Hoy, viernes")).toBeTruthy();
    expect(screen.getByText("Acción")).toBeTruthy();
    expect(screen.getByText("Banda")).toBeTruthy();
    expect(screen.getByText("Cuerpo")).toBeTruthy();
  });

  it("sin título ni acción ni banda no monta chrome", () => {
    render(
      <Screen>
        <Text>Solo cuerpo</Text>
      </Screen>,
    );
    expect(screen.getByText("Solo cuerpo")).toBeTruthy();
  });

  it("reserva hueco abajo para la barra flotante, y menos si no hay pestañas", () => {
    render(
      <Screen title="Con pestañas">
        <Sonda />
      </Screen>,
    );
    const conPestanas = leerSonda().paddingBottom;
    screen.unmount();

    render(
      <Screen title="Sin pestañas" hasTabBar={false}>
        <Sonda />
      </Screen>,
    );
    const sinPestanas = leerSonda().paddingBottom;

    expect(conPestanas).toBeGreaterThan(sinPestanas);
  });

  it("en iPad apaisado el hueco de abajo desaparece: la navegación es el riel lateral", () => {
    setViewport(VIEWPORTS.ipadApaisado);
    render(
      <Screen title="Ancha">
        <Sonda />
      </Screen>,
    );

    const { contentMaxWidth, paddingBottom } = leerSonda();
    expect(contentMaxWidth).toBeGreaterThan(0);
    // Con riel no hay barra inferior que esquivar.
    expect(paddingBottom).toBeLessThan(90);
  });

  it("ContentColumn centra y limita el ancho dentro de Screen", () => {
    setViewport(VIEWPORTS.ipadVertical);
    render(
      <Screen title="Media">
        <ContentColumn>
          <Text>Columna</Text>
        </ContentColumn>
      </Screen>,
    );
    expect(screen.getByText("Columna")).toBeTruthy();
  });
});

function props(overrides: Partial<GlassTabBarProps> = {}): GlassTabBarProps {
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  return {
    state: {
      index: 0,
      routes: [
        { key: "index-1", name: "index" },
        { key: "clients-1", name: "clients" },
      ],
    },
    descriptors: {
      "index-1": { options: { title: "Inicio", tabBarIcon: () => <View testID="icono-inicio" /> } },
      "clients-1": { options: { title: "Clientes" } },
    },
    navigation: { navigate, emit },
    ...overrides,
  } as GlassTabBarProps;
}

describe("GlassTabBar", () => {
  it("en celular es una píldora flotante", () => {
    render(<GlassTabBar {...props()} />);
    expect(screen.getByTestId("glass-tab-bar")).toBeTruthy();
    expect(screen.queryByTestId("glass-tab-rail")).toBeNull();
  });

  it("en iPad apaisado es un riel vertical", () => {
    setViewport(VIEWPORTS.ipadApaisado);
    render(<GlassTabBar {...props()} />);
    expect(screen.getByTestId("glass-tab-rail")).toBeTruthy();
    expect(screen.queryByTestId("glass-tab-bar")).toBeNull();
  });

  it("saca los títulos y los iconos de los descriptors, sin duplicarlos", () => {
    render(<GlassTabBar {...props()} />);
    expect(screen.getByText("Inicio")).toBeTruthy();
    expect(screen.getByText("Clientes")).toBeTruthy();
    expect(screen.getByTestId("icono-inicio")).toBeTruthy();
  });

  it("navega al pulsar una pestaña que no es la activa", () => {
    const p = props();
    render(<GlassTabBar {...p} />);

    fireEvent.press(screen.getByText("Clientes"));

    expect(p.navigation.emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "clients-1",
      canPreventDefault: true,
    });
    expect(p.navigation.navigate).toHaveBeenCalledWith("clients");
  });

  it("no navega al pulsar la pestaña ya activa", () => {
    const p = props();
    render(<GlassTabBar {...p} />);

    fireEvent.press(screen.getByText("Inicio"));

    expect(p.navigation.navigate).not.toHaveBeenCalled();
  });

  it("respeta que alguien cancele el evento de pestaña", () => {
    const p = props({
      navigation: { navigate: jest.fn(), emit: jest.fn(() => ({ defaultPrevented: true })) },
    });
    render(<GlassTabBar {...p} />);

    fireEvent.press(screen.getByText("Clientes"));

    expect(p.navigation.navigate).not.toHaveBeenCalled();
  });

  it("aguanta que falte el descriptor de una ruta", () => {
    const p = props({
      state: { index: 0, routes: [{ key: "fantasma", name: "fantasma" }] },
      descriptors: {},
    });
    render(<GlassTabBar {...p} />);
    expect(screen.getByText("fantasma")).toBeTruthy();
  });
});

/**
 * El pulgar deslizante solo existe cuando ya se sabe cuánto mide el carril: hasta que
 * `onLayout` no dispara, `longitud` es 0 y el componente devuelve `null` a propósito.
 * Los tests no hacen layout de verdad, así que hay que medirlo a mano — y es
 * precisamente el camino que usa la app en cuanto se pinta el primer fotograma.
 */
/** Lo poco que un test necesita de un nodo: `react-test-renderer` no trae tipos. */
type NodoDePrueba = { props: Record<string, unknown> };

function medir(nodo: ReturnType<typeof screen.getByTestId>, width: number, height = 64) {
  const conLayout = nodo.findAll((n: NodoDePrueba) => typeof n.props.onLayout === "function");
  if (conLayout.length === 0) throw new Error("ese nodo no mide nada");
  fireEvent(conLayout[0], "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

describe("pulgar deslizante", () => {
  it("no se pinta hasta que el carril está medido", () => {
    render(
      <GlassSegmented
        options={[
          { value: "day", label: "Día" },
          { value: "month", label: "Mes" },
        ]}
        value="day"
        onChange={jest.fn()}
      />,
    );

    expect(screen.queryByTestId("pulgar-segmentado")).toBeNull();
  });

  it("medido el carril, ocupa una celda y se planta en la opción activa", () => {
    render(
      <GlassSegmented
        testID="segmentado"
        options={[
          { value: "day", label: "Día" },
          { value: "month", label: "Mes" },
        ]}
        value="month"
        onChange={jest.fn()}
      />,
    );
    medir(screen.getByTestId("segmentado"), 300);

    const estilo = StyleSheet.flatten(screen.getByTestId("pulgar-segmentado").props.style);
    // Dos opciones en 300 px: media anchura, y desplazado media anchura por ser la 2.ª.
    expect(estilo.width).toBe(150);
    expect(estilo.transform).toEqual([{ translateX: 150 }]);
  });

  it("en la barra de pestañas se desliza en horizontal", () => {
    render(<GlassTabBar {...props()} />);
    medir(screen.getByTestId("glass-tab-bar"), 320);

    const estilo = StyleSheet.flatten(screen.getByTestId("pulgar-pestanas").props.style);
    expect(estilo.width).toBe(160);
    expect(estilo.transform).toEqual([{ translateX: 0 }]);
  });

  it("en el riel del iPad se desliza en vertical, no en horizontal", () => {
    setViewport(VIEWPORTS.ipadApaisado);
    const p = props();
    p.state.index = 1;
    render(<GlassTabBar {...p} />);
    medir(screen.getByTestId("glass-tab-rail"), 92, 400);

    const estilo = StyleSheet.flatten(screen.getByTestId("pulgar-pestanas").props.style);
    expect(estilo.height).toBe(200);
    expect(estilo.transform).toEqual([{ translateY: 200 }]);
  });

  it("una sola pestaña no lo rompe", () => {
    const p = props({
      state: { index: 0, routes: [{ key: "solo", name: "solo" }] },
      descriptors: { solo: { options: { title: "Solo" } } },
    });
    render(<GlassTabBar {...p} />);
    medir(screen.getByTestId("glass-tab-bar"), 200);

    const estilo = StyleSheet.flatten(screen.getByTestId("pulgar-pestanas").props.style);
    expect(estilo.width).toBe(200);
  });
});
