/**
 * El esqueleto de carga: un barrido, nunca un pulso de opacidad.
 *
 * Dos razones para el barrido. La primera es que un pulso de opacidad sobre vidrio lo
 * convierte en *backdrop root* y apaga el desenfoque de lo que tenga detrás (la misma
 * trampa que documenta `components/motion/index.tsx`). La segunda es que el barrido
 * comunica dirección —"esto está llegando"— y el parpadeo solo comunica espera.
 *
 * Sustituye a los `<ActivityIndicator>` centrados: en lugar de una ruedita sobre una
 * pantalla vacía, se ve la forma de lo que va a aparecer.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";
import { Curva, EasingNativo, Motion } from "@/constants/motion";
import { animacionesEnVivo, estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";
import { Radius, Space } from "@/constants/theme";

const web = StyleSheet.create({
  barrido: estiloWeb({
    backgroundColor: Colors.glass.skeleton,
    backgroundImage: `linear-gradient(90deg, ${Colors.glass.skeleton} 25%, ${Colors.glass.skeletonShine} 50%, ${Colors.glass.skeleton} 75%)`,
    backgroundSize: "200% 100%",
    animationKeyframes: [{ "0%": { backgroundPositionX: "100%" }, "100%": { backgroundPositionX: "-100%" } }],
    animationDuration: ms(Motion.esqueleto),
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  }),
  quieto: estiloWeb({ backgroundColor: Colors.glass.skeleton, transitionTimingFunction: Curva.suave }),
});

/** Un bloque gris que se está cargando. `width` admite número o porcentaje. */
export function Shimmer({
  width = "100%",
  height = 14,
  radius = 8,
  style,
  testID,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { movimientoReducido } = useMotionPreferences();
  const progreso = useRef(new Animated.Value(0)).current;
  const [ancho, setAncho] = useState(0);

  const animadoEnNativo = !usaCSS && !movimientoReducido && ancho > 0 && animacionesEnVivo;

  useEffect(() => {
    if (!animadoEnNativo) return;
    const bucle = Animated.loop(
      Animated.timing(progreso, {
        toValue: 1,
        duration: Motion.esqueleto,
        easing: EasingNativo.lineal,
        useNativeDriver: true,
      }),
    );
    bucle.start();
    return () => bucle.stop();
  }, [progreso, animadoEnNativo]);

  const base: ViewStyle = { width, height, borderRadius: radius, overflow: "hidden" };

  if (usaCSS) {
    return (
      <View testID={testID} style={[base, movimientoReducido ? web.quieto : web.barrido, style]} />
    );
  }

  // En nativo no hay `background-position` que animar: se desliza un degradado por
  // encima. Necesita el ancho real, así que se mide.
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((prev) => (Math.abs(prev - w) < 1 ? prev : w));
  };

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[base, { backgroundColor: Colors.glass.skeleton }, style]}
    >
      {animadoEnNativo && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [
                {
                  translateX: progreso.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-ancho, ancho],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.glass.skeleton, Colors.glass.skeletonShine, Colors.glass.skeleton]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** Una línea de texto fantasma. */
export function ShimmerLinea({ width = "100%", height = 12 }: { width?: number | `${number}%`; height?: number }) {
  return <Shimmer width={width} height={height} radius={6} />;
}

/** El hueco de una tarjeta de la lista, con la forma que va a tener. */
export function ShimmerTarjeta({ lineas = 2, testID }: { lineas?: number; testID?: string }) {
  return (
    <View testID={testID} style={estilos.tarjeta}>
      <Shimmer width={44} height={44} radius={22} />
      <View style={estilos.texto}>
        <ShimmerLinea width="62%" height={13} />
        {Array.from({ length: Math.max(0, lineas - 1) }).map((_, i) => (
          <ShimmerLinea key={i} width={i % 2 === 0 ? "88%" : "45%"} height={10} />
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.card,
    backgroundColor: Colors.glass.fillSoft,
  },
  texto: { flex: 1, gap: Space.sm },
});

export default Shimmer;
