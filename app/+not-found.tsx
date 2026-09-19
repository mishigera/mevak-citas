/**
 * La ruta que no existe. Era la plantilla en inglés de Expo sobre fondo blanco; ahora
 * usa el mismo andamio, el mismo vidrio y el mismo movimiento que el resto de la app,
 * y habla en español como manda la convención.
 */
import { Link, Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Colors } from "@/constants/colors";
import { Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { EstadoVacio } from "@/components/Estados";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <Screen title="Página no encontrada" hasTabBar={false}>
        <ScreenScroll>
          <EstadoVacio
            icono="compass-outline"
            titulo="Esta pantalla no existe."
            texto="El enlace que has abierto no lleva a ninguna parte de la app."
            accion={
              <Link href="/" style={styles.enlace}>
                <Text style={styles.enlaceTexto}>Volver al inicio</Text>
              </Link>
            }
          />
        </ScreenScroll>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  enlace: { marginTop: Space.md, paddingVertical: Space.md },
  enlaceTexto: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.primary },
});
