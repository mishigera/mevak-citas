/**
 * La navegación de pestañas, en vidrio y adaptada al ancho.
 *
 *  - celular / iPad vertical: píldora flotante abajo, centrada y con ancho tope, para
 *    que en pantalla ancha no se repartan cuatro iconos a lo largo de 1000 px.
 *  - iPad apaisado: riel vertical a la izquierda. Es lo que hace que el iPad deje de
 *    parecer un celular estirado.
 *
 * Se pasa como `tabBar` a `<Tabs>`. React Navigation no trae barra lateral, y con un
 * `tabBar` propio se controla forma, posición y estados sin pelearse con `tabBarStyle`.
 *
 * Los iconos y los títulos salen de los `descriptors`, es decir de las `<Tabs.Screen>`
 * de `app/(tabs)/_layout.tsx`: no se duplican aquí.
 */
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { Blur, Chrome, Radius, Space } from "@/constants/theme";
import { Curva, Motion } from "@/constants/motion";
import { estiloWebTexto, ms, usaCSS } from "@/lib/motion";
import { useBreakpoint } from "@/lib/responsive";
import { GlassSurface, PulgarDeslizante } from "@/components/glass";
import { Pop, PressableMotion } from "@/components/motion";

/**
 * Subconjunto de `BottomTabBarProps` de React Navigation. Se declara aquí en vez de
 * importarlo porque `@react-navigation/bottom-tabs` es dependencia transitiva de
 * expo-router, no directa del proyecto.
 */
export type GlassTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => React.ReactNode;
      };
    }
  >;
  navigation: {
    navigate: (name: string) => void;
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
  };
};

export function GlassTabBar({ state, descriptors, navigation }: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const { hasSideRail } = useBreakpoint();
  // El pulgar se desliza en píxeles, así que hay que saber cuánto mide el carril.
  const [carril, setCarril] = useState(0);

  const medirCarril = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      const medida = hasSideRail ? height : width;
      setCarril((prev) => (Math.abs(prev - medida) < 1 ? prev : medida));
    },
    [hasSideRail],
  );

  const items = state.routes.map((route, index) => {
    const { options } = descriptors[route.key] ?? { options: {} };
    const focused = state.index === index;
    const color = focused ? Colors.primaryDark : Colors.textMuted;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        Haptics.selectionAsync();
        navigation.navigate(route.name);
      }
    };

    return (
      <PressableMotion
        key={route.key}
        onPress={onPress}
        gesto="sutil"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options.title ?? route.name}
        style={hasSideRail ? styles.itemRiel : styles.itemPildora}
      >
        {/* Al volverse activo el icono vuelve a montarse, y con el remontaje se
            repite su `pop`. Es el mismo truco de la insignia: recrear el nodo. */}
        <Pop key={focused ? "activo" : "inactivo"}>
          {options.tabBarIcon?.({ focused, color, size: 22 })}
        </Pop>
        <Text style={[styles.etiqueta, usaCSS && styles.etiquetaTransicion, { color }]} numberOfLines={1}>
          {options.title ?? route.name}
        </Text>
      </PressableMotion>
    );
  });

  // El bloque de vidrio de la pestaña activa ya no aparece y desaparece: se desliza.
  const pulgar = (
    <PulgarDeslizante
      indice={state.index}
      total={state.routes.length}
      longitud={carril}
      vertical={hasSideRail}
      radius={hasSideRail ? Radius.tile : Radius.control}
      testID="pulgar-pestanas"
    />
  );

  if (hasSideRail) {
    return (
      <GlassSurface
        tone="strong"
        intensity={Blur.bar}
        radius={Radius.panel}
        elevation="lifted"
        testID="glass-tab-rail"
        style={[
          styles.riel,
          { top: insets.top + Chrome.railInset, bottom: insets.bottom + Chrome.railInset },
        ]}
      >
        <View style={styles.rielContenido} onLayout={medirCarril}>
          {pulgar}
          {items}
        </View>
      </GlassSurface>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.pildoraCapa, { bottom: insets.bottom + Chrome.tabBarInset }]}>
      <GlassSurface
        tone="strong"
        intensity={Blur.bar}
        radius={Radius.bar}
        elevation="lifted"
        testID="glass-tab-bar"
        style={styles.pildora}
      >
        <View style={styles.pildoraContenido} onLayout={medirCarril}>
          {pulgar}
          {items}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pildora flotante (celular e iPad vertical).
  pildoraCapa: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  // El relleno vive en el contenedor y NO en el carril: `onLayout` mide la caja
  // entera, y con relleno dentro el pulgar saldría 4 px corrido y algo más ancho
  // que la celda que tiene que tapar.
  pildora: { width: "100%", maxWidth: 440, marginHorizontal: Space.lg, padding: Space.xs },
  pildoraContenido: { flexDirection: "row", alignItems: "center", position: "relative" },
  itemPildora: {
    flex: 1,
    height: Chrome.tabBar - Space.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: Radius.control,
  },

  // Riel vertical (iPad apaisado).
  riel: { position: "absolute", left: Chrome.railInset, width: Chrome.railWidth, padding: Space.sm },
  // Sin `gap` y sin `justifyContent`: el pulgar se coloca por celdas iguales, y un
  // hueco entre ellas o un centrado vertical descuadraría la cuenta.
  rielContenido: { flex: 1, position: "relative" },
  itemRiel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: Radius.tile,
  },

  etiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 11 },
  etiquetaTransicion: estiloWebTexto({
    transitionProperty: "color",
    transitionDuration: ms(Motion.micro),
    transitionTimingFunction: Curva.suave,
  }),
});

export default GlassTabBar;
