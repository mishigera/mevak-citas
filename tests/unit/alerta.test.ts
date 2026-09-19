/**
 * `alerta()` en sus tres caminos: el diálogo de vidrio si está montado, `Alert.alert` en
 * nativo y los diálogos del navegador en web.
 *
 * Los dos últimos son el respaldo, y el de web es el que ningún test de pantalla
 * ejercita, porque jest corre con `Platform.OS = "ios"`: se fuerza con
 * `jest.replaceProperty` y se sustituyen `alert`/`confirm` del navegador.
 */
import { Alert, Platform } from "react-native";
import { alerta, conectarDialogo } from "@/lib/alerta";

const confirmar = jest.fn();
const avisar = jest.fn();

beforeEach(() => {
  confirmar.mockReset();
  avisar.mockReset();
  (globalThis as { confirm?: unknown }).confirm = confirmar;
  (globalThis as { alert?: unknown }).alert = avisar;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { confirm?: unknown }).confirm;
  delete (globalThis as { alert?: unknown }).alert;
});

describe("en nativo", () => {
  it("delega en Alert.alert con los mismos argumentos", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const botones = [{ text: "Cancelar", style: "cancel" as const }, { text: "Sí" }];

    alerta("Título", "Mensaje", botones);

    expect(spy).toHaveBeenCalledWith("Título", "Mensaje", botones);
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe("en nativo, sin diálogo", () => {
  it("pasa solo los argumentos que llegaron, sin un `undefined` de más", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    alerta("Error", "No se pudo guardar");
    alerta("Solo título");

    expect(spy).toHaveBeenNthCalledWith(1, "Error", "No se pudo guardar");
    expect(spy.mock.calls[0]).toHaveLength(2);
    expect(spy.mock.calls[1]).toEqual(["Solo título"]);
  });
});

describe("con el diálogo de vidrio montado", () => {
  it("lo usa a él y no a Alert.alert ni al navegador, en cualquier plataforma", () => {
    const mostrar = jest.fn();
    const desconectar = conectarDialogo(mostrar);
    const spy = jest.spyOn(Alert, "alert");
    const botones = [{ text: "Cancelar", style: "cancel" as const }, { text: "Eliminar", style: "destructive" as const }];

    alerta("Eliminar bloqueo", "¿Seguro?", botones);
    jest.replaceProperty(Platform, "OS", "web");
    alerta("Otra vez", undefined, botones);

    expect(mostrar).toHaveBeenNthCalledWith(1, { titulo: "Eliminar bloqueo", mensaje: "¿Seguro?", botones });
    expect(mostrar).toHaveBeenNthCalledWith(2, { titulo: "Otra vez", mensaje: undefined, botones });
    expect(spy).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
    desconectar();
  });

  it("un aviso sin botones lleva un Aceptar", () => {
    const mostrar = jest.fn();
    const desconectar = conectarDialogo(mostrar);

    alerta("Servicio creado");

    expect(mostrar.mock.calls[0][0].botones).toEqual([{ text: "Aceptar" }]);
    desconectar();
  });

  it("al desmontarse vuelve el camino de siempre", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const mostrar = jest.fn();
    conectarDialogo(mostrar)();

    alerta("Error", "x");

    expect(mostrar).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith("Error", "x");
  });

  it("desconectar un diálogo viejo no desconecta al que lo sustituyó", () => {
    const viejo = jest.fn();
    const nuevo = jest.fn();
    const desconectarViejo = conectarDialogo(viejo);
    const desconectarNuevo = conectarDialogo(nuevo);

    desconectarViejo();
    alerta("Hola");

    expect(nuevo).toHaveBeenCalled();
    expect(viejo).not.toHaveBeenCalled();
    desconectarNuevo();
  });
});

describe("en web", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "web");
  });

  it("no usa Alert.alert, que en react-native-web no hace nada", () => {
    const spy = jest.spyOn(Alert, "alert");
    confirmar.mockReturnValue(false);

    alerta("Cerrar sesión", "¿Seguro?", [{ text: "Cancelar", style: "cancel" }, { text: "Salir" }]);

    expect(spy).not.toHaveBeenCalled();
    expect(confirmar).toHaveBeenCalledWith("Cerrar sesión\n\n¿Seguro?");
  });

  it("al aceptar llama al botón de acción, no al de cancelar", () => {
    const salir = jest.fn();
    const cancelar = jest.fn();
    confirmar.mockReturnValue(true);

    alerta("Cerrar sesión", "¿Seguro?", [
      { text: "Cancelar", style: "cancel", onPress: cancelar },
      { text: "Cerrar sesión", style: "destructive", onPress: salir },
    ]);

    expect(salir).toHaveBeenCalledTimes(1);
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("al cancelar llama al botón de cancelar y no hace la acción", () => {
    const salir = jest.fn();
    const cancelar = jest.fn();
    confirmar.mockReturnValue(false);

    alerta("Cerrar sesión", "¿Seguro?", [
      { text: "Cancelar", style: "cancel", onPress: cancelar },
      { text: "Cerrar sesión", style: "destructive", onPress: salir },
    ]);

    expect(salir).not.toHaveBeenCalled();
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it("sin botones es un aviso simple", () => {
    alerta("Error", "No se pudo guardar");

    expect(avisar).toHaveBeenCalledWith("Error\n\nNo se pudo guardar");
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("con un solo botón avisa y luego llama a su onPress", () => {
    const ok = jest.fn();

    alerta("Cliente generado", undefined, [{ text: "OK", onPress: ok }]);

    expect(avisar).toHaveBeenCalledWith("Cliente generado");
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
