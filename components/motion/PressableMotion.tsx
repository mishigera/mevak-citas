/**
 * La capa de microinteracción: lo que pasa cuando el dedo o el ratón tocan algo.
 *
 * Sustituye al `opacity: 0.75` seco que repetían las primitivas de vidrio. Tres gestos,
 * y cada elemento elige el suyo:
 *
 *  - `elevar`  — tarjetas: en hover suben 3 px y crece la sombra; al pulsar bajan a 1 px.
 *  - `escala`  — botones redondos: en hover crecen un 6%; al pulsar se encogen al 92%.
 *  - `sutil`   — filas de lista y chips: apenas un 98,5% al pulsar.
 *
 * En web son transiciones de CSS (el hover no existe en nativo y el navegador las
 * ejecuta en el compositor). En nativo es un resorte de `Animated` al pulsar.
 *
 * El hover **solo funciona si la entrada terminó con `backwards`**: con `both` el
 * fotograma final se queda pegado y pisa este `transform`. Ver `components/motion/index.tsx`.
 */
import React, { useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Colors } from "@/constants/colors";
import { Curva, Motion, ResorteCorto } from "@/constants/motion";
import { animacionesEnVivo, estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";

export type Gesto = "elevar" | "escala" | "sutil";

export type PressableMotionProps = {
  children?: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  gesto?: Gesto;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityRole?: "button" | "link" | "tab";
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; expanded?: boolean };
  accessibilityHasPopup?: boolean;
  /** El valor actual del control, aparte de su etiqueta (un selector de fecha, p. ej.). */
  accessibilityValue?: { text?: string; now?: number; min?: number; max?: number };
  testID?: string;
};

const ESCALA_PULSADO: Record<Gesto, number> = {
  elevar: 0.99,
  escala: 0.92,
  sutil: 0.985,
};

const web = StyleSheet.create({
  base: estiloWeb({
    transitionProperty: "transform, box-shadow, background-color, border-color, opacity",
    transitionDuration: ms(Motion.micro),
    transitionTimingFunction: Curva.suave,
  }),
  elevarHover: estiloWeb({
    transform: [{ translateY: -3 }],
    boxShadow: `0 10px 24px ${Colors.glass.shadowCssStrong}`,
  }),
  elevarPulsado: estiloWeb({ transform: [{ translateY: -1 }] }),
  escalaHover: estiloWeb({
    transform: [{ translateY: -1 }, { scale: 1.06 }],
    boxShadow: `0 8px 20px ${Colors.glass.shadowCssStrong}`,
  }),
  escalaPulsado: estiloWeb({ transform: [{ scale: 0.92 }], transitionDuration: ms(120) }),
  sutilHover: estiloWeb({ transform: [{ translateY: -2 }] }),
  sutilPulsado: estiloWeb({ transform: [{ scale: 0.985 }], transitionDuration: ms(100) }),
  enfocado: estiloWeb({
    outlineColor: Colors.primary,
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineOffset: 3,
  }),
});

const hover: Record<Gesto, ViewStyle> = {
  elevar: web.elevarHover,
  escala: web.escalaHover,
  sutil: web.sutilHover,
};

const pulsado: Record<Gesto, ViewStyle> = {
  elevar: web.elevarPulsado,
  escala: web.escalaPulsado,
  sutil: web.sutilPulsado,
};

export function PressableMotion({
  children,
  onPress,
  onLongPress,
  gesto = "elevar",
  disabled,
  style,
  hitSlop,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityState,
  accessibilityHasPopup,
  accessibilityValue,
  testID,
}: PressableMotionProps) {
  const { movimientoReducido } = useMotionPreferences();
  const escala = useRef(new Animated.Value(1)).current;

  const resortear = useCallback(
    (a: number) => {
      if (usaCSS || movimientoReducido) return;
      if (!animacionesEnVivo) {
        escala.setValue(a);
        return;
      }
      Animated.spring(escala, { toValue: a, ...ResorteCorto }).start();
    },
    [escala, movimientoReducido],
  );

  const onPressIn = useCallback(() => resortear(ESCALA_PULSADO[gesto]), [resortear, gesto]);
  const onPressOut = useCallback(() => resortear(1), [resortear]);

  const comun = {
    onPress,
    onLongPress,
    disabled,
    hitSlop,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    accessibilityValue,
    "aria-haspopup": accessibilityHasPopup,
    testID,
  } as const;

  if (movimientoReducido) {
    return (
      <Pressable {...comun} style={style}>
        {children}
      </Pressable>
    );
  }

  if (usaCSS) {
    return (
      <Pressable
        {...comun}
        style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
          web.base,
          style,
          hovered && !disabled && hover[gesto],
          pressed && !disabled && pulsado[gesto],
          focused && web.enfocado,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable {...comun} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale: escala }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export default PressableMotion;
