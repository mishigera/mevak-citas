import React from "react";
import { Text, View } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Motion } from "@/constants/motion";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { LaserBodyMap } from "@/components/LaserBodyMap";
import { setViewport, VIEWPORTS } from "../setup/screen-harness";
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
    { id: "5", name: "Glúteos", svgKey: "gluteos", bodySide: "back" as const },
  ];

  afterEach(() => setViewport(VIEWPORTS.movil));

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

  it("cuenta las áreas marcadas, en singular y en plural", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["axila"]} />);
    expect(screen.getByText("1 área")).toBeTruthy();

    screen.rerender(<LaserBodyMap areas={areas} selectedSvgKeys={["axila", "bigote"]} />);
    expect(screen.getByText("2 áreas")).toBeTruthy();
  });

  it("ignora claves seleccionadas que no están en el catálogo", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["axila", "clave-fantasma"]} />);
    expect(screen.getByText("1 área")).toBeTruthy();
  });

  it("muestra la pista de uso en modo editable y la oculta en solo lectura", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);
    expect(screen.getByText("Toca una zona del dibujo o su nombre para marcarla.")).toBeTruthy();

    screen.rerender(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} readOnly />);
    expect(screen.queryByText("Toca una zona del dibujo o su nombre para marcarla.")).toBeNull();
  });

  describe("en el teléfono", () => {
    it("enseña una vista a la vez, con las fichas de esa vista", () => {
      render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);

      expect(screen.getByTestId("figura-frente")).toBeTruthy();
      expect(screen.queryByTestId("figura-cara")).toBeNull();
      expect(screen.getByLabelText("Abdomen")).toBeTruthy();
      expect(screen.queryByLabelText("Bigote")).toBeNull();
    });

    it("el segmentado cambia de vista y dice cuántas hay marcadas en cada una", () => {
      render(<LaserBodyMap areas={areas} selectedSvgKeys={["axila", "gluteos"]} onToggleArea={jest.fn()} />);

      // La axila sale por delante y por detrás.
      expect(screen.getByLabelText("Frente (1)")).toBeTruthy();
      expect(screen.getByLabelText("Espalda (2)")).toBeTruthy();
      expect(screen.getByLabelText("Cara")).toBeTruthy();

      fireEvent.press(screen.getByLabelText("Cara"));

      expect(screen.getByTestId("figura-cara")).toBeTruthy();
      expect(screen.getByLabelText("Bigote")).toBeTruthy();
    });

    it("se abre en la vista de la primera área marcada", () => {
      render(<LaserBodyMap areas={areas} selectedSvgKeys={["bigote"]} readOnly />);
      expect(screen.getByTestId("figura-cara")).toBeTruthy();
    });
  });

  it("desde tableta enseña las tres vistas a la vez, sin segmentado", () => {
    setViewport(VIEWPORTS.ipadVertical);
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);

    expect(screen.getByTestId("figura-frente")).toBeTruthy();
    expect(screen.getByTestId("figura-espalda")).toBeTruthy();
    expect(screen.getByTestId("figura-cara")).toBeTruthy();
    expect(screen.queryByTestId("vistas-mapa")).toBeNull();
  });

  it("tocar una ficha avisa con el svgKey de su área", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    fireEvent.press(screen.getByLabelText("Abdomen"));

    expect(onToggleArea).toHaveBeenCalledWith("abdomen");
  });

  it("tocar una zona del dibujo hace lo mismo que su ficha", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    fireEvent.press(screen.getAllByTestId("zona-abdomen")[0]);

    expect(onToggleArea).toHaveBeenCalledWith("abdomen");
  });

  it("una zona que sale a los dos lados avisa con la misma clave desde cualquiera", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    const axilas = screen.getAllByTestId("zona-axila");
    expect(axilas).toHaveLength(2);
    axilas.forEach((z) => fireEvent.press(z));

    expect(onToggleArea.mock.calls).toEqual([["axila"], ["axila"]]);
  });

  it("en solo lectura no hay nada que tocar y las marcadas salen en el orden en que llegan", () => {
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["bigote", "axila"]} onToggleArea={onToggleArea} readOnly />);

    expect(screen.queryByLabelText("Axila")).toBeNull(); // no hay fichas pulsables
    const nombres = screen.getAllByText(/^(Bigote|Axila)$/).map((n) => n.props.children);
    expect(nombres).toEqual(["Bigote", "Axila"]);
    screen.getAllByTestId("zona-bigote").forEach((z) => expect(z.props.onPress).toBeUndefined());
  });

  it("sin onToggleArea tampoco hay zonas pulsables", () => {
    render(<LaserBodyMap areas={areas} selectedSvgKeys={[]} />);
    screen.getAllByTestId("zona-abdomen").forEach((z) => expect(z.props.onPress).toBeUndefined());
  });

  it("no dibuja las zonas que no están en el catálogo", () => {
    render(<LaserBodyMap areas={[areas[0]]} selectedSvgKeys={[]} onToggleArea={jest.fn()} />);

    expect(screen.getAllByTestId("zona-axila").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("zona-abdomen")).toHaveLength(0);
  });

  it("una zona marcada se pinta distinta que una sin marcar", () => {
    // El `fill` llega procesado por react-native-svg: se comparan entre sí, no con cadenas.
    const relleno = (clave: string) => screen.getAllByTestId(`zona-${clave}`)[0].props.fill;
    render(<LaserBodyMap areas={areas} selectedSvgKeys={["abdomen"]} onToggleArea={jest.fn()} />);
    const marcada = relleno("abdomen");

    expect(relleno("axila")).not.toEqual(marcada);

    screen.rerender(<LaserBodyMap areas={areas} selectedSvgKeys={["abdomen", "axila"]} onToggleArea={jest.fn()} />);
    expect(relleno("axila")).toEqual(marcada);
  });

  it("un área que el dibujo no conoce sigue teniendo su ficha", () => {
    const conNueva = [...areas, { id: "9", name: "Hombros", svgKey: "hombros" }];
    const onToggleArea = jest.fn();
    render(<LaserBodyMap areas={conNueva} selectedSvgKeys={[]} onToggleArea={onToggleArea} />);

    fireEvent.press(screen.getByLabelText("Hombros"));

    expect(onToggleArea).toHaveBeenCalledWith("hombros");
  });

  it("aguanta un catálogo vacío", () => {
    render(<LaserBodyMap areas={[]} selectedSvgKeys={[]} />);
    expect(screen.getByText("Sin áreas seleccionadas")).toBeTruthy();
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
