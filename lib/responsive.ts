/**
 * El único sitio del que sale el ancho de la ventana.
 *
 * Ninguna pantalla debe llamar a `useWindowDimensions` por su cuenta: si el ancho se lee
 * en un solo lugar, los tests pueden fijarlo (`setViewport` del harness) y el layout de
 * celular sigue siendo comprobable aunque Jest arranque con una ventana de tablet.
 */
import { useWindowDimensions } from "react-native";

/**
 * `compact` es el celular; `medium`, el iPad en vertical; `expanded`, el iPad apaisado.
 * Los cortes están en píxeles CSS, que es lo que Safari reporta.
 */
export type Breakpoint = "compact" | "medium" | "expanded";

export const BREAKPOINTS = { medium: 700, expanded: 1024 } as const;

export type Layout = {
  width: number;
  height: number;
  bp: Breakpoint;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  /** Tope de ancho de la columna de contenido. Es lo que evita la píldora de 1000 px. */
  contentMaxWidth: number;
  /** Margen lateral del contenido. */
  gutter: number;
  /** En `expanded` la navegación es un riel a la izquierda y el contenido se aparta. */
  hasSideRail: boolean;
};

/** La parte pura, para poder probarla y para que el mock de los tests la reutilice. */
export function layoutFor(width: number, height: number): Layout {
  const bp: Breakpoint =
    width >= BREAKPOINTS.expanded ? "expanded" : width >= BREAKPOINTS.medium ? "medium" : "compact";

  const contentMaxWidth = bp === "expanded" ? 860 : bp === "medium" ? 720 : 0;
  const gutter = bp === "expanded" ? 32 : bp === "medium" ? 24 : 16;

  return {
    width,
    height,
    bp,
    isCompact: bp === "compact",
    isMedium: bp === "medium",
    isExpanded: bp === "expanded",
    contentMaxWidth,
    gutter,
    hasSideRail: bp === "expanded",
  };
}

export function useBreakpoint(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
