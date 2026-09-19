/**
 * La pantalla que se ve cuando algo revienta. Era la plantilla en inglés de Expo, con
 * su modo oscuro y sus azules de iOS; ahora habla español y usa el mismo vidrio que el
 * resto de la app.
 *
 * Dos cosas la hacen distinta de cualquier otra pantalla, y condicionan lo que puede
 * usar:
 *
 *  - **Se pinta por encima de todo lo demás.** `ErrorBoundary` envuelve al
 *    `SafeAreaProvider` (`app/_layout.tsx:71`), así que aquí no hay insets que leer:
 *    `useSafeAreaInsets()` fuera de su proveedor es justamente otra excepción que
 *    saltaría dentro del manejador de excepciones. Por eso el contenido va centrado y
 *    el botón de detalle se coloca con margen fijo, sin preguntarle nada al sistema.
 *  - **El fallo puede venir del router.** `GlassPopover` cierra al navegar y para eso
 *    lee la ruta; lo hace de forma tolerante (ver `useRutaSegura`), que es lo que
 *    permite usarlo aquí.
 *
 * El detalle del error sigue siendo solo de desarrollo: en producción no se le enseña
 * una traza de pila a la dueña del centro.
 */
import React, { useState } from "react";
import { reloadAppAsync } from "expo";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { AmbientBackground } from "@/components/AmbientBackground";
import { GlassCard, GlassIconButton, GlassPopover } from "@/components/glass";
import { Entrar, Flotar, PressableMotion, Stagger } from "@/components/motion";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [verDetalle, setVerDetalle] = useState(false);

  const reiniciar = async () => {
    try {
      await reloadAppAsync();
    } catch (fallo) {
      // Si ni siquiera se puede recargar, al menos se intenta volver a montar el árbol.
      console.error("No se pudo reiniciar la app:", fallo);
      resetError();
    }
  };

  const detalle = error.stack ? `${error.message}\n\n${error.stack}` : error.message;

  const fuenteMono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

  return (
    <View style={estilos.contenedor}>
      <AmbientBackground />

      {__DEV__ ? (
        <View style={estilos.esquina}>
          <GlassIconButton
            name="bug-outline"
            onPress={() => setVerDetalle(true)}
            accessibilityLabel="Ver detalle del error"
            accessibilityHasPopup
            accessibilityState={{ expanded: verDetalle }}
          />
        </View>
      ) : null}

      <Entrar style={estilos.centro}>
        <GlassCard tone="pink" radius={Radius.panel} elevation="lifted" style={estilos.tarjeta}>
          <Stagger style={estilos.pila}>
            <Flotar style={estilos.icono}>
              <Ionicons name="heart-dislike-outline" size={44} color={Colors.primary} />
            </Flotar>

            <Text style={estilos.titulo}>Algo se ha roto</Text>

            <Text style={estilos.mensaje}>
              No es culpa tuya. Vuelve a cargar la app y sigue donde lo dejaste.
            </Text>

            <PressableMotion onPress={reiniciar} gesto="elevar" style={estilos.boton}>
              <View style={estilos.botonFondo}>
                <Text style={estilos.botonTexto}>Volver a cargar</Text>
              </View>
            </PressableMotion>
          </Stagger>
        </GlassCard>
      </Entrar>

      {__DEV__ ? (
        <GlassPopover
          visible={verDetalle}
          onClose={() => setVerDetalle(false)}
          titulo="Detalle del error"
          origen="arriba-derecha"
          style={estilos.panel}
          testID="panel-error"
        >
          <ScrollView style={estilos.scroll} contentContainerStyle={estilos.scrollContenido}>
            <Text style={[estilos.traza, { fontFamily: fuenteMono }]} selectable>
              {detalle}
            </Text>
          </ScrollView>
        </GlassPopover>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, width: "100%", height: "100%", backgroundColor: Colors.ambient.top },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", padding: Space.xl },
  tarjeta: { width: "100%", maxWidth: 420, padding: Space.xl },
  pila: { alignItems: "center", gap: Space.md },
  icono: { marginBottom: Space.xs },
  titulo: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  mensaje: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  boton: { borderRadius: Radius.control, marginTop: Space.sm },
  botonFondo: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
    minWidth: 200,
    alignItems: "center",
  },
  botonTexto: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  esquina: { position: "absolute", top: 44, right: Space.lg, zIndex: 20 },
  panel: { top: 44, right: Space.lg, left: Space.lg, maxHeight: "70%" },
  scroll: { maxHeight: 360 },
  scrollContenido: { paddingHorizontal: Space.lg, paddingBottom: Space.lg },
  traza: { fontSize: 12, lineHeight: 18, color: Colors.text },
});

export default ErrorFallback;
