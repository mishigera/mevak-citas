import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSurface } from "@/components/glass";
import { Stagger } from "@/components/motion";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function monthName(month: number) {
  return new Date(2024, month - 1, 1).toLocaleString("es-MX", { month: "long" });
}

export default function ReportsScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/income", month, year],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/reports/income?month=${month}&year=${year}`, base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<any>;
    },
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <Screen
      title="Reporte de ingresos"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      below={
        <GlassSurface radius={Radius.control} style={styles.navMes}>
          <GlassIconButton name="chevron-back" diameter={36} size={20} accessibilityLabel="Mes anterior" onPress={prevMonth} />
          <Text style={styles.mesEtiqueta}>
            {monthName(month)} {year}
          </Text>
          <GlassIconButton name="chevron-forward" diameter={36} size={20} accessibilityLabel="Mes siguiente" onPress={nextMonth} />
        </GlassSurface>
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {isLoading ? (
          <CargandoLista filas={2} />
        ) : (
          /* La clave del mes hace que las cifras vuelvan a entrar al cambiar de mes:
             el nodo no se destruye solo, hay que recrearlo para relanzar la entrada. */
          <Stagger key={`${year}-${month}`} style={styles.columna}>
            <View style={styles.tarjetaPrincipal}>
              <Text style={styles.principalEtiqueta}>Ingreso total</Text>
              <Text style={styles.principalCantidad}>${data?.total || 0}</Text>
              <Text style={styles.principalCuenta}>{data?.count || 0} pagos registrados</Text>
            </View>

            <View style={styles.reparto}>
              <GlassCard radius={Radius.card} style={[styles.repartoTarjeta, { borderColor: Colors.primary + "40" }]}>
                <View style={styles.repartoInterior}>
                  <View style={[styles.repartoIcono, { backgroundColor: Colors.primary + "18" }]}>
                    <Ionicons name="flower-outline" size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.repartoEtiqueta}>Owner / Laserista</Text>
                  <Text style={[styles.repartoCantidad, { color: Colors.primary }]}>${data?.ownerNet || 0}</Text>
                </View>
              </GlassCard>
              <GlassCard radius={Radius.card} style={[styles.repartoTarjeta, { borderColor: Colors.accent + "40" }]}>
                <View style={styles.repartoInterior}>
                  <View style={[styles.repartoIcono, { backgroundColor: Colors.accent + "18" }]}>
                    <Ionicons name="sparkles-outline" size={22} color={Colors.accent} />
                  </View>
                  <Text style={styles.repartoEtiqueta}>Facialistas</Text>
                  <Text style={[styles.repartoCantidad, { color: Colors.accent }]}>${data?.facialistNet || 0}</Text>
                </View>
              </GlassCard>
            </View>

            {(!data || data.count === 0) && (
              <EstadoVacio
                icono="bar-chart-outline"
                titulo="Sin datos"
                texto={`No hay pagos registrados en ${monthName(month)} ${year}`}
              />
            )}
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.lg },
  navMes: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  mesEtiqueta: {
    flex: 1,
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    color: Colors.text,
    textTransform: "capitalize",
    textAlign: "center",
  },
  tarjetaPrincipal: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.panel,
    padding: Space.xl,
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  principalEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)" },
  principalCantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 48, color: "#fff", marginVertical: 4 },
  principalCuenta: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },
  reparto: { flexDirection: "row", gap: Space.md },
  repartoTarjeta: { flex: 1 },
  repartoInterior: { padding: Space.lg, alignItems: "center", gap: Space.sm },
  repartoIcono: { width: 44, height: 44, borderRadius: Radius.tile, justifyContent: "center", alignItems: "center" },
  repartoEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  repartoCantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 24 },
});
