/**
 * Los tres ladrillos que repetían a mano las diez pantallas con formulario: el campo,
 * el botón de guardar y el panel que los envuelve.
 *
 * ⚠️ **El campo NO usa `GlassSurface`.** Las capas de vidrio son `position: absolute` y
 * react-native-web deja los `<input>` en `position: static`, así que el texto de un
 * campo acaba debajo del desenfoque y se lee como un borrón gris. `GlassSurface` lo
 * resuelve con `zIndex: -1`, pero aquí no hace falta correr ese riesgo: un campo se lee
 * mejor sobre un relleno casi opaco, y encima ahorra un `backdrop-filter` por campo en
 * formularios de seis campos. Ver `convenciones.md`.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Curva, Motion } from "@/constants/motion";
import { estiloWebTexto, ms, usaCSS } from "@/lib/motion";
import { GlassCard } from "@/components/glass";
import { Entrar, PressableMotion } from "@/components/motion";

const web = StyleSheet.create({
  campo: estiloWebTexto({
    transitionProperty: "border-color, background-color, box-shadow",
    transitionDuration: ms(Motion.micro),
    transitionTimingFunction: Curva.suave,
  }),
});

export function CampoTexto({
  etiqueta,
  style,
  estiloCampo,
  ...props
}: Omit<TextInputProps, "style"> & {
  etiqueta?: string;
  /** Estilo del contenedor (el hueco que ocupa el campo en el formulario). */
  style?: StyleProp<ViewStyle>;
  /** Estilo del propio campo. */
  estiloCampo?: StyleProp<TextStyle>;
}) {
  const [enfocado, setEnfocado] = useState(false);

  return (
    <View style={[estilos.campoContenedor, style]}>
      {!!etiqueta && <Text style={estilos.etiqueta}>{etiqueta}</Text>}
      <TextInput
        placeholderTextColor={Colors.textMuted}
        {...props}
        onFocus={(e) => {
          setEnfocado(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setEnfocado(false);
          props.onBlur?.(e);
        }}
        style={[
          estilos.campo,
          usaCSS && web.campo,
          enfocado && estilos.campoEnfocado,
          estiloCampo,
        ]}
      />
    </View>
  );
}

export function BotonPrimario({
  titulo,
  onPress,
  cargando,
  disabled,
  icono,
  style,
  testID,
}: {
  titulo: string;
  onPress: () => void;
  cargando?: boolean;
  disabled?: boolean;
  icono?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const apagado = disabled || cargando;
  return (
    <PressableMotion
      gesto="elevar"
      onPress={onPress}
      disabled={apagado}
      accessibilityLabel={titulo}
      testID={testID}
      style={[estilos.boton, apagado && estilos.botonApagado, style]}
    >
      {cargando ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={estilos.botonFila}>
          {icono}
          <Text style={estilos.botonTexto}>{titulo}</Text>
        </View>
      )}
    </PressableMotion>
  );
}

/**
 * El panel de un formulario que se despliega. Entra con el escalonado de sus campos:
 * la cabecera primero y los campos detrás, que es como se lee "se acaba de abrir esto".
 */
export function PanelFormulario({
  titulo,
  children,
  style,
  testID,
}: {
  titulo?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Entrar style={style} testID={testID}>
      <GlassCard radius={Radius.panel} style={estilos.panel}>
        <View style={estilos.panelInterior}>
          {!!titulo && <Text style={estilos.panelTitulo}>{titulo}</Text>}
          {children}
        </View>
      </GlassCard>
    </Entrar>
  );
}

const estilos = StyleSheet.create({
  campoContenedor: { gap: 6 },
  etiqueta: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: Space.xs,
  },
  campo: {
    backgroundColor: Colors.glass.fillSolidStrong,
    borderRadius: Radius.tile,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md - 2,
    borderWidth: 1,
    borderColor: Colors.glass.strokeSoft,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  campoEnfocado: { borderColor: Colors.primary, backgroundColor: "#fff" },

  boton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  botonApagado: { opacity: 0.5 },
  botonFila: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  botonTexto: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },

  panel: { width: "100%" },
  panelInterior: { padding: Space.lg, gap: Space.md },
  panelTitulo: { fontFamily: "Nunito_800ExtraBold", fontSize: 15, color: Colors.text },
});
