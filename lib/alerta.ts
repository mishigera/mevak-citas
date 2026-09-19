/**
 * Avisos y confirmaciones de toda la app. Misma firma que `Alert.alert`.
 *
 * `Alert.alert` no sirve en web: react-native-web lo deja vacío (`static alert() {}`),
 * no sale nada y los `onPress` de los botones no se llaman nunca. "Cerrar sesión" o
 * "Eliminar bloqueo" se quedaban sin hacer nada, sin error (deuda §36, plan p007).
 *
 * Por orden:
 * 1. Si está montado el diálogo de vidrio (`components/DialogoAlerta`, en `_layout`), se
 *    usa ese, en web y en nativo: los avisos se ven como el resto de la app.
 * 2. Si no (tests de pantalla, arranque), en nativo `Alert.alert`, con los mismos
 *    argumentos que llegaron.
 * 3. En web, los diálogos del navegador, que solo tienen dos salidas: con un botón o
 *    ninguno, `alert()` y después el `onPress` de ese botón; con varios, `confirm()`,
 *    que acepta con el último botón que no es `cancel` y cancela con el que lo es.
 *
 * Los tests de pantalla no montan el diálogo y corren como iOS: les llega el camino 2 y
 * pueden seguir espiando `Alert.alert`.
 */
import { Alert, Platform, type AlertButton } from "react-native";

export type Aviso = {
  titulo: string;
  mensaje?: string;
  /** Nunca vacío: un aviso sin botones lleva un "Aceptar". */
  botones: AlertButton[];
};

type Mostrar = (aviso: Aviso) => void;

let mostrarEnDialogo: Mostrar | null = null;

/** La llama el diálogo al montarse. Devuelve con qué desconectarlo al desmontarse. */
export function conectarDialogo(mostrar: Mostrar): () => void {
  mostrarEnDialogo = mostrar;
  return () => {
    if (mostrarEnDialogo === mostrar) mostrarEnDialogo = null;
  };
}

export function alerta(titulo: string, mensaje?: string, botones?: AlertButton[]): void {
  if (mostrarEnDialogo) {
    mostrarEnDialogo({ titulo, mensaje, botones: botones?.length ? botones : [{ text: "Aceptar" }] });
    return;
  }

  if (Platform.OS !== "web") {
    if (botones) Alert.alert(titulo, mensaje, botones);
    else if (mensaje !== undefined) Alert.alert(titulo, mensaje);
    else Alert.alert(titulo);
    return;
  }

  const texto = mensaje ? `${titulo}\n\n${mensaje}` : titulo;

  if (!botones || botones.length <= 1) {
    globalThis.alert(texto);
    botones?.[0]?.onPress?.();
    return;
  }

  const aceptar = [...botones].reverse().find((b) => b.style !== "cancel");
  const cancelar = botones.find((b) => b.style === "cancel");
  if (globalThis.confirm(texto)) aceptar?.onPress?.();
  else cancelar?.onPress?.();
}
