/**
 * Los componentes de vidrio que usan las pantallas. Todos se apoyan en `GlassSurface`;
 * aquí solo se deciden proporciones, tipografia, estados y movimiento.
 *
 * El movimiento vive en dos sitios distintos y conviene no confundirlos:
 *  - **cómo entra** una tarjeta lo decide la pantalla, con `<Entrar>` o `<Stagger>`;
 *  - **cómo responde** al dedo o al ratón lo decide `PressableMotion`, aquí dentro.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Blur, GlassShadowSoft, Radius, Space } from "@/constants/theme";
import { Curva, Motion, ResorteNativo } from "@/constants/motion";
import {
  animacionesEnVivo,
  curvaResorte,
  estiloWeb,
  estiloWebTexto,
  ms,
  usaCSS,
  useMotionPreferences,
} from "@/lib/motion";
import { PressableMotion } from "@/components/motion/PressableMotion";
import { GlassSurface, type GlassTone } from "./GlassSurface";

export { GlassSurface } from "./GlassSurface";
export type { GlassTone, GlassSurfaceProps } from "./GlassSurface";
export { GlassPopover } from "./GlassPopover";
export type { GlassPopoverProps } from "./GlassPopover";

// --- Tarjeta ----------------------------------------------------------------

export function GlassCard({
  children,
  onPress,
  tone = "neutral",
  radius = Radius.card,
  elevation = "soft",
  gesto = "elevar",
  style,
  accessibilityLabel,
  testID,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  tone?: GlassTone;
  radius?: number;
  elevation?: "none" | "soft" | "lifted";
  /** `sutil` para filas de lista apretadas; `elevar` para tarjetas con aire. */
  gesto?: "elevar" | "sutil";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  if (!onPress) {
    return (
      <GlassSurface tone={tone} radius={radius} elevation={elevation} style={style} testID={testID}>
        {children}
      </GlassSurface>
    );
  }
  return (
    <PressableMotion
      onPress={onPress}
      gesto={gesto}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[{ borderRadius: radius }, style]}
    >
      <GlassSurface tone={tone} radius={radius} elevation={elevation}>
        {children}
      </GlassSurface>
    </PressableMotion>
  );
}

// --- Boton circular ---------------------------------------------------------

/**
 * `primary` se queda en rosa solido a propósito: en las referencias de Apple la
 * accion principal tampoco es de vidrio (el botón rojo de colgar), porque si todo
 * es translúcido se pierde cual es la accion importante.
 */
export function GlassIconButton({
  name,
  onPress,
  variant = "glass",
  diameter = 44,
  size = 22,
  accessibilityLabel,
  accessibilityHasPopup,
  accessibilityState,
  style,
  testID,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  variant?: "glass" | "primary";
  diameter?: number;
  size?: number;
  accessibilityLabel?: string;
  accessibilityHasPopup?: boolean;
  accessibilityState?: { selected?: boolean; expanded?: boolean; disabled?: boolean };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const esPrimario = variant === "primary";
  const contenido = (
    <Ionicons name={name} size={size} color={esPrimario ? "#fff" : Colors.primaryDark} />
  );

  return (
    <PressableMotion
      onPress={onPress}
      gesto="escala"
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      accessibilityHasPopup={accessibilityHasPopup}
      accessibilityState={accessibilityState}
      testID={testID}
      style={[{ borderRadius: diameter / 2 }, style]}
    >
      {esPrimario ? (
        <View
          style={[
            styles.centro,
            GlassShadowSoft,
            { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: Colors.primary },
          ]}
        >
          {contenido}
        </View>
      ) : (
        <GlassSurface
          tone="pink"
          intensity={Blur.control}
          radius={diameter / 2}
          style={[styles.centro, { width: diameter, height: diameter }]}
        >
          {contenido}
        </GlassSurface>
      )}
    </PressableMotion>
  );
}

// --- Pulgar deslizante ------------------------------------------------------

/**
 * El bloque de vidrio que marca la opción activa y **se desliza** hasta ella en vez de
 * aparecer y desaparecer. Lo comparten el segmentado y la barra de pestañas.
 *
 * Necesita saber cuánto mide el carril (`longitud`) porque el desplazamiento va en
 * píxeles: ni CSS ni `Animated` interpolan un `flex` de una celda a otra.
 */
export function PulgarDeslizante({
  indice,
  total,
  longitud,
  vertical = false,
  radius = Radius.control,
  tone = "pinkStrong",
  testID,
}: {
  indice: number;
  total: number;
  longitud: number;
  vertical?: boolean;
  radius?: number;
  tone?: GlassTone;
  testID?: string;
}) {
  const { movimientoReducido } = useMotionPreferences();
  const paso = total > 0 ? longitud / total : 0;
  const destino = paso * indice;
  const valor = useRef(new Animated.Value(destino)).current;

  useEffect(() => {
    if (usaCSS) return; // en web lo mueve la transición de CSS
    if (movimientoReducido || !animacionesEnVivo) {
      valor.setValue(destino);
      return;
    }
    const animacion = Animated.spring(valor, { toValue: destino, ...ResorteNativo });
    animacion.start();
    return () => animacion.stop();
  }, [valor, destino, movimientoReducido]);

  if (longitud <= 0 || total <= 0) return null;

  const medida: ViewStyle = vertical
    ? { height: paso, left: 0, right: 0, top: 0 }
    : { width: paso, top: 0, bottom: 0, left: 0 };

  const superficie = (
    <GlassSurface tone={tone} intensity={Blur.control} radius={radius} elevation="none" style={StyleSheet.absoluteFill} />
  );

  if (usaCSS) {
    return (
      <View
        testID={testID}
        pointerEvents="none"
        style={[
          styles.pulgar,
          medida,
          estiloWeb({
            transform: [vertical ? { translateY: destino } : { translateX: destino }],
            transitionProperty: "transform",
            transitionDuration: ms(movimientoReducido ? 0 : Motion.duracionCorta),
            transitionTimingFunction: curvaResorte(),
          }),
        ]}
      >
        {superficie}
      </View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.pulgar,
        medida,
        { transform: [vertical ? { translateY: valor } : { translateX: valor }] },
      ]}
    >
      {superficie}
    </Animated.View>
  );
}

// --- Segmentado -------------------------------------------------------------

export function GlassSegmented<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [ancho, setAncho] = useState(0);
  const indice = Math.max(0, options.findIndex((o) => o.value === value));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((prev) => (Math.abs(prev - w) < 1 ? prev : w));
  };

  return (
    <GlassSurface
      tone="soft"
      intensity={Blur.control}
      radius={Radius.control}
      style={[styles.segmentado, style]}
      testID={testID}
    >
      <View style={styles.carril} onLayout={onLayout}>
        <PulgarDeslizante indice={indice} total={options.length} longitud={ancho} testID="pulgar-segmentado" />
        {options.map((o) => {
          const activo = o.value === value;
          return (
            <PressableMotion
              key={o.value}
              onPress={() => onChange(o.value)}
              gesto="sutil"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={o.label}
              style={styles.segmentoBoton}
            >
              <Text style={[styles.segmentoTexto, activo && styles.segmentoTextoActivo]}>{o.label}</Text>
            </PressableMotion>
          );
        })}
      </View>
    </GlassSurface>
  );
}

// --- Barra ------------------------------------------------------------------

/** Header flotante y barra de pestañas. Mas opaca que el resto: aquí el texto tiene que leerse siempre. */
export function GlassBar({
  children,
  radius = Radius.bar,
  style,
  testID,
}: {
  children?: React.ReactNode;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <GlassSurface
      tone="strong"
      intensity={Blur.bar}
      radius={radius}
      elevation="lifted"
      style={style}
      testID={testID}
    >
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  centro: { justifyContent: "center", alignItems: "center" },
  segmentado: { padding: 4 },
  carril: { flexDirection: "row", position: "relative" },
  pulgar: { position: "absolute" },
  segmentoBoton: { flex: 1, minHeight: 38, justifyContent: "center", alignItems: "center", borderRadius: Radius.control },
  segmentoTexto: {
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: Space.md,
    ...(usaCSS
      ? estiloWebTexto({
          transitionProperty: "color",
          transitionDuration: ms(Motion.micro),
          transitionTimingFunction: Curva.suave,
        })
      : null),
  },
  segmentoTextoActivo: { color: Colors.primaryDark },
});
