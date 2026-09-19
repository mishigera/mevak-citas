/**
 * La base de todo el vidrio de la app.
 *
 * Son tres capas superpuestas, y el orden importa:
 *   1. `BlurView`  — solo desenfoca lo que hay detrás. En web emite
 *      `backdrop-filter` con el prefijo -webkit-, que es lo que pide Safari.
 *   2. relleno     — translúcido, nunca opaco: es lo que tiñe el vidrio.
 *   3. filo        — borde claro de 1 px, el reflejo que lo hace leerse como vidrio.
 *
 * El relleno va en su propia capa y no en el `style` del `BlurView` a propósito: en
 * web el `BlurView` pisa el `backgroundColor` que reciba por style con el suyo.
 *
 * OJO con el orden de pintado. Las tres capas son `position: absolute`, y en CSS un
 * elemento posicionado se pinta POR ENCIMA del contenido en flujo normal, aunque vaya
 * antes en el DOM. react-native-web deja los `<input>` en `position: static` (a los
 * `Text` si les pone `relative`), así que sin contramedida el texto de un TextInput
 * queda debajo del desenfoque y se lee como un borrón gris.
 * Solución: el contenedor crea contexto de apilado (`zIndex: 0`) y las capas van a
 * `zIndex: -1`, es decir por encima del fondo del contenedor pero por debajo de
 * cualquier hijo. Así no hace falta envolver los hijos ni tocar cada pantalla.
 *
 * ## Cuándo deja de ser vidrio
 *
 * Dos casos, y en los dos la superficie pasa a ser opaca:
 *  - el navegador no tiene `backdrop-filter` (Safari en ahorro de energía, motores viejos);
 *  - el usuario pidió **menos transparencia** en el sistema.
 *
 * No es un adorno que se apaga: sin desenfoque, un relleno al 55% sobre una foto deja el
 * texto ilegible. La alternativa correcta es una superficie sólida, no menos efecto.
 */
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { Colors } from "@/constants/colors";
import { Blur, GlassShadow, GlassShadowSoft, Radius } from "@/constants/theme";
import { Curva, Motion } from "@/constants/motion";
import { estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";

/** `pink` es el estado activo/seleccionado; `strong` se reserva al chrome, donde el texto tiene que leerse si o si. */
export type GlassTone = "neutral" | "soft" | "strong" | "pink" | "pinkStrong";

export type GlassSurfaceProps = {
  tone?: GlassTone;
  intensity?: number;
  radius?: number;
  /** El filo claro del borde. Se puede quitar cuando la superficie va pegada a otra. */
  bordered?: boolean;
  elevation?: "none" | "soft" | "lifted";
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
};

const FILLS: Record<GlassTone, string> = {
  neutral: Colors.glass.fill,
  soft: Colors.glass.fillSoft,
  strong: Colors.glass.fillStrong,
  pink: Colors.glass.fillPink,
  pinkStrong: Colors.glass.fillPinkStrong,
};

/** Los mismos tonos cuando no hay vidrio posible. */
const FILLS_SOLIDOS: Record<GlassTone, string> = {
  neutral: Colors.glass.fillSolid,
  soft: Colors.glass.fillSolid,
  strong: Colors.glass.fillSolidStrong,
  pink: Colors.glass.fillPinkSolid,
  pinkStrong: Colors.glass.fillPinkSolidStrong,
};

function strokeFor(tone: GlassTone) {
  return tone === "pink" || tone === "pinkStrong" ? Colors.glass.strokeSoft : Colors.glass.stroke;
}

/**
 * Que el cambio de relleno (seleccionado ↔ no seleccionado) no sea un salto seco.
 * Va en el contenedor, que no lleva desenfoque: animar la opacidad de una capa con
 * `backdrop-filter` la convertiría en *backdrop root* y apagaría el efecto.
 */
const web = StyleSheet.create({
  transicion: estiloWeb({
    transitionProperty: "background-color, border-color, box-shadow",
    transitionDuration: ms(Motion.microLarga),
    transitionTimingFunction: Curva.suave,
  }),
});

export function GlassSurface({
  tone = "neutral",
  intensity = Blur.card,
  radius = Radius.card,
  bordered = true,
  elevation = "soft",
  style,
  children,
  testID,
}: GlassSurfaceProps) {
  const { hayDesenfoque, transparenciaReducida } = useMotionPreferences();
  const sombra = elevation === "lifted" ? GlassShadow : elevation === "soft" ? GlassShadowSoft : null;
  const esVidrio = hayDesenfoque && !transparenciaReducida;

  return (
    <View
      testID={testID}
      style={[{ borderRadius: radius, zIndex: 0 }, sombra, usaCSS && web.transicion, style]}
    >
      {esVidrio && (
        <BlurView
          intensity={intensity}
          tint="default"
          style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden", zIndex: -1 }]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: esVidrio ? FILLS[tone] : FILLS_SOLIDOS[tone],
            zIndex: -1,
          },
        ]}
      />
      {bordered && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, borderWidth: 1, borderColor: strokeFor(tone), zIndex: -1 },
          ]}
        />
      )}
      {children}
    </View>
  );
}

export default GlassSurface;
