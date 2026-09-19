/**
 * Los dos estados que toda lista tiene y que antes cada pantalla resolvía a su manera:
 * "cargando" y "no hay nada".
 *
 * Cargando ya no es una ruedita centrada en una pantalla vacía, sino la forma de lo que
 * va a aparecer, barriéndose. Vacío ya no es un icono apagado, sino un icono que flota
 * despacio y una frase que dice qué hacer.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Space } from "@/constants/theme";
import { Entrar, Flotar } from "@/components/motion";
import { ShimmerTarjeta } from "@/components/motion/Shimmer";

/** El hueco de una lista que está llegando. */
export function CargandoLista({ filas = 3, testID }: { filas?: number; testID?: string }) {
  return (
    <View style={estilos.cargando} testID={testID}>
      {Array.from({ length: filas }).map((_, i) => (
        <ShimmerTarjeta key={i} lineas={i % 2 === 0 ? 2 : 1} />
      ))}
    </View>
  );
}

export function EstadoVacio({
  icono = "sparkles-outline",
  titulo,
  texto,
  accion,
  testID,
}: {
  icono?: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  texto?: string;
  accion?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Entrar style={estilos.vacio} testID={testID}>
      <Flotar>
        <Ionicons name={icono} size={44} color={Colors.primary} />
      </Flotar>
      <Text style={estilos.titulo}>{titulo}</Text>
      {!!texto && <Text style={estilos.texto}>{texto}</Text>}
      {accion}
    </Entrar>
  );
}

const estilos = StyleSheet.create({
  cargando: { gap: Space.md },
  vacio: { alignItems: "center", gap: Space.sm, paddingVertical: 48 },
  titulo: { fontFamily: "Nunito_800ExtraBold", fontSize: 16, color: Colors.text, marginTop: Space.sm },
  texto: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
