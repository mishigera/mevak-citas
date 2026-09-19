/**
 * El fondo sobre el que se apoya todo el vidrio.
 *
 * Existe por una razón concreta: hasta ahora `background`, `surface` y `surface2` eran
 * los tres `#FFFFFF`, y un panel translúcido sobre blanco es indistinguible de un panel
 * blanco. El vidrio necesita algo detrás que refractar.
 *
 * Se monta una sola vez, en `app/_layout.tsx`, por debajo de toda la navegación.
 * Va en SVG y no con `expo-linear-gradient` porque las manchas tienen que ser radiales
 * y desvanecerse; un degradado lineal deja bordes que se notan.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { Colors } from "@/constants/colors";
import { AmbientOpacity } from "@/constants/theme";
import { useBreakpoint } from "@/lib/responsive";

export function AmbientBackground() {
  const { width, height, isCompact } = useBreakpoint();

  // En pantalla ancha las manchas se separan mas, para que no se junten en el centro.
  const escala = isCompact ? 1 : 0.78;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="ambient-background">
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="ambient-base" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.ambient.top} />
            <Stop offset="0.55" stopColor={Colors.ambient.mid} />
            <Stop offset="1" stopColor={Colors.ambient.bottom} />
          </SvgLinearGradient>

          <RadialGradient id="ambient-blob-a" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.ambient.blobPrimary} stopOpacity={AmbientOpacity.primary} />
            <Stop offset="1" stopColor={Colors.ambient.blobPrimary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambient-blob-b" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.ambient.blobSecondary} stopOpacity={AmbientOpacity.secondary} />
            <Stop offset="1" stopColor={Colors.ambient.blobSecondary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambient-blob-c" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.ambient.blobAccent} stopOpacity={AmbientOpacity.accent} />
            <Stop offset="1" stopColor={Colors.ambient.blobAccent} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#ambient-base)" />

        {/* Arriba a la derecha: el rosa de marca, detras del header. */}
        <Ellipse
          cx={width * 0.88}
          cy={height * 0.08}
          rx={width * 0.72 * escala}
          ry={height * 0.26 * escala}
          fill="url(#ambient-blob-a)"
        />
        {/* Abajo a la izquierda: el morado, detras de la barra de pestañas. */}
        <Ellipse
          cx={width * 0.1}
          cy={height * 0.92}
          rx={width * 0.8 * escala}
          ry={height * 0.28 * escala}
          fill="url(#ambient-blob-b)"
        />
        {/* A media altura: el durazno, para que el centro no quede plano. */}
        <Ellipse
          cx={width * 0.05}
          cy={height * 0.42}
          rx={width * 0.55 * escala}
          ry={height * 0.2 * escala}
          fill="url(#ambient-blob-c)"
        />
      </Svg>
    </View>
  );
}

export default AmbientBackground;
