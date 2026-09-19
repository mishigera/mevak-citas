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
 *
 * ## Paneles anclados a un campo (`anclaRef`)
 *
 * Un panel que se despliega bajo un campo de formulario **no puede vivir dentro del
 * campo** en web: react-native-web pone `z-index: 0` en toda `View`, cada una crea su
 * contexto de apilado, y los campos que vienen después se pintan encima del panel por
 * mucho `zIndex` que lleve. El fondo que cierra al tocar fuera sufría lo mismo: solo
 * cubría la caja del campo, así que tocar otro campo abría un segundo panel sin cerrar
 * el primero.
 *
 * Con `anclaRef`, en web el panel y su fondo salen a `document.body` (`Portal`) con
 * `position: fixed`, y la posición se calcula desde el rectángulo del campo: debajo si
 * cabe, encima si no. Se recalcula al hacer scroll, al cambiar el tamaño y, mientras
 * está abierto, cada 150 ms por si la maquetación se mueve sola.
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
import { Portal } from "./Portal";

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
  /**
   * El campo del que cuelga el panel. Con él, en web el panel sale del árbol y se coloca
   * solo, pegado al campo (ver la cabecera). Sin él, la posición la da `style`.
   */
  anclaRef?: React.RefObject<View | null>;
  /**
   * Ancho mínimo del panel anclado. Por defecto mide lo que el campo; un calendario en
   * un campo de media columna quedaría apretado. Si es más ancho que el campo, se alinea
   * con el borde del campo más cercano al centro de la ventana.
   */
  anchoMinimo?: number;
  /** Posición y ancho de la capa. Lo pone quien lo usa. Con `anclaRef`, solo cuenta `maxHeight`. */
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

/** El rectángulo del campo en coordenadas de la ventana, como da `getBoundingClientRect`. */
export type RectAncla = { top: number; bottom: number; left: number; width: number };

/** Hueco entre el campo y el panel. */
const SEPARACION = 6;
/** Lo que se deja libre contra el borde de la ventana. */
const MARGEN_VENTANA = 12;
/** Cada cuánto se vuelve a medir el campo con el panel abierto. */
const INTERVALO_MEDIDA = 150;

/**
 * Dónde va un panel anclado: debajo del campo si cabe, encima si no.
 *
 * Si no cabe en ninguno de los dos lados, va al que tenga más sitio y se recorta su alto
 * a lo que haya; el contenido de los paneles ya va en un `ScrollView`.
 */
export function posicionAnclada(
  rect: RectAncla,
  altoVentana: number,
  altoPanel: number,
  altoMaximo = Infinity,
  anchoMinimo = 0,
  anchoVentana = Infinity,
): {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  origen: OrigenPopover;
} {
  const libreAbajo = altoVentana - rect.bottom - SEPARACION - MARGEN_VENTANA;
  const libreArriba = rect.top - SEPARACION - MARGEN_VENTANA;
  const alto = Math.min(altoPanel || altoMaximo, altoMaximo);
  const abajo = alto <= libreAbajo || libreAbajo >= libreArriba;

  // Más ancho que el campo: se pega al borde del campo que mira al centro de la ventana,
  // y el panel nace de esa esquina. Un campo de la columna derecha abre hacia la izquierda.
  const width = Math.min(Math.max(rect.width, anchoMinimo), anchoVentana - 2 * MARGEN_VENTANA);
  const haciaLaIzquierda = width > rect.width && rect.left + rect.width / 2 > anchoVentana / 2;
  const leftDeseado = haciaLaIzquierda ? rect.left + rect.width - width : rect.left;
  const left = Math.min(Math.max(leftDeseado, MARGEN_VENTANA), anchoVentana - width - MARGEN_VENTANA);
  const lado = haciaLaIzquierda ? "derecha" : "izquierda";

  return abajo
    ? {
        top: rect.bottom + SEPARACION,
        left,
        width,
        maxHeight: Math.max(Math.min(altoMaximo, libreAbajo), 0),
        origen: `arriba-${lado}`,
      }
    : {
        bottom: altoVentana - rect.top + SEPARACION,
        left,
        width,
        maxHeight: Math.max(Math.min(altoMaximo, libreArriba), 0),
        origen: `abajo-${lado}`,
      };
}

/** El rectángulo de una `View` en web. En nativo no hay DOM y devuelve `null`. */
function medirAncla(ref: React.RefObject<View | null> | undefined): RectAncla | null {
  const nodo = ref?.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
  const r = nodo?.getBoundingClientRect?.();
  if (!r) return null;
  return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
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
  anclaRef,
  anchoMinimo,
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

  // Panel anclado: se mide el campo al abrir y cada vez que algo lo mueve.
  //
  // Scroll y resize no bastan: la maquetación también se mueve sola —la entrada animada
  // de un formulario recién abierto, el teclado del teléfono— y el panel se quedaba donde
  // estaba el campo al abrir. Por eso, además, se vuelve a medir cada 150 ms mientras está
  // abierto. Con `setTimeout` y no con `requestAnimationFrame`: rAF se detiene en una
  // pestaña oculta y el panel no se recolocaba. Medir es un `getBoundingClientRect` y
  // solo se vuelve a pintar si el rectángulo ha cambiado de verdad.
  //
  // El scroll se escucha en captura porque el de un `ScrollView` no burbujea a `window`.
  const anclado = usaCSS && !!anclaRef;
  const [rectAncla, setRectAncla] = useState<RectAncla | null>(null);
  useEffect(() => {
    if (!anclado || !visible) return;
    const win = globalThis as unknown as {
      addEventListener?: Window["addEventListener"];
      removeEventListener?: Window["removeEventListener"];
    };
    const medir = () => {
      const nuevo = medirAncla(anclaRef);
      setRectAncla((previo) =>
        previo && nuevo &&
        Math.abs(previo.top - nuevo.top) < 0.5 &&
        Math.abs(previo.bottom - nuevo.bottom) < 0.5 &&
        Math.abs(previo.left - nuevo.left) < 0.5 &&
        Math.abs(previo.width - nuevo.width) < 0.5
          ? previo
          : nuevo,
      );
    };
    medir();
    const intervalo = setInterval(medir, INTERVALO_MEDIDA);
    win.addEventListener?.("scroll", medir, true);
    win.addEventListener?.("resize", medir);
    return () => {
      clearInterval(intervalo);
      win.removeEventListener?.("scroll", medir, true);
      win.removeEventListener?.("resize", medir);
    };
  }, [anclado, visible, anclaRef]);

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
    const ventana = globalThis as { innerHeight?: number; innerWidth?: number };
    const altoVentana = ventana.innerHeight ?? 800;
    const anchoVentana = ventana.innerWidth ?? Infinity;
    const maxDelLlamador = (StyleSheet.flatten(style) as ViewStyle | undefined)?.maxHeight;
    const posicion = anclado && rectAncla
      ? posicionAnclada(
          rectAncla,
          altoVentana,
          medida.height,
          typeof maxDelLlamador === "number" ? maxDelLlamador : Infinity,
          anchoMinimo,
          anchoVentana,
        )
      : null;
    // Si se abre hacia arriba, el círculo del que nace está abajo.
    const origenEfectivo = posicion?.origen ?? origen;
    const medido = medida.width > 0 && medida.height > 0;
    const cerrado = medido
      ? recorteCerrado(origenEfectivo, medida, diametroOrigen)
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

    // Anclado, del `style` de quien lo usa no se hereda NADA de posición: ese `style`
    // trae `top/left/right` para nativo, y en un array de estilos un `undefined` no pisa
    // un valor anterior. Con `top: 54` heredado y `bottom` calculado, el panel que se
    // abría hacia arriba se quedaba clavado arriba con un hueco hasta el campo. El alto
    // máximo de quien lo usa ya va dentro de `posicion.maxHeight`.
    const capaAnclada = anclado
      ? [
          estilos.capaAnclada,
          posicion
            ? estiloWeb({
                top: posicion.top ?? "auto",
                bottom: posicion.bottom ?? "auto",
                left: posicion.left,
                right: "auto",
                width: posicion.width,
                maxHeight: posicion.maxHeight,
              })
            : null,
        ]
      : null;

    const arbol = (
      <>
        {conFondo && visible && (
          <Pressable
            accessibilityLabel="Cerrar panel"
            onPress={onClose}
            style={anclado ? estilos.fondoPantalla : estilos.fondo}
          />
        )}
        <View
          testID={testID}
          pointerEvents={visible ? "auto" : "none"}
          style={[
            estilos.capa,
            capaAnclada ?? style,
            // Anclado y sin medir todavía: invisible, para no pintarlo un fotograma en
            // la esquina de la ventana.
            estiloWeb({ visibility: abierto && (!anclado || posicion) ? "visible" : "hidden" }),
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
                transformOrigin: ORIGENES[origenEfectivo].css,
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

    return anclado ? <Portal>{arbol}</Portal> : arbol;
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
  // Anclado: fuera del árbol y contra la ventana, por encima de la cabecera y la barra
  // de pestañas, que también flotan.
  fondoPantalla: estiloWeb({ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000 }),
  capaAnclada: estiloWeb({ position: "fixed", zIndex: 1001 }),
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
