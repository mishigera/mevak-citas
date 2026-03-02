import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function PendingPaymentsScreen() {
  const insets = useSafeAreaInsets();
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
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const total = (pending || []).reduce((s, p) => s + p.facialistNetAmount, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Pagos pendientes</Text>
        <View style={{ width: 24 }} />
      </View>

      {(pending || []).length > 0 && (
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total pendiente</Text>
          <Text style={styles.totalAmount}>${total}</Text>
        </View>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : !pending?.length ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            <Text style={styles.emptyTitle}>Todo al día</Text>
            <Text style={styles.emptyText}>No hay pagos pendientes a facialistas</Text>
          </View>
        ) : (
          <View style={styles.paymentList}>
            {pending.map((p) => (
              <View key={p.id} style={styles.paymentCard}>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentClient}>{p.client?.fullName}</Text>
                  <Text style={styles.paymentStaff}>{p.staff?.name}</Text>
                  <Text style={styles.paymentDate}>{formatDate(p.createdAt)}</Text>
                </View>
                <View style={styles.paymentRight}>
                  <Text style={styles.paymentAmount}>${p.facialistNetAmount}</Text>
                  <Pressable
                    style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                      Alert.alert("Confirmar pago", `¿Marcar como pagado a ${p.staff?.name}?`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Confirmar", onPress: () => markPaidMutation.mutate(p.id) },
                      ]);
                    }}
                    disabled={markPaidMutation.isPending}
                  >
                    <Text style={styles.payBtnText}>Pagar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  totalCard: { backgroundColor: Colors.success + "18", marginHorizontal: 16, marginBottom: 16, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.success + "40" },
  totalLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.success },
  totalAmount: { fontFamily: "Nunito_800ExtraBold", fontSize: 28, color: Colors.success },
  list: { flex: 1 },
  paymentList: { paddingHorizontal: 16, gap: 10 },
  paymentCard: { backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  paymentInfo: { flex: 1, gap: 2 },
  paymentClient: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  paymentStaff: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  paymentDate: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  paymentRight: { alignItems: "flex-end", gap: 8 },
  paymentAmount: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.text },
  payBtn: { backgroundColor: Colors.success, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  payBtnText: { fontFamily: "Nunito_700Bold", fontSize: 13, color: "#fff" },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary },
});
