import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function monthName(month: number) {
  return new Date(2024, month - 1, 1).toLocaleString("es-MX", { month: "long" });
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Reporte de ingresos</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.monthNav}>
        <Pressable onPress={prevMonth} hitSlop={16}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthName(month)} {year}</Text>
        <Pressable onPress={nextMonth} hitSlop={16}>
          <Ionicons name="chevron-forward" size={24} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : (
          <>
            <View style={styles.mainCard}>
              <Text style={styles.mainCardLabel}>Ingreso total</Text>
              <Text style={styles.mainCardAmount}>${data?.total || 0}</Text>
              <Text style={styles.mainCardCount}>{data?.count || 0} pagos registrados</Text>
            </View>

            <View style={styles.splitRow}>
              <View style={[styles.splitCard, { borderColor: Colors.primary + "40" }]}>
                <View style={[styles.splitIcon, { backgroundColor: Colors.primary + "18" }]}>
                  <Ionicons name="flower-outline" size={22} color={Colors.primary} />
                </View>
                <Text style={styles.splitLabel}>Owner / Laserista</Text>
                <Text style={[styles.splitAmount, { color: Colors.primary }]}>${data?.ownerNet || 0}</Text>
              </View>
              <View style={[styles.splitCard, { borderColor: Colors.accent + "40" }]}>
                <View style={[styles.splitIcon, { backgroundColor: Colors.accent + "18" }]}>
                  <Ionicons name="sparkles-outline" size={22} color={Colors.accent} />
                </View>
                <Text style={styles.splitLabel}>Facialistas</Text>
                <Text style={[styles.splitAmount, { color: Colors.accent }]}>${data?.facialistNet || 0}</Text>
              </View>
            </View>

            {(!data || data.count === 0) && (
              <View style={styles.empty}>
                <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Sin datos</Text>
                <Text style={styles.emptyText}>No hay pagos registrados en {monthName(month)} {year}</Text>
              </View>
            )}
          </>
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
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 20 },
  monthLabel: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text, textTransform: "capitalize", minWidth: 160, textAlign: "center" },
  content: { flex: 1, paddingHorizontal: 16 },
  mainCard: { backgroundColor: Colors.primary, borderRadius: 20, padding: 24, marginBottom: 16, alignItems: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  mainCardLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)" },
  mainCardAmount: { fontFamily: "Nunito_800ExtraBold", fontSize: 48, color: "#fff", marginVertical: 4 },
  mainCardCount: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },
  splitRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  splitCard: { flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 16, alignItems: "center", gap: 8, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  splitIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  splitLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  splitAmount: { fontFamily: "Nunito_800ExtraBold", fontSize: 24 },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
});
