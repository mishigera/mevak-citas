/**
 * Los tiempos y las curvas del movimiento. Igual que `theme.ts` guarda lo que no es
 * color, esto guarda lo que no es forma: cuánto dura algo, con qué curva y cuánto
 * espera antes de empezar.
 *
 * Los valores vienen del sistema de la plataforma Parev y se respetan tal cual. No se
 * inventan duraciones por pantalla: si algo necesita otro ritmo, se añade un token aquí.
 *
 * En web estas constantes se sirven como CSS (`animationDuration`, `transitionProperty`…)
 * y en nativo alimentan a `Animated`. Por eso cada curva existe dos veces: como cadena
 * de CSS y como `Easing` de React Native.
 */
import { Easing } from "react-native";

export const Motion = {
  /** Entrada normal: lo que sube y aparece. */
  duracion: 420,
  /** Fundido: solo opacidad. Más corto porque no hay recorrido que leer. */
  duracionCorta: 320,
  /** Modales y paneles pequeños que crecen desde el 96%. */
  pop: 260,
  /** Paso del escalonado entre hermanos. */
  paso: 60,
  /**
   * A partir del 11.º hermano todos entran juntos. Escalonar una lista larga se
   * SIENTE lento: para cuando llega el elemento 20 ya han pasado 1,2 s.
   */
  maxEscalonados: 10,
  /** Cuánto sube lo que entra. */
  desplazamiento: 12,
  /** Hover, active y foco. Tienen que responder, no lucirse. */
  micro: 160,
  /** Cambios de color o de fondo, que se agradecen más lentos. */
  microLarga: 220,
  /** El panel que nace de un botón: abrir con resorte, cerrar sin él. */
  panelAbrir: 620,
  panelCerrar: 340,
  /** Barrido del esqueleto de carga. */
  esqueleto: 1300,
  /** Vaivén del icono en un estado vacío. */
  flotar: 3200,
} as const;

/** Curvas como cadena de CSS (web). */
export const Curva = {
  /** Salida suave, sin rebote. La de casi todo. */
  suave: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  /** Entrada y salida simétricas: para cerrar, donde el rebote sobra. */
  simetrica: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Respaldo del resorte para navegadores sin `linear()`. */
  resorteBezier: "cubic-bezier(0.32, 1.25, 0.46, 1)",
  /**
   * El resorte de verdad: rebote de ~5%. Más que eso se siente de juguete.
   * Solo lo entienden los navegadores con `linear()`; `soportaLinear()` decide.
   */
  resorteLinear:
    "linear(0, 0.063 2.8%, 0.24 5.9%, 0.492 9.9%, 0.74 14.5%, 0.915 19.3%," +
    " 1.017 24.4%, 1.052 29%, 1.055 33.1%, 1.037 38.4%, 1.012 45.4%, 0.998 53.5%," +
    " 0.996 62.9%, 1)",
} as const;

/** Las mismas curvas para `Animated` (nativo). */
export const EasingNativo = {
  suave: Easing.bezier(0.22, 0.61, 0.36, 1),
  simetrica: Easing.bezier(0.4, 0, 0.2, 1),
  resorte: Easing.bezier(0.32, 1.25, 0.46, 1),
  lineal: Easing.linear,
} as const;

/**
 * Resorte de `Animated.spring` calibrado al mismo ~5% de sobrepaso que la curva
 * `linear()` de arriba: con masa 1 y rigidez 180, el amortiguamiento crítico es
 * 2·√180 ≈ 26,8; a 19 el factor es 0,71 y el sobrepaso sale del 4,6%.
 */
export const ResorteNativo = {
  damping: 19,
  stiffness: 180,
  mass: 1,
  useNativeDriver: true,
} as const;

/** Resorte más apretado para lo pequeño (botones al pulsarse). */
export const ResorteCorto = {
  damping: 22,
  stiffness: 320,
  mass: 1,
  useNativeDriver: true,
} as const;

/**
 * El retraso que le toca al hermano número `indice` (empezando en 0).
 * Del 11.º en adelante todos comparten el mismo, como en la hoja de referencia
 * (`.pv-stagger > *:nth-child(n+11)`).
 */
export function retrasoEscalonado(indice: number): number {
  return Math.min(indice + 1, Motion.maxEscalonados + 1) * Motion.paso;
}
