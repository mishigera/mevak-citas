/**
 * Las entradas: lo que hace que una pantalla se abra en vez de aparecer de golpe.
 *
 * Dos capas, nunca mezcladas (es la regla del sistema de referencia):
 *  - **entradas**, aquí, que se aplican desde la pantalla al montar;
 *  - **microinteracciones** (hover, active, foco), en `PressableMotion` y dentro de
 *    cada primitiva de vidrio. Una tarjeta no se entera de cómo entró.
 *
 * En web se emite CSS de verdad —`react-native-web` compila `animationKeyframes` a
 * `@keyframes`— y en nativo se cae a `Animated`. La rama vive aquí: las pantallas
 * escriben `<Entrar>` y no saben en qué plataforma están.
 *
 * ## Dos reglas que no se pueden saltar
 *
 * 1. **`animationFillMode: "backwards"`, nunca `"both"`.** Con `both` el último
 *    fotograma se queda pegado al elemento para siempre y, como las animaciones ganan
 *    a la cascada, el `transform` del hover deja de aplicarse: el hover muere. Con
 *    `backwards` solo se adelanta el estado inicial durante el retraso.
 *
 * 2. **La opacidad llega a 1 antes que el movimiento.** Un ancestro con `opacity < 1`
 *    es *backdrop root*: mientras dura el fundido, el `backdrop-filter` de lo que lleva
 *    dentro deja de ver la página. Como aquí lo que entra ES vidrio, una entrada que
 *    fuera de 0 a 1 en 420 ms tendría el desenfoque apagado todo ese rato y lo
 *    encendería de un salto al acabar. Por eso la opacidad cierra al 55% y el
 *    desplazamiento sigue hasta el final: el desenfoque entra en marcha.
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Curva, EasingNativo, Motion, retrasoEscalonado } from "@/constants/motion";
import { animacionesEnVivo, estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";

/** `entrar` sube y aparece · `aparecer` solo funde · `pop` crece desde el 96%. */
export type Variante = "entrar" | "aparecer" | "pop";

const DURACIONES: Record<Variante, number> = {
  entrar: Motion.duracion,
  aparecer: Motion.duracionCorta,
  pop: Motion.pop,
};

type PropsMovimiento = {
  children?: React.ReactNode;
  /** Retraso antes de empezar, en ms. Lo reparte `Stagger`. */
  delay?: number;
  /** A `false` se pinta el estado final sin animar (listas ya vistas, tests). */
  activo?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  testID?: string;
};

const web = StyleSheet.create({
  entrar: estiloWeb({
    animationKeyframes: [
      {
        "0%": { opacity: 0, transform: [{ translateY: Motion.desplazamiento }] },
        "55%": { opacity: 1 },
        "100%": { opacity: 1, transform: [{ translateY: 0 }] },
      },
    ],
    animationDuration: ms(Motion.duracion),
    animationTimingFunction: Curva.suave,
    animationFillMode: "backwards",
  }),
  aparecer: estiloWeb({
    animationKeyframes: [{ "0%": { opacity: 0 }, "100%": { opacity: 1 } }],
    animationDuration: ms(Motion.duracionCorta),
    animationTimingFunction: Curva.suave,
    animationFillMode: "backwards",
  }),
  pop: estiloWeb({
    animationKeyframes: [
      {
        "0%": { opacity: 0, transform: [{ scale: 0.96 }] },
        "60%": { opacity: 1 },
        "100%": { opacity: 1, transform: [{ scale: 1 }] },
      },
    ],
    animationDuration: ms(Motion.pop),
    animationTimingFunction: Curva.suave,
    animationFillMode: "backwards",
  }),
  flotar: estiloWeb({
    animationKeyframes: [
      {
        "0%": { transform: [{ translateY: 0 }] },
        "50%": { transform: [{ translateY: -5 }] },
        "100%": { transform: [{ translateY: 0 }] },
      },
    ],
    animationDuration: ms(Motion.flotar),
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  }),
});

function MovimientoNativo({
  variante,
  delay = 0,
  style,
  children,
  pointerEvents,
  testID,
}: PropsMovimiento & { variante: Variante }) {
  const progreso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animacionesEnVivo) {
      progreso.setValue(1);
      return;
    }
    const animacion = Animated.timing(progreso, {
      toValue: 1,
      duration: DURACIONES[variante],
      delay,
      easing: EasingNativo.suave,
      useNativeDriver: true,
    });
    animacion.start();
    return () => animacion.stop();
  }, [progreso, variante, delay]);

  // Misma forma que los keyframes de web, incluida la opacidad adelantada.
  const opacidad =
    variante === "aparecer"
      ? progreso
      : progreso.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1] });

  const transform =
    variante === "aparecer"
      ? undefined
      : variante === "pop"
        ? [{ scale: progreso.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]
        : [
            {
              translateY: progreso.interpolate({
                inputRange: [0, 1],
                outputRange: [Motion.desplazamiento, 0],
              }),
            },
          ];

  return (
    <Animated.View
      testID={testID}
      pointerEvents={pointerEvents}
      style={[style, { opacity: opacidad }, transform ? { transform } : null]}
    >
      {children}
    </Animated.View>
  );
}

/** La entrada genérica. Las pantallas usan los atajos de abajo. */
export function Movimiento({
  variante,
  delay = 0,
  activo = true,
  style,
  children,
  pointerEvents,
  testID,
}: PropsMovimiento & { variante: Variante }) {
  const { movimientoReducido } = useMotionPreferences();

  if (!activo || movimientoReducido) {
    return (
      <View style={style} pointerEvents={pointerEvents} testID={testID}>
        {children}
      </View>
    );
  }

  if (usaCSS) {
    return (
      <View
        testID={testID}
        pointerEvents={pointerEvents}
        style={[web[variante], delay ? estiloWeb({ animationDelay: ms(delay) }) : null, style]}
      >
        {children}
      </View>
    );
  }

  return (
    <MovimientoNativo
      variante={variante}
      delay={delay}
      style={style}
      pointerEvents={pointerEvents}
      testID={testID}
    >
      {children}
    </MovimientoNativo>
  );
}

/** Sube 12 px y aparece. La entrada por defecto de casi todo. */
export function Entrar(props: PropsMovimiento) {
  return <Movimiento variante="entrar" {...props} />;
}

/**
 * Solo opacidad. Para contenedores grandes y para el cambio de ruta.
 * Ojo: mientras dura, el vidrio que lleve dentro no desenfoca (ver cabecera).
 * Por eso es corta y por eso no se usa en tarjetas sueltas.
 */
export function Aparecer(props: PropsMovimiento) {
  return <Movimiento variante="aparecer" {...props} />;
}

/** Crece desde el 96%. Paneles y diálogos; nunca rebotes grandes. */
export function Pop(props: PropsMovimiento) {
  return <Movimiento variante="pop" {...props} />;
}

/**
 * Escalonado de los hijos DIRECTOS, a 60 ms de paso.
 * Del 11.º en adelante entran todos juntos: escalonar una lista larga se siente lento.
 */
export function Stagger({
  children,
  delayInicial = 0,
  variante = "entrar",
  activo = true,
  style,
  envoltorio,
  testID,
}: {
  children?: React.ReactNode;
  /** Se suma al paso de cada hijo: sirve para encadenar con la entrada de la cabecera. */
  delayInicial?: number;
  variante?: Variante;
  activo?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Estilo del envoltorio de cada hijo (por ejemplo, para una rejilla). */
  envoltorio?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const hijos = React.Children.toArray(children).filter(React.isValidElement);

  return (
    <View style={style} testID={testID}>
      {hijos.map((hijo, i) => (
        <Movimiento
          key={hijo.key ?? i}
          variante={variante}
          delay={delayInicial + retrasoEscalonado(i)}
          activo={activo}
          style={envoltorio}
        >
          {hijo}
        </Movimiento>
      ))}
    </View>
  );
}

/** Vaivén lento e infinito. Para el icono de un estado vacío, nada más. */
export function Flotar({ children, style, testID }: Omit<PropsMovimiento, "delay" | "activo">) {
  const { movimientoReducido } = useMotionPreferences();
  const progreso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (usaCSS || movimientoReducido || !animacionesEnVivo) return;
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(progreso, {
          toValue: 1,
          duration: Motion.flotar / 2,
          easing: EasingNativo.simetrica,
          useNativeDriver: true,
        }),
        Animated.timing(progreso, {
          toValue: 0,
          duration: Motion.flotar / 2,
          easing: EasingNativo.simetrica,
          useNativeDriver: true,
        }),
      ]),
    );
    bucle.start();
    return () => bucle.stop();
  }, [progreso, movimientoReducido]);

  if (movimientoReducido) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }

  if (usaCSS) {
    return (
      <View style={[web.flotar, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        { transform: [{ translateY: progreso.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export { PressableMotion } from "./PressableMotion";
export type { PressableMotionProps } from "./PressableMotion";
export { Shimmer, ShimmerLinea, ShimmerTarjeta } from "./Shimmer";
