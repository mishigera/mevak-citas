/**
 * Las piezas que comparten las secciones del inicio (plan p008): el título de cada
 * sección, la fila de una lista dentro de una tarjeta, el botón pequeño de acción y el
 * "ver N más" que corta las listas largas.
 *
 * Las secciones se escriben con esto y solo con esto para que el tablero se lea como una
 * sola cosa, no como ocho pantallas pegadas.
 */
import React, { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { Entrar, PressableMotion } from "@/components/motion";

type Icono = React.ComponentProps<typeof Ionicons>["name"];

/** Las listas del inicio enseñan esto de entrada; el resto, tras "ver N más". */
export const FILAS_VISIBLES = 5;

export function SeccionInicio({
  titulo,
  detalle,
  children,
  style,
  testID,
}: {
  titulo: string;
  /** A la derecha del título: un contador, una hora, un total. */
  detalle?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Entrar style={[estilos.seccion, style]} testID={testID}>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo} accessibilityRole="header">{titulo}</Text>
        {!!detalle && <Text style={estilos.detalle}>{detalle}</Text>}
      </View>
      {children}
    </Entrar>
  );
}

/** Una tarjeta con filas separadas por una línea fina. */
export function TarjetaLista({ children }: { children?: React.ReactNode }) {
  const filas = React.Children.toArray(children).filter(Boolean);
  return (
    <GlassCard radius={Radius.card}>
      {filas.map((fila, i) => (
        <View key={i} style={i > 0 && estilos.separada}>{fila}</View>
      ))}
    </GlassCard>
  );
}

export function FilaInicio({
  icono,
  color = Colors.primary,
  titulo,
  detalle,
  derecha,
  onPress,
  accessibilityLabel,
}: {
  icono: Icono;
  color?: string;
  titulo: string;
  detalle?: string;
  /** Botones o un dato a la derecha. */
  derecha?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const contenido = (
    <>
      <View style={[estilos.icono, { backgroundColor: color + "1F" }]}>
        <Ionicons name={icono} size={18} color={color} />
      </View>
      <View style={estilos.textos}>
        <Text style={estilos.filaTitulo} numberOfLines={1}>{titulo}</Text>
        {!!detalle && <Text style={estilos.filaDetalle} numberOfLines={2}>{detalle}</Text>}
      </View>
    </>
  );

  return (
    <View style={estilos.fila}>
      {onPress ? (
        <PressableMotion
          gesto="sutil"
          onPress={onPress}
          accessibilityLabel={accessibilityLabel ?? titulo}
          style={estilos.filaPrincipal}
        >
          {contenido}
          {!derecha && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
        </PressableMotion>
      ) : (
        <View style={estilos.filaPrincipal}>{contenido}</View>
      )}
      {derecha && <View style={estilos.derecha}>{derecha}</View>}
    </View>
  );
}

/** El botón pequeño de las tarjetas: "Llegó", "Ver cita", WhatsApp. Tinta de color, no sólido. */
export function AccionChip({
  icono,
  texto,
  color = Colors.primaryDark,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  icono: Icono;
  /** Sin texto es un botón solo de icono: entonces la etiqueta es obligatoria. */
  texto?: string;
  color?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <PressableMotion
      gesto="escala"
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel ?? texto}
      style={[
        estilos.chip,
        !texto && estilos.chipIcono,
        { backgroundColor: color + "1A" },
        disabled && estilos.apagado,
      ]}
    >
      <Ionicons name={icono} size={16} color={color} />
      {!!texto && <Text style={[estilos.chipTexto, { color }]}>{texto}</Text>}
    </PressableMotion>
  );
}

/**
 * Corta una lista a `FILAS_VISIBLES` y ofrece el resto. En el teléfono un tablero de
 * ocho secciones con listas enteras no se acaba nunca (riesgo del plan p008).
 */
export function useVerMas<T>(elementos: T[]) {
  const [abierta, setAbierta] = useState(false);
  const ocultos = abierta ? 0 : Math.max(0, elementos.length - FILAS_VISIBLES);
  return {
    visibles: abierta ? elementos : elementos.slice(0, FILAS_VISIBLES),
    boton: ocultos > 0 ? (
      <PressableMotion
        gesto="sutil"
        onPress={() => setAbierta(true)}
        accessibilityLabel={`Ver ${ocultos} más`}
        style={estilos.verMas}
      >
        <Text style={estilos.verMasTexto}>Ver {ocultos} más</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.primaryDark} />
      </PressableMotion>
    ) : null,
  };
}

/** Texto de apoyo dentro de una sección: "No quedan citas hoy". */
export function NotaInicio({ children }: { children: React.ReactNode }) {
  return (
    <GlassCard radius={Radius.card}>
      <Text style={estilos.nota}>{children}</Text>
    </GlassCard>
  );
}

const estilos = StyleSheet.create({
  seccion: { gap: Space.sm },
  cabecera: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Space.md,
    paddingHorizontal: Space.xs,
  },
  titulo: { fontFamily: "Nunito_800ExtraBold", fontSize: 13, letterSpacing: 0.6, color: Colors.primaryDark, textTransform: "uppercase" },
  detalle: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  separada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.glass.strokeSoft },
  fila: { flexDirection: "row", alignItems: "center", paddingRight: Space.md },
  filaPrincipal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingVertical: Space.md,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    minWidth: 0,
  },
  icono: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  textos: { flex: 1, minWidth: 0, gap: 1 },
  filaTitulo: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  filaDetalle: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },
  derecha: { flexDirection: "row", alignItems: "center", gap: Space.xs },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: Radius.control,
    paddingHorizontal: Space.md,
    paddingVertical: 7,
  },
  chipIcono: { paddingHorizontal: 9 },
  chipTexto: { fontFamily: "Nunito_700Bold", fontSize: 13 },
  apagado: { opacity: 0.5 },

  verMas: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: Space.sm },
  verMasTexto: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primaryDark },

  nota: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.textSecondary, padding: Space.lg, textAlign: "center" },
});
