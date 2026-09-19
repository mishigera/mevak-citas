/**
 * Cómo va el día (plan p008, sección 3): cuántas citas, cuántas atendidas, cuántas
 * faltan. A la dueña, además, lo cobrado y cómo; recepción no ve dinero agregado
 * (`dominio.md`). Lo de la facialista entra por `children` (fase D).
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { dinero, type ResumenDia } from "@/lib/inicio";
import { AccionChip, SeccionInicio } from "./SeccionInicio";

export type CajaDia = {
  total: number;
  count: number;
  porMetodo?: { CASH?: number; CARD?: number; INCLUDED?: number };
};

function Cifra({ valor, texto, color = Colors.text }: { valor: number; texto: string; color?: string }) {
  return (
    <GlassCard radius={Radius.tile} style={estilos.cifra}>
      <View style={estilos.cifraDentro} accessible accessibilityLabel={`${texto}: ${valor}`}>
        <Text style={[estilos.cifraValor, { color }]}>{valor}</Text>
        <Text style={estilos.cifraTexto} numberOfLines={1}>{texto}</Text>
      </View>
    </GlassCard>
  );
}

export function ResumenHoy({
  resumen,
  caja,
  onVerCorte,
  children,
}: {
  resumen: ResumenDia;
  /** Solo la dueña. `undefined` mientras carga o si no le toca. */
  caja?: CajaDia;
  onVerCorte?: () => void;
  children?: React.ReactNode;
}) {
  if (resumen.total === 0 && !caja?.count && !children) return null;

  const efectivo = caja?.porMetodo?.CASH ?? 0;
  const tarjeta = caja?.porMetodo?.CARD ?? 0;

  return (
    <SeccionInicio
      titulo="Hoy"
      detalle={resumen.noLlegaron > 0 ? `${resumen.noLlegaron} no ${resumen.noLlegaron === 1 ? "llegó" : "llegaron"}` : undefined}
      testID="inicio-resumen"
    >
      <View style={estilos.cifras}>
        <Cifra valor={resumen.total} texto={resumen.total === 1 ? "Cita" : "Citas"} />
        <Cifra valor={resumen.atendidas} texto={resumen.atendidas === 1 ? "Atendida" : "Atendidas"} color={Colors.success} />
        <Cifra valor={resumen.porAtender} texto="Por atender" color={Colors.primaryDark} />
      </View>

      {caja && (
        <GlassCard radius={Radius.card} testID="inicio-caja">
          <View style={estilos.caja}>
            <View style={estilos.cajaTextos}>
              <Text style={estilos.cajaEtiqueta}>Cobrado hoy</Text>
              <Text style={estilos.cajaTotal}>{dinero(caja.total)}</Text>
              <Text style={estilos.cajaDesglose}>
                Efectivo {dinero(efectivo)} · Tarjeta {dinero(tarjeta)}
              </Text>
            </View>
            {onVerCorte && (
              <AccionChip icono="receipt-outline" texto="Corte" accessibilityLabel="Ver el corte de caja" onPress={onVerCorte} />
            )}
          </View>
        </GlassCard>
      )}

      {children}
    </SeccionInicio>
  );
}

const estilos = StyleSheet.create({
  cifras: { flexDirection: "row", gap: Space.sm },
  cifra: { flex: 1 },
  cifraDentro: { alignItems: "center", paddingVertical: Space.md, paddingHorizontal: Space.xs },
  cifraValor: { fontFamily: "Nunito_800ExtraBold", fontSize: 24 },
  cifraTexto: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  caja: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg },
  cajaTextos: { flex: 1, minWidth: 0 },
  cajaEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  cajaTotal: { fontFamily: "Nunito_800ExtraBold", fontSize: 26, color: Colors.text },
  cajaDesglose: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
});
