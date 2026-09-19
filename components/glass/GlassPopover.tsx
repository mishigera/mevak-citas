/**
 * El panel que **nace del botón que lo abre**: no aparece, crece desde ese círculo con
 * un resorte, y al cerrar colapsa hacia él con el contenido ya desvanecido.
 *
 * ## Por qué no usa `GlassSurface`
 *
 * Porque aquí el orden de las capas es distinto y no es un capricho:
 *
 *  - El recorte se hace con `clip-path`, y **un `clip-path` en un ancestro convierte a
 *    ese ancestro en *backdrop root*: el `backdrop-filter` de sus hijos deja de ver la
 *    página y el panel se ve gris plano.** Por eso el desenfoque no va dentro del
 *    elemento recortado: va en un HERMANO con el mismo recorte. Recortado por su propio
 *    `clip-path` sí funciona —el elemento filtra su fondo y después se recorta—, y eso
 *    es justo lo que hace que el desenfoque parezca nacer del círculo.
 *  - La sombra va en otro hermano, sin recorte, que escala en paralelo. Si fuera del
 *    panel, su propio `clip-path` se la comería durante toda la apertura.
 *
 * ## Por qué se mide el panel
 *
 * El recorte cerrado podría escribirse con `calc(100% - 50px)`, pero entonces la
 * transición tiene que interpolar `calc()` con `0px`. Midiendo el panel (`onLayout`)
 * los cuatro valores salen en píxeles y la interpolación es trivial en cualquier motor.
 *
 * En nativo no hay `clip-path`: el panel escala desde el mismo origen con
 * `transformOrigin` y el mismo resorte. Las pantallas no notan la diferencia.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { Colors } from "@/constants/colors";
import { Blur, GlassShadow, Radius, Space } from "@/constants/theme";
import { Curva, EasingNativo, Motion, ResorteNativo } from "@/constants/motion";
import { animacionesEnVivo, curvaResorte, estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";
import { PressableMotion } from "@/components/motion/PressableMotion";

/** La esquina de la que nace el panel; es donde está el botón que lo abre. */
export type OrigenPopover = "arriba-derecha" | "arriba-izquierda" | "abajo-derecha" | "abajo-izquierda" | "centro";

export type GlassPopoverProps = {
  visible: boolean;
  onClose: () => void;
  /** Título de la cabecera. Sin él, la cabecera solo lleva el botón de cerrar. */
  titulo?: string;
  origen?: OrigenPopover;
  /** Diámetro del botón del que nace. El recorte inicial es exactamente ese círculo. */
  diametroOrigen?: number;
  radius?: number;
  /** Capa a pantalla completa que cierra al tocar fuera. */
  conFondo?: boolean;
  /** Se le devuelve el foco al cerrar (normalmente, el botón que abrió el panel). */
  refOrigen?: React.RefObject<{ focus?: () => void } | null>;
  /** Posición y ancho de la capa. Lo pone quien lo usa. */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
};

const ORIGENES: Record<OrigenPopover, { x: 0 | 1; y: 0 | 1; css: string }> = {
  "arriba-derecha": { x: 1, y: 0, css: "top right" },
  "arriba-izquierda": { x: 0, y: 0, css: "top left" },
  "abajo-derecha": { x: 1, y: 1, css: "bottom right" },
  "abajo-izquierda": { x: 0, y: 1, css: "bottom left" },
  centro: { x: 0.5 as 0, y: 0.5 as 0, css: "center" },
};

/**
 * La ruta actual, o cadena vacía si no hay router del que leerla.
 *
 * `usePathname()` necesita el contexto de `expo-router`, y hay un sitio donde el panel
 * se monta sin él: `ErrorFallback`, que se pinta por encima de todo cuando algo ha
 * reventado —y lo que ha reventado bien puede ser la propia navegación—. Sin ruta que
 * vigilar el panel pierde solo el cierre automático al navegar, que ahí no significa
 * nada porque no se navega a ningún sitio.
 *
 * El `try` envuelve a un hook, pero el hook se llama en todos los renders igual: lo que
 * se captura es su excepción, no una llamada condicional.
 */
function useRutaSegura(): string {
  try {
    return usePathname() ?? "";
  } catch {
    return "";
  }
}

/** El recorte cerrado: el círculo del botón, en la esquina que toque. */
function recorteCerrado(
  origen: OrigenPopover,
  medida: { width: number; height: number },
  diametro: number,
) {
  const d = Math.min(diametro, medida.width, medida.height);
  const restoX = Math.max(0, medida.width - d);
  const restoY = Math.max(0, medida.height - d);
  const r = d / 2;
  const { x, y } = ORIGENES[origen];
  if (origen === "centro") {
    const mx = Math.max(0, (medida.width - d) / 2);
    const my = Math.max(0, (medida.height - d) / 2);
    return `inset(${my}px ${mx}px ${my}px ${mx}px round ${r}px)`;
  }
  const arriba = y === 0 ? 0 : restoY;
  const abajo = y === 0 ? restoY : 0;
  const izquierda = x === 0 ? 0 : restoX;
  const derecha = x === 0 ? restoX : 0;
  return `inset(${arriba}px ${derecha}px ${abajo}px ${izquierda}px round ${r}px)`;
}

export function GlassPopover({
  visible,
  onClose,
  titulo,
  origen = "arriba-derecha",
  diametroOrigen = 50,
  radius = Radius.panel,
  conFondo = true,
  refOrigen,
  style,
  children,
  testID,
}: GlassPopoverProps) {
  const { movimientoReducido, hayDesenfoque, transparenciaReducida } = useMotionPreferences();
  const esVidrio = hayDesenfoque && !transparenciaReducida;

  // `montado` sobrevive al cierre para que el colapso se vea; `abierto` es el estado
  // al que transiciona. Entre montar y abrir pasa un frame a propósito: si se pintara
  // ya abierto, no habría transición desde el círculo.
  const [montado, setMontado] = useState(visible);
  const [abierto, setAbierto] = useState(false);
  const [medida, setMedida] = useState({ width: 0, height: 0 });
  const progreso = useRef(new Animated.Value(0)).current;
  const refCerrar = useRef<View | null>(null);

  useEffect(() => {
    if (visible) {
      setMontado(true);
      const t = setTimeout(() => setAbierto(true), 16);
      return () => clearTimeout(t);
    }
    setAbierto(false);
    const t = setTimeout(() => setMontado(false), Motion.panelCerrar);
    return () => clearTimeout(t);
  }, [visible]);

  // Nativo: sin `clip-path`, el panel escala desde el mismo origen.
  useEffect(() => {
    if (usaCSS) return;
    if (movimientoReducido || !animacionesEnVivo) {
      progreso.setValue(abierto ? 1 : 0);
      return;
    }
    const animacion = abierto
      ? Animated.spring(progreso, { toValue: 1, ...ResorteNativo })
      : Animated.timing(progreso, {
          toValue: 0,
          duration: Motion.panelCerrar,
          easing: EasingNativo.simetrica,
          useNativeDriver: true,
        });
    animacion.start();
    return () => animacion.stop();
  }, [abierto, progreso, movimientoReducido]);

  // Escape cierra. Solo en web: en nativo no hay teclado físico que lo mande.
  useEffect(() => {
    if (!visible || !usaCSS) return;
    const doc = (globalThis as { document?: Document }).document;
    if (!doc?.addEventListener) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    doc.addEventListener("keydown", alPulsar);
    return () => doc.removeEventListener("keydown", alPulsar);
  }, [visible, onClose]);

  // Al abrir, el foco va al botón de cerrar; al cerrar, vuelve a quien lo abrió.
  useEffect(() => {
    if (!usaCSS) return;
    if (abierto) {
      // Con retraso: el panel tiene que existir antes de poder enfocarlo.
      const t = setTimeout(() => (refCerrar.current as { focus?: () => void } | null)?.focus?.(), 60);
      return () => clearTimeout(t);
    }
    refOrigen?.current?.focus?.();
  }, [abierto, refOrigen]);

  // Navegar cierra el panel: si no, se queda flotando sobre otra pantalla.
  const ruta = useRutaSegura();
  const rutaAnterior = useRef(ruta);
  useEffect(() => {
    if (ruta === rutaAnterior.current) return;
    rutaAnterior.current = ruta;
    if (visible) onClose();
  }, [ruta, visible, onClose]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMedida((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);

  if (!montado) return null;

  const cabecera = (
    <View style={estilos.cabecera}>
      <Text style={estilos.titulo} numberOfLines={1}>
        {titulo ?? ""}
      </Text>
      <PressableMotion
        gesto="escala"
        onPress={onClose}
        accessibilityLabel="Cerrar"
        hitSlop={8}
        style={estilos.cerrar}
      >
        <View ref={refCerrar} style={estilos.cerrarCirculo}>
          <Ionicons name="close" size={18} color={Colors.primaryDark} />
        </View>
      </PressableMotion>
    </View>
  );

  const contenido = (
    <>
      {cabecera}
      {children}
    </>
  );

  // --- Rama de CSS (web) ---------------------------------------------------

  if (usaCSS) {
    const medido = medida.width > 0 && medida.height > 0;
    const cerrado = medido
      ? recorteCerrado(origen, medida, diametroOrigen)
      : `inset(0px 0px 0px 0px round ${radius}px)`;
    const abiertoCss = `inset(0px 0px 0px 0px round ${radius}px)`;
    // Con movimiento reducido no hay recorte que animar: el panel solo aparece. Aquí
    // sí puede usar `opacity` porque el desenfoque se apaga con él.
    const recorte = movimientoReducido ? "none" : abierto ? abiertoCss : cerrado;

    const transicionRecorte = estiloWeb({
      clipPath: recorte,
      WebkitClipPath: recorte,
      transitionProperty: "clip-path, -webkit-clip-path",
      transitionDuration: ms(abierto ? Motion.panelAbrir : Motion.panelCerrar),
      transitionTimingFunction: abierto ? curvaResorte() : Curva.simetrica,
    });

    return (
      <>
        {conFondo && visible && (
          <Pressable
            accessibilityLabel="Cerrar panel"
            onPress={onClose}
            style={estilos.fondo}
          />
        )}
        <View
          testID={testID}
          pointerEvents={visible ? "auto" : "none"}
          style={[
            estilos.capa,
            style,
            estiloWeb({ visibility: abierto ? "visible" : "hidden" }),
            movimientoReducido
              ? estiloWeb({
                  opacity: abierto ? 1 : 0,
                  transitionProperty: "opacity",
                  transitionDuration: ms(Motion.duracionCorta),
                })
              : null,
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: radius },
              GlassShadow,
              estiloWeb({
                opacity: abierto ? 1 : 0,
                transform: abierto ? [{ scale: 1 }] : [{ scaleX: 0.13 }, { scaleY: 0.1 }],
                transformOrigin: ORIGENES[origen].css,
                transitionProperty: "transform, opacity",
                transitionDuration: ms(abierto ? Motion.panelAbrir : Motion.panelCerrar),
                transitionTimingFunction: abierto ? curvaResorte() : Curva.simetrica,
              }),
            ]}
          />
          {esVidrio && (
            <BlurView
              intensity={Blur.panel}
              tint="default"
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { borderRadius: radius }, transicionRecorte]}
            />
          )}
          <View
            onLayout={onLayout}
            style={[
              estilos.panel,
              {
                borderRadius: radius,
                backgroundColor: esVidrio ? Colors.glass.fillStrong : Colors.glass.fillSolidStrong,
              },
              transicionRecorte,
            ]}
          >
            <View
              style={estiloWeb({
                opacity: abierto ? 1 : 0,
                transitionProperty: "opacity",
                transitionDuration: ms(abierto ? 220 : 120),
                transitionDelay: ms(abierto ? 80 : 0),
              })}
            >
              {contenido}
            </View>
          </View>
        </View>
      </>
    );
  }

  // --- Rama nativa ---------------------------------------------------------

  const escala = progreso.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });

  return (
    <>
      {conFondo && visible && (
        <Pressable accessibilityLabel="Cerrar panel" onPress={onClose} style={estilos.fondo} />
      )}
      <Animated.View
        testID={testID}
        pointerEvents={visible ? "auto" : "none"}
        style={[
          estilos.capa,
          style,
          {
            opacity: progreso,
            transform: [{ scale: escala }],
            transformOrigin: ORIGENES[origen].css,
          },
        ]}
      >
        <View
          onLayout={onLayout}
          style={[
            estilos.panel,
            GlassShadow,
            {
              borderRadius: radius,
              backgroundColor: esVidrio ? Colors.glass.fillStrong : Colors.glass.fillSolidStrong,
            },
          ]}
        >
          {esVidrio && (
            <BlurView
              intensity={Blur.panel}
              tint="default"
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden", zIndex: -1 }]}
            />
          )}
          {contenido}
        </View>
      </Animated.View>
    </>
  );
}

const estilos = StyleSheet.create({
  fondo: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  capa: { position: "absolute", zIndex: 41 },
  panel: {
    overflow: "hidden",
    zIndex: 0,
    borderWidth: 1,
    borderColor: Colors.glass.stroke,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.md,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  titulo: { flex: 1, fontFamily: "Nunito_800ExtraBold", fontSize: 17, color: Colors.text },
  cerrar: { borderRadius: 999 },
  cerrarCirculo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.glass.fillPink,
  },
});

export default GlassPopover;
