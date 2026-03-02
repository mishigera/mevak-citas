import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import * as Haptics from "expo-haptics";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function getRoleLabel(role: string) {
  const map: Record<string, string> = { ADMIN: "Admin", OWNER: "Owner", RECEPTION: "Recepción", FACIALIST: "Facialista" };
  return map[role] || role;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    SCHEDULED: "Agendada",
    ARRIVED: "Llegó",
    NO_SHOW: "No llegó",
    DONE: "Terminada",
    CANCELLED: "Cancelada",
  };
  const color = Colors.statusColors[status as keyof typeof Colors.statusColors] || Colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
      <Text style={[styles.badgeText, { color }]}>{labels[status] || status}</Text>
    </View>
  );
}

function AppointmentCard({ appt, onPress }: { appt: any; onPress: () => void }) {
  const typeColor = appt.type === "LASER" ? Colors.secondary : Colors.accent;
  return (
    <Pressable
      style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
    >
      <View style={[styles.typeBar, { backgroundColor: typeColor }]} />
      <View style={styles.apptContent}>
        <View style={styles.apptHeader}>
          <Text style={styles.apptTime}>{formatTime(appt.dateTimeStart)} – {formatTime(appt.dateTimeEnd)}</Text>
          <StatusBadge status={appt.status} />
        </View>
        <Text style={styles.apptClient}>{appt.client?.fullName || "Cliente"}</Text>
        <View style={styles.apptMeta}>
          <View style={[styles.typePill, { backgroundColor: typeColor + "25" }]}>
            <Text style={[styles.typePillText, { color: typeColor }]}>{appt.type}</Text>
          </View>
          {appt.staff && (
            <Text style={styles.apptStaff}>
              <Ionicons name="person-outline" size={11} color={Colors.textMuted} /> {appt.staff.name}
            </Text>
          )}
        </View>
        {appt.services && appt.services.length > 0 && (
          <Text style={styles.apptServices} numberOfLines={1}>
            {appt.services.map((s: any) => s?.name).join(", ")}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOwnerOrAdmin } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: appointments, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/appointments", "today"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${todayStr()}`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar citas");
      return res.json() as Promise<any[]>;
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const myAppts = appointments?.filter((a) =>
    isOwnerOrAdmin ? true : a.staffId === user?.id
  ) ?? [];

  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(" ")[0]} 👋</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.newApptBtn, pressed && { opacity: 0.8 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/appointment/new"); }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Citas de hoy</Text>
          <Text style={styles.apptCount}>{myAppts.length} cita{myAppts.length !== 1 ? "s" : ""}</Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : myAppts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin citas hoy</Text>
            <Text style={styles.emptyText}>Toca + para agregar una cita</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {myAppts.map((a) => (
              <AppointmentCard
                key={a.id}
                appt={a}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/appointment/${a.id}`); }}
              />
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: { fontFamily: "Nunito_800ExtraBold", fontSize: 22, color: Colors.text },
  date: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2, textTransform: "capitalize" },
  newApptBtn: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scroll: { flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontFamily: "Nunito_700Bold", fontSize: 17, color: Colors.text },
  apptCount: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textMuted },
  list: { paddingHorizontal: 16, gap: 10 },
  apptCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    paddingRight: 14,
  },
  typeBar: { width: 4, height: "100%", minHeight: 80 },
  apptContent: { flex: 1, paddingVertical: 14, paddingLeft: 14, paddingRight: 8, gap: 4 },
  apptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  apptTime: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.text },
  apptClient: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  apptMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  typePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptStaff: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  apptServices: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary },
});
