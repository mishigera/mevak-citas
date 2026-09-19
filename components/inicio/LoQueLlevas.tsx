/**
 * Lo que lleva ganado la facialista, dentro de "Hoy" (plan p008, sección 7). Solo lo
 * suyo: su mitad de cada facial que atendió, y lo que la dueña aún no le ha liquidado.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { dinero } from "@/lib/inicio";

/** Lo que devuelve `GET /api/payments/mine`. */
export type MisGanancias = { hoy: number; cobrosHoy: number; semana: number; pendiente: number };

function Dato({ etiqueta, valor, detalle, color = Colors.text }: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  color?: string;
}) {
  return (
    <View style={estilos.dato} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Text style={[estilos.valor, { color }]}>{valor}</Text>
      {!!detalle && <Text style={estilos.detalle}>{detalle}</Text>}
    </View>
  );
}

export function LoQueLlevas({ datos }: { datos: MisGanancias }) {
  return (
    <GlassCard radius={Radius.card} testID="inicio-lo-que-llevas">
      <View style={estilos.fila}>
        <Dato
          etiqueta="Hoy"
          valor={dinero(datos.hoy)}
          detalle={`${datos.cobrosHoy} ${datos.cobrosHoy === 1 ? "cobro" : "cobros"}`}
        />
        <View style={estilos.separador} />
        <Dato etiqueta="Esta semana" valor={dinero(datos.semana)} />
        <View style={estilos.separador} />
        <Dato
          etiqueta="Por liquidarte"
          valor={dinero(datos.pendiente)}
          color={datos.pendiente > 0 ? Colors.primaryDark : Colors.textMuted}
        />
      </View>
    </GlassCard>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "stretch", padding: Space.lg },
  dato: { flex: 1, alignItems: "center", gap: 2 },
  separador: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.glass.strokeSoft, marginHorizontal: Space.sm },
  etiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  valor: { fontFamily: "Nunito_800ExtraBold", fontSize: 20 },
  detalle: { fontFamily: "Nunito_400Regular", fontSize: 11, color: Colors.textSecondary },
});
