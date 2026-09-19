import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard } from "@/components/glass";
import { Entrar, PressableMotion, Stagger } from "@/components/motion";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { alerta } from "@/lib/alerta";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function PendingPaymentsScreen() {
  const qc = useQueryClient();

  const { data: pending, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/payments/pending-facialist"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/payments/pending-facialist", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<any[]>;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("PATCH", `/api/payments/${paymentId}/facialist-paid`, { paid: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payments/pending-facialist"] });
      refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => alerta("Error", err.message),
  });

  const total = (pending || []).reduce((s, p) => s + p.facialistNetAmount, 0);

  return (
    <Screen
      title="Pagos pendientes"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
    >
      <ScreenScroll contentStyle={styles.columna}>
        {(pending || []).length > 0 && (
          <Entrar>
            <GlassCard radius={Radius.card} tone="soft" style={styles.total}>
              <View style={styles.totalInterior}>
                <Text style={styles.totalEtiqueta}>Total pendiente</Text>
                <Text style={styles.totalCantidad}>${total}</Text>
              </View>
            </GlassCard>
          </Entrar>
        )}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : !pending?.length ? (
          <EstadoVacio
            icono="checkmark-circle-outline"
            titulo="Todo al día"
            texto="No hay pagos pendientes a facialistas"
          />
        ) : (
          <Stagger style={styles.lista}>
            {pending.map((p) => (
              <GlassCard key={p.id} radius={Radius.card}>
                <View style={styles.fila}>
                  <View style={styles.info}>
                    <Text style={styles.cliente}>{p.client?.fullName}</Text>
                    <Text style={styles.staff}>{p.staff?.name}</Text>
                    <Text style={styles.fecha}>{formatDate(p.createdAt)}</Text>
                  </View>
                  <View style={styles.derecha}>
                    <Text style={styles.cantidad}>${p.facialistNetAmount}</Text>
                    <PressableMotion
                      gesto="elevar"
                      accessibilityLabel={`Pagar a ${p.staff?.name ?? "la facialista"}`}
                      style={styles.botonPagar}
                      disabled={markPaidMutation.isPending}
                      onPress={() => {
                        alerta("Confirmar pago", `¿Marcar como pagado a ${p.staff?.name}?`, [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Confirmar", onPress: () => markPaidMutation.mutate(p.id) },
                        ]);
                      }}
                    >
                      <Text style={styles.botonPagarTexto}>Pagar</Text>
                    </PressableMotion>
                  </View>
                </View>
              </GlassCard>
            ))}
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.lg },
  lista: { gap: Space.md - 2 },
  total: { borderColor: Colors.success + "40" },
  totalInterior: { padding: Space.lg },
  totalEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.success },
  totalCantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 28, color: Colors.success },
  fila: { flexDirection: "row", alignItems: "center", padding: Space.lg - 2, gap: Space.md - 2 },
  info: { flex: 1, gap: 2 },
  cliente: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  staff: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  fecha: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  derecha: { alignItems: "flex-end", gap: Space.sm },
  cantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.text },
  botonPagar: {
    backgroundColor: Colors.success,
    borderRadius: Radius.control,
    paddingHorizontal: Space.lg - 2,
    paddingVertical: Space.sm,
  },
  botonPagarTexto: { fontFamily: "Nunito_700Bold", fontSize: 13, color: "#fff" },
});
