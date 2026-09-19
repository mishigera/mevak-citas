/**
 * Pinta a sus hijos en `document.body`, fuera del árbol de la pantalla.
 *
 * Hace falta por una particularidad de react-native-web: **toda `View` lleva
 * `z-index: 0`** (`react-native-web/dist/exports/View/index.js`), así que cada una crea su
 * propio contexto de apilado. Un panel desplegable dentro de un campo de formulario no
 * puede ponerse por encima de los campos que vienen después, por mucho `zIndex` que
 * lleve: el número solo compite dentro de su campo. Fuera del árbol no hay nada que lo
 * encierre.
 *
 * Los contextos de React (auth, TanStack Query) cruzan el portal sin hacer nada.
 */
import React from "react";
import { createPortal } from "react-dom";

export function Portal({ children }: { children?: React.ReactNode }) {
  const body = (globalThis as { document?: Document }).document?.body;
  if (!body) return <>{children}</>;
  return createPortal(children, body);
}
