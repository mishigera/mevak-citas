/**
 * El andamio de las pantallas: fondo, header de vidrio flotante y columna de
 * contenido centrada con ancho tope.
 *
 * Dos decisiones que conviene entender antes de tocarlo:
 *
 * 1. El header **flota por encima** del contenido, no ocupa sitio en el flujo. Es lo
 *    que hace que el desenfoque tenga algo que desenfocar: si el contenido no pasa por
 *    debajo, el vidrio no se distingue de un panel opaco. A cambio, el scroll de cada
 *    pantalla tiene que reservar ese hueco: lo da `useScreenLayout().paddingTop`.
 *
 2bis. El fondo ambiental se monta AQUI y no en el layout raiz. React Navigation pinta
 *    el fondo de su tema (`#F2F2F2`) en el contenedor de la escena, por encima de
 *    cualquier cosa que este mas afuera, y `contentStyle` no llega a ese nodo. Montarlo
 *    dentro de la escena es lo que evita depender de `@react-navigation/native` solo
 *    para cambiarle el tema.
 *
 * 2. Ese hueco **se mide** con `onLayout`, no se declara. Antes las cuatro pestañas
 *    repetian `insets.top + (Platform.OS === "web" ? 67 : 0)`, y en web ese 67 era una
 *    banda vacia que no compensaba nada. Midiendo, el número no puede quedar desfasado.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  type RefreshControlProps,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { Chrome, Radius, Space } from "@/constants/theme";
import { useBreakpoint } from "@/lib/responsive";
import { GlassBar, GlassIconButton } from "@/components/glass";
import { Entrar } from "@/components/motion";
import { CampanaAvisos } from "@/components/avisos/CampanaAvisos";
import { Motion } from "@/constants/motion";
import { AmbientBackground } from "@/components/AmbientBackground";

type ScreenLayout = {
  /** Hueco que debe reservar arriba el contenido scrollable. */
  paddingTop: number;
  /** Hueco de abajo: barra de pestañas flotante + safe area. */
  paddingBottom: number;
  /** Margen lateral del contenido. */
  gutter: number;
  /** Tope de ancho de la columna. 0 = sin tope (celular). */
  contentMaxWidth: number;
};

const ScreenLayoutContext = createContext<ScreenLayout>({
  paddingTop: 0,
  paddingBottom: 0,
  gutter: Space.lg,
  contentMaxWidth: 0,
});

/** Medidas del andamio, para que el scroll de la pantalla reserve los huecos del chrome. */
export function useScreenLayout() {
  return useContext(ScreenLayoutContext);
}

/**
 * Columna centrada con ancho máximo. Es lo que evita que en iPad un toggle se estire
 * a 1000 px y el botón `+` se vaya a la esquina.
 */
export function ContentColumn({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { gutter, contentMaxWidth } = useScreenLayout();
  return (
    <View
      style={[
        styles.columna,
        { paddingHorizontal: gutter },
        contentMaxWidth > 0 && { maxWidth: contentMaxWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * El scroll de una pantalla, con los huecos del chrome ya reservados y el contenido en
 * la columna centrada. Antes cada pantalla repetía este mismo `ScrollView` con sus
 * paddings a mano, y ahí se colaban los desajustes.
 */
export function ScreenScroll({
  children,
  refreshControl,
  contentStyle,
  testID,
}: {
  children?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { paddingTop, paddingBottom } = useScreenLayout();
  return (
    <ScrollView
      testID={testID}
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <ContentColumn style={contentStyle}>{children}</ContentColumn>
    </ScrollView>
  );
}

export function Screen({
  title,
  subtitle,
  onBack,
  backIcon = "arrow-back",
  action,
  below,
  children,
  hasTabBar = true,
  avisos = false,
  testID,
}: {
  title?: string;
  subtitle?: string;
  /**
   * Botón de volver a la izquierda del título. Las pantallas de detalle lo pasan; las
   * cuatro pestañas, no. Antes cada pantalla se dibujaba su propia flecha en su propia
   * cabecera, y por eso había diez cabeceras distintas.
   */
  onBack?: () => void;
  /** `close` en las pantallas que se abren como hoja modal; `arrow-back` en las demás. */
  backIcon?: "arrow-back" | "close";
  /** Accion de la derecha del header (normalmente un `GlassIconButton`). */
  action?: React.ReactNode;
  /** Banda bajo el header que también flota: buscador, segmentado, tira de días. */
  below?: React.ReactNode;
  children?: React.ReactNode;
  hasTabBar?: boolean;
  /**
   * Campana de avisos en el header. Va en las pantallas de primer nivel (las cuatro
   * pestañas) y no en las de detalle, donde el sitio de la derecha es de la acción de
   * la pantalla y el de la izquierda, del botón de volver.
   */
  avisos?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const layout = useBreakpoint();
  const [chromeHeight, setChromeHeight] = useState(0);

  const onChromeLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    // Solo se actualiza si cambia de verdad: un setState por cada layout con el mismo
    // número sería un render en bucle.
    setChromeHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  const conRiel = hasTabBar && layout.hasSideRail;
  // En web `insets.top` es 0, así que sin un mínimo el header queda pegado al borde.
  const topChrome = Math.max(insets.top, Space.md) + Space.sm;

  const valor = useMemo<ScreenLayout>(
    () => ({
      paddingTop: topChrome + chromeHeight + Space.md,
      paddingBottom: !hasTabBar || conRiel
        ? insets.bottom + Space.xl
        : insets.bottom + Chrome.tabBarInset + Chrome.tabBar + Space.md,
      gutter: layout.gutter,
      contentMaxWidth: layout.contentMaxWidth,
    }),
    [topChrome, chromeHeight, hasTabBar, conRiel, insets.bottom, layout.gutter, layout.contentMaxWidth],
  );

  const hayHeader = Boolean(title || action || below || avisos || onBack);

  return (
    <ScreenLayoutContext.Provider value={valor}>
      <View
        testID={testID}
        style={[styles.contenedor, conRiel && { paddingLeft: Chrome.railWidth + Chrome.railInset }]}
      >
        <AmbientBackground />
        {children}

        {hayHeader && (
          <View
            pointerEvents="box-none"
            onLayout={onChromeLayout}
            style={[styles.chrome, { top: topChrome }]}
          >
            <ContentColumn style={styles.chromeColumna}>
              {(title || action || avisos || onBack) && (
                <Entrar>
                  <GlassBar style={styles.barra}>
                    <View style={styles.barraFila}>
                      {onBack && (
                        <GlassIconButton
                          name={backIcon}
                          diameter={38}
                          size={20}
                          accessibilityLabel="Volver"
                          onPress={onBack}
                        />
                      )}
                      <View style={styles.barraTextos}>
                        {!!title && (
                          <Text style={styles.titulo} numberOfLines={1}>
                            {title}
                          </Text>
                        )}
                        {!!subtitle && (
                          <Text style={styles.subtitulo} numberOfLines={1}>
                            {subtitle}
                          </Text>
                        )}
                      </View>
                      <View style={styles.acciones}>
                        {avisos && <CampanaAvisos />}
                        {action}
                      </View>
                    </View>
                  </GlassBar>
                </Entrar>
              )}
              {/* La banda entra un paso después que la barra: se leen como una sola
                  cosa que se despliega, no como dos que aparecen a la vez. */}
              {below && <Entrar delay={Motion.paso}>{below}</Entrar>}
            </ContentColumn>
          </View>
        )}
      </View>
    </ScreenLayoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  scroll: { flex: 1 },
  columna: { width: "100%", alignSelf: "center" },
  chrome: { position: "absolute", left: 0, right: 0 },
  chromeColumna: { gap: Space.sm },
  barra: { paddingHorizontal: Space.lg, paddingVertical: Space.md, borderRadius: Radius.bar },
  barraFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.md },
  barraTextos: { flex: 1, minWidth: 0 },
  acciones: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  titulo: { fontFamily: "Nunito_800ExtraBold", fontSize: 22, color: Colors.text },
  subtitulo: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: "capitalize",
  },
});

export default Screen;
