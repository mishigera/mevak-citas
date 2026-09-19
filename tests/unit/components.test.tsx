import React from "react";
import { Text, View } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Rect, Ellipse } from "react-native-svg";
import { Motion } from "@/constants/motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { LaserBodyMap } from "@/components/LaserBodyMap";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

// Silencia el ruido que React escupe al capturar un error de render.
let errorSpy: jest.SpyInstance;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

describe("ErrorBoundary", () => {
  const Explota = ({ mensaje = "Boom" }: { mensaje?: string }) => {
    throw new Error(mensaje);
  };
  const Bien = () => <Text>Todo en orden</Text>;

  it("muestra a los hijos cuando no hay error", () => {
    render(
      <ErrorBoundary>
        <Bien />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Todo en orden")).toBeTruthy();
  });

  it("captura el error y pinta el fallback en lugar de tumbar la app", () => {
    const Fallback = ({ error }: { error: Error }) => <Text>Falló: {error.message}</Text>;

    render(
      <ErrorBoundary FallbackComponent={Fallback}>
        <Explota mensaje="Se rompió la agenda" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Se rompió la agenda/)).toBeTruthy();
  });

  it("avisa por onError con el error y el stack del componente", () => {
    const onError = jest.fn();
    const Fallback = () => <Text>fallback</Text>;

    render(
      <ErrorBoundary FallbackComponent={Fallback} onError={onError}>
        <Explota mensaje="Con aviso" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("Con aviso");
    expect(typeof onError.mock.calls[0][1]).toBe("string");
  });

  it("no exige onError", () => {
    const Fallback = () => <Text>fallback</Text>;

    expect(() =>
      render(
        <ErrorBoundary FallbackComponent={Fallback}>
          <Explota />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it("resetError vuelve a intentar el render", () => {
    let debeFallar = true;
    const Inestable = () => {
      if (debeFallar) throw new Error("todavía no");
      return <Text>Ya funciona</Text>;
    };
    const Fallback = ({ resetError }: { resetError: () => void }) => (
      <Text onPress={resetError}>Reintentar</Text>
    );

    render(
      <ErrorBoundary FallbackComponent={Fallback}>
        <Inestable />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Reintentar")).toBeTruthy();

    debeFallar = false;
    fireEvent.press(screen.getByText("Reintentar"));

    expect(screen.getByText("Ya funciona")).toBeTruthy();
  });

  it("usa ErrorFallback si no se le pasa otro", () => {
    render(
      <ErrorBoundary>
        <Explota mensaje="Sin fallback propio" />
      </ErrorBoundary>,
    );

    // ErrorFallback muestra su propio título, no el mensaje crudo.
    expect(screen.queryByText("Todo en orden")).toBeNull();
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe("ErrorFallback", () => {
  const error = Object.assign(new Error("Falló la petición"), {
    stack: "Error: Falló la petición\n    at algo.tsx:1:1",
  });

  it("habla español y no enseña el mensaje crudo del error", () => {
    render(<ErrorFallback error={error} resetError={jest.fn()} />);

    expect(screen.getByText("Algo se ha roto")).toBeTruthy();
    // El mensaje técnico vive en el panel de detalle, no en la pantalla.
    expect(screen.queryByText(/Falló la petición/)).toBeNull();
  });

  it("ofrece volver a cargar la app", async () => {
    const { reloadAppAsync } = jest.requireMock("expo");
    render(<ErrorFallback error={error} resetError={jest.fn()} />);

    fireEvent.press(screen.getByText("Volver a cargar"));

    await waitFor(() => expect(reloadAppAsync).toHaveBeenCalled());
  });

  it("si ni recargar funciona, al menos reintenta el render", async () => {
    const { reloadAppAsync } = jest.requireMock("expo");
    reloadAppAsync.mockRejectedValueOnce(new Error("no se pudo"));
    const resetError = jest.fn();

    render(<ErrorFallback error={error} resetError={resetError} />);
    fireEvent.press(screen.getByText("Volver a cargar"));

    await waitFor(() => expect(resetError).toHaveBeenCalled());
  });

  it("en desarrollo deja ver el detalle en un panel de vidrio, no en un modal", () => {
    render(<ErrorFallback error={error} resetError={jest.fn()} />);

    fireEvent.press(screen.getByLabelText("Ver detalle del error"));

    expect(screen.getByTestId("panel-error")).toBeTruthy();
    expect(screen.getByText(/Falló la petición/)).toBeTruthy();
    expect(screen.getByText(/algo\.tsx/)).toBeTruthy();
  });

  it("el detalle se puede cerrar", () => {
    // Relojes falsos: el panel tarda `Motion.panelCerrar` en desmontarse y con relojes
    // de verdad esa espera es intermitente bajo carga. Ver `popover.test.tsx`.
    jest.useFakeTimers();
    try {
      render(<ErrorFallback error={error} resetError={jest.fn()} />);

      fireEvent.press(screen.getByLabelText("Ver detalle del error"));
      act(() => jest.advanceTimersByTime(32));

      fireEvent.press(screen.getByLabelText("Cerrar"));
      act(() => jest.advanceTimersByTime(Motion.panelCerrar + 32));

      expect(screen.queryByTestId("panel-error")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("aguanta un error sin stack: enseña el mensaje y nada más", () => {
    const pelado = new Error("Sin stack");
    pelado.stack = undefined;

    render(<ErrorFallback error={pelado} resetError={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("Ver detalle del error"));

    expect(screen.getByText("Sin stack")).toBeTruthy();
  });

  it("se monta aunque no haya router del que leer la ruta", () => {
    const { usePathname } = jest.requireMock("expo-router");
    usePathname.mockImplementationOnce(() => {
      throw new Error("fuera del contexto del router");
    });

    expect(() => render(<ErrorFallback error={error} resetError={jest.fn()} />)).not.toThrow();
    expect(screen.getByText("Algo se ha roto")).toBeTruthy();
  });
});

describe("KeyboardAwareScrollViewCompat", () => {
  it("pinta a sus hijos", () => {
    render(
      <KeyboardAwareScrollViewCompat>
        <Text>contenido</Text>
      </KeyboardAwareScrollViewCompat>,
    );

    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it("deja pasar props al scroll", () => {
    render(
      <KeyboardAwareScrollViewCompat testID="scroll">
        <Text>contenido</Text>
      </KeyboardAwareScrollViewCompat>,
    );

    expect(screen.getByTestId("scroll")).toBeTruthy();
  });
});

describe("LaserBodyMap", () => {
  const areas = [
    { id: "1", name: "Axila", svgKey: "axila", bodySide: "both" as const },
    { id: "2", name: "Brazos", svgKey: "brazos", bodySide: "both" as const },
    { id: "3", name: "Bigote", svgKey: "bigote", bodySide: "front" as const },
    { id: "4", name: "Abdomen", svgKey: "abdomen", bodySide: "front" as const },
  ];

  const zonas = () => [
    ...screen.UNSAFE_queryAllByType(Rect),
    ...screen.UNSAFE_queryAllByType(Ellipse),
  ];

  it("usa el título por defecto", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} />);
    expect(screen.getByText("Monito de áreas")).toBeTruthy();
  });

  it("acepta un título propio", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} title="Zonas contratadas" />);
    expect(screen.getByText("Zonas contratadas")).toBeTruthy();
  });

  it("sin selección lo dice explícitamente", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} />);
    expect(screen.getByText("Sin áreas seleccionadas")).toBeTruthy();
  });

  it("lista los nombres de las áreas seleccionadas", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["axila", "bigote"]} />);
    expect(screen.getByText("Seleccionadas: Axila, Bigote")).toBeTruthy();
  });

  it("respeta el orden en que llegan las claves seleccionadas", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["bigote", "axila"]} />);
    expect(screen.getByText("Seleccionadas: Bigote, Axila")).toBeTruthy();
  });

  it("ignora claves seleccionadas que no están en el catálogo", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["axila", "clave-fantasma"]} />);
    expect(screen.getByText("Seleccionadas: Axila")).toBeTruthy();
  });

  it("muestra la pista de uso en modo editable", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);
    expect(screen.getByText("Toca un área para seleccionar o quitar.")).toBeTruthy();
  });

  it("oculta la pista en modo solo lectura", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} readOnly />);
    expect(screen.queryByText("Toca un área para seleccionar o quitar.")).toBeNull();
  });

  it("avisa con el svgKey al tocar una zona disponible", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    const pulsables = zonas().filter((z) => typeof z.props.onPress === "function");
    expect(pulsables.length).toBeGreaterThan(0);
    fireEvent.press(pulsables[0]);

    expect(onToggleArea).toHaveBeenCalledTimes(1);
    expect(areas.map((a) => a.svgKey)).toContain(onToggleArea.mock.calls[0][0]);
  });

  it("en modo solo lectura ninguna zona es pulsable", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} readOnly />);

    expect(zonas().filter((z) => typeof z.props.onPress === "function")).toHaveLength(0);
  });

  it("sin onToggleArea tampoco hay zonas pulsables", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} />);

    expect(zonas().filter((z) => typeof z.props.onPress === "function")).toHaveLength(0);
  });

  it("las zonas que no están en el catálogo del cliente quedan deshabilitadas", () => {
    const onToggleArea = jest.fn();
    // Solo una área disponible: el resto de zonas del dibujo no deben responder.
    render(
      <LaserBodyMap
        areas={[areas[0]]}
        selectedSvgKeys={[]}
        onToggleArea={onToggleArea}
      />,
    );

    const pulsables = zonas().filter((z) => typeof z.props.onPress === "function");
    pulsables.forEach((z) => fireEvent.press(z));

    // Todas las pulsaciones posibles corresponden a la única área disponible.
    onToggleArea.mock.calls.forEach(([key]) => expect(key).toBe("axila"));
    expect(onToggleArea).toHaveBeenCalled();
  });

  it("una zona seleccionada se pinta distinta que una sin seleccionar", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);
    const sinSeleccion = zonas().map((z) => z.props.strokeWidth);

    screen.rerender(
      <LaserBodyMap areas={areas} selectedSvgKeys={["axila", "brazos", "abdomen", "bigote"]} onToggleArea={jest.fn()} />,
    );
    const conSeleccion = zonas().map((z) => z.props.strokeWidth);

    expect(conSeleccion).not.toEqual(sinSeleccion);
    expect(conSeleccion).toContain(2.2); // grosor de zona seleccionada
  });

  it("aguanta un catálogo vacío", () => {
    render(<LaserBodyMap areas={[]} selectedSvgKeys={[]} />);
    expect(screen.getByText("Sin áreas seleccionadas")).toBeTruthy();
  });

  it("el mismo svgKey en varias zonas del dibujo se resuelve igual", () => {
    // "axila" y "brazos" aparecen dos veces cada uno (izquierda y derecha).
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    const pulsables = zonas().filter((z) => typeof z.props.onPress === "function");
    pulsables.forEach((z) => fireEvent.press(z));

    const claves = new Set(onToggleArea.mock.calls.map(([k]) => k));
    claves.forEach((k) => expect(areas.map((a) => a.svgKey)).toContain(k));
  });
});

describe("ErrorBoundary + ErrorFallback juntos", () => {
  it("un fallo dentro de un árbol real no se propaga hacia arriba", () => {
    const Hijo = () => {
      throw new Error("fallo profundo");
    };
    const Fallback = () => <Text>Algo salió mal</Text>;

    render(
      <View>
        <ErrorBoundary FallbackComponent={Fallback}>
          <View>
            <Hijo />
          </View>
        </ErrorBoundary>
        <Text>El resto sigue vivo</Text>
      </View>,
    );

    expect(screen.getByText("Algo salió mal")).toBeTruthy();
    expect(screen.getByText("El resto sigue vivo")).toBeTruthy();
  });
});
