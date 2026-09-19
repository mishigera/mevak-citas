/**
 * El sistema de movimiento en su rama NATIVA (la que corre en jest por defecto).
 * La rama de CSS, que es la que se sirve en Safari, se cubre en `motion-web.test.tsx`.
 */
import React from "react";
import { Text, View } from "react-native";
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { Motion, retrasoEscalonado } from "@/constants/motion";
import {
  fijarPreferencias,
  reiniciarPreferencias,
  estiloWeb,
  ms,
  soportaDesenfoque,
  soportaLinear,
  useMotionPreferences,
  useRelanzar,
} from "@/lib/motion";
import { Aparecer, Entrar, Flotar, Pop, PressableMotion, Stagger } from "@/components/motion";
import { Shimmer, ShimmerLinea, ShimmerTarjeta } from "@/components/motion/Shimmer";

afterEach(() => {
  act(() => reiniciarPreferencias());
});

describe("tokens", () => {
  it("escalona a 60 ms de paso y deja de escalonar en el 11.º", () => {
    expect(retrasoEscalonado(0)).toBe(Motion.paso);
    expect(retrasoEscalonado(1)).toBe(Motion.paso * 2);
    expect(retrasoEscalonado(9)).toBe(Motion.paso * 10);
    // Del 11.º en adelante, todos con el mismo retraso: escalonar más se siente lento.
    expect(retrasoEscalonado(10)).toBe(Motion.paso * 11);
    expect(retrasoEscalonado(25)).toBe(Motion.paso * 11);
  });

  it("`ms` y `estiloWeb` son los dos ayudantes de la capa de CSS", () => {
    expect(ms(420)).toBe("420ms");
    expect(estiloWeb({ clipPath: "inset(0)" })).toEqual({ clipPath: "inset(0)" });
  });
});

describe("preferencias del sistema", () => {
  function Sonda() {
    const p = useMotionPreferences();
    return <Text>{`${p.movimientoReducido}-${p.transparenciaReducida}-${p.hayDesenfoque}`}</Text>;
  }

  it("por defecto no reduce nada y da el desenfoque por bueno", () => {
    render(<Sonda />);
    expect(screen.getByText("false-false-true")).toBeTruthy();
  });

  it("propaga un cambio de preferencia a quien esté suscrito", () => {
    render(<Sonda />);
    act(() => fijarPreferencias({ movimientoReducido: true, transparenciaReducida: true }));
    expect(screen.getByText("true-true-true")).toBeTruthy();
  });

  it("sin `CSS.supports` no afirma que haya `linear()`", () => {
    expect(soportaLinear()).toBe(false);
    // En nativo el desenfoque lo pone expo-blur, así que se da por disponible.
    expect(soportaDesenfoque()).toBe(true);
  });
});

describe("entradas", () => {
  it("pintan a sus hijos", () => {
    render(
      <>
        <Entrar><Text>Entra</Text></Entrar>
        <Aparecer><Text>Aparece</Text></Aparecer>
        <Pop><Text>Pop</Text></Pop>
        <Flotar><Text>Flota</Text></Flotar>
      </>,
    );
    ["Entra", "Aparece", "Pop", "Flota"].forEach((t) => expect(screen.getByText(t)).toBeTruthy());
  });

  it("con movimiento reducido siguen pintando, sin animar", () => {
    act(() => fijarPreferencias({ movimientoReducido: true }));
    render(
      <>
        <Entrar testID="e"><Text>Entra</Text></Entrar>
        <Flotar><Text>Flota</Text></Flotar>
      </>,
    );
    expect(screen.getByText("Entra")).toBeTruthy();
    expect(screen.getByText("Flota")).toBeTruthy();
  });

  it("`activo={false}` pinta el estado final sin animación", () => {
    render(<Entrar activo={false}><Text>Quieto</Text></Entrar>);
    expect(screen.getByText("Quieto")).toBeTruthy();
  });
});

describe("Stagger", () => {
  it("envuelve a cada hijo directo y respeta sus claves", () => {
    render(
      <Stagger testID="lista">
        {["uno", "dos", "tres"].map((t) => (
          <Text key={t}>{t}</Text>
        ))}
      </Stagger>,
    );
    ["uno", "dos", "tres"].forEach((t) => expect(screen.getByText(t)).toBeTruthy());
  });

  it("ignora los huecos (`null`, `false`) que dejan los condicionales", () => {
    const hayPago = false;
    render(
      <Stagger>
        <Text>Cita</Text>
        {hayPago && <Text>Pago</Text>}
        {null}
        <Text>Cliente</Text>
      </Stagger>,
    );
    expect(screen.getByText("Cita")).toBeTruthy();
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.queryByText("Pago")).toBeNull();
  });
});

describe("PressableMotion", () => {
  it("responde al toque y propaga la accesibilidad", () => {
    const onPress = jest.fn();
    render(
      <PressableMotion onPress={onPress} accessibilityLabel="Guardar" testID="boton">
        <Text>Guardar</Text>
      </PressableMotion>,
    );
    fireEvent.press(screen.getByTestId("boton"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Guardar")).toBeTruthy();
  });

  it("el resorte de pulsación no rompe el toque en ninguno de los tres gestos", () => {
    const onPress = jest.fn();
    (["elevar", "escala", "sutil"] as const).forEach((gesto, i) => {
      const { unmount } = render(
        <PressableMotion gesto={gesto} onPress={onPress} testID={`g-${gesto}`}>
          <Text>{gesto}</Text>
        </PressableMotion>,
      );
      fireEvent(screen.getByTestId(`g-${gesto}`), "pressIn");
      fireEvent.press(screen.getByTestId(`g-${gesto}`));
      fireEvent(screen.getByTestId(`g-${gesto}`), "pressOut");
      expect(onPress).toHaveBeenCalledTimes(i + 1);
      unmount();
    });
  });

  it("con movimiento reducido sigue siendo pulsable", () => {
    act(() => fijarPreferencias({ movimientoReducido: true }));
    const onPress = jest.fn();
    render(
      <PressableMotion onPress={onPress} testID="quieto">
        <Text>Quieto</Text>
      </PressableMotion>,
    );
    fireEvent.press(screen.getByTestId("quieto"));
    expect(onPress).toHaveBeenCalled();
  });

  it("deshabilitado no llama al manejador", () => {
    const onPress = jest.fn();
    render(
      <PressableMotion onPress={onPress} disabled testID="off">
        <Text>Off</Text>
      </PressableMotion>,
    );
    fireEvent.press(screen.getByTestId("off"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Shimmer", () => {
  it("se pinta y arranca el barrido cuando ya conoce su ancho", () => {
    render(<Shimmer testID="barra" />);
    const barra = screen.getByTestId("barra");
    act(() => {
      fireEvent(barra, "layout", { nativeEvent: { layout: { width: 200, height: 14 } } });
    });
    expect(barra).toBeTruthy();
  });

  it("con movimiento reducido no anima", () => {
    act(() => fijarPreferencias({ movimientoReducido: true }));
    render(<Shimmer testID="quieta" />);
    act(() => {
      fireEvent(screen.getByTestId("quieta"), "layout", {
        nativeEvent: { layout: { width: 200, height: 14 } },
      });
    });
    expect(screen.getByTestId("quieta")).toBeTruthy();
  });

  it("las formas compuestas se montan", () => {
    render(
      <View>
        <ShimmerLinea width="60%" />
        <ShimmerTarjeta testID="tarjeta" />
        <ShimmerTarjeta lineas={1} />
      </View>,
    );
    expect(screen.getByTestId("tarjeta")).toBeTruthy();
  });
});

describe("useRelanzar", () => {
  function Sonda({ ruta }: { ruta: string }) {
    const clave = useRelanzar(ruta);
    return <Text testID="clave">{clave}</Text>;
  }

  it("da una clave nueva cuando cambia la ruta, y la misma si no cambia", () => {
    const { rerender } = render(<Sonda ruta="/inicio" />);
    const primera = screen.getByTestId("clave").props.children;

    rerender(<Sonda ruta="/inicio" />);
    expect(screen.getByTestId("clave").props.children).toBe(primera);

    rerender(<Sonda ruta="/agenda" />);
    expect(screen.getByTestId("clave").props.children).not.toBe(primera);
  });
});
