import React, { useCallback, useState, useMemo } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import * as Haptics from "expo-haptics";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function dateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  ARRIVED: "Llegó",
  NO_SHOW: "No llegó",
  DONE: "Terminada",
  CANCELLED: "Cancelada",
};

function StatusBadge({ status }: { status: string }) {
  const color = Colors.statusColors[status as keyof typeof Colors.statusColors] || Colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "44" }]}>
      <Text style={[styles.badgeText, { color }]}>{STATUS_LABELS[status] || status}</Text>
    </View>
  );
}

function AppointmentCard({ appt, onPress }: { appt: any; onPress: () => void }) {
  const typeColor = appt.type === "LASER" ? Colors.secondary : Colors.accent;
  return (
    <Pressable
      style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={styles.apptLeft}>
        <Text style={styles.apptTime}>{formatTime(appt.dateTimeStart)}</Text>
        <View style={[styles.typePill, { backgroundColor: typeColor + "28" }]}>
          <Text style={[styles.typePillText, { color: typeColor }]}>{appt.type === "LASER" ? "Láser" : "Facial"}</Text>
        </View>
      </View>
      <View style={styles.apptDivider} />
      <View style={styles.apptRight}>
        <Text style={styles.apptClient} numberOfLines={1}>{appt.client?.fullName || "Cliente"}</Text>
        <StatusBadge status={appt.status} />
        {appt.staff && (
          <Text style={styles.apptStaff} numberOfLines={1}>{appt.staff.name}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

function DayStrip({ selected, onSelect, appointmentDates }: { selected: string; onSelect: (d: string) => void; appointmentDates: Set<string> }) {
  const days = useMemo(() => {
    const result = [];
    const base = new Date(selected);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      result.push(d);
    }
    return result;
  }, [selected]);

  const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  return (
    <View style={styles.dayStrip}>
      <Pressable onPress={() => {
        const d = new Date(selected);
        d.setDate(d.getDate() - 1);
        onSelect(dateKey(d));
      }} style={styles.dayNavBtn}>
        <Ionicons name="chevron-back" size={20} color={Colors.text} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStripContent}>
        {days.map((d) => {
          const key = dateKey(d);
          const isSelected = key === selected;
          const hasAppts = appointmentDates.has(key);
          return (
            <Pressable key={key} onPress={() => onSelect(key)} style={[styles.dayCell, isSelected && styles.dayCellSelected]}>
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{DAY_NAMES[d.getDay()]}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{d.getDate()}</Text>
              <View style={[styles.dot, hasAppts && (isSelected ? styles.dotActive : styles.dotHas)]} />
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={() => {
        const d = new Date(selected);
        d.setDate(d.getDate() + 1);
        onSelect(dateKey(d));
      }} style={styles.dayNavBtn}>
        <Ionicons name="chevron-forward" size={20} color={Colors.text} />
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOwnerOrAdmin } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));

  const { data: appointments, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/appointments", selectedDate],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${selectedDate}`, base);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${(await import("@/lib/query-client")).getAuthToken() || ""}` },
      });
      if (!res.ok) throw new Error("Error al cargar");
      return res.json();
    },
  });

  const { data: monthAppts } = useQuery<any[]>({
    queryKey: ["/api/appointments", selectedDate.slice(0, 7)],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${selectedDate.slice(0, 8)}`, base);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${(await import("@/lib/query-client")).getAuthToken() || ""}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data;
    },
  });

  const appointmentDates = useMemo(() => {
    const set = new Set<string>();
    (monthAppts || []).forEach((a: any) => set.add(a.dateTimeStart.split("T")[0]));
    (appointments || []).forEach((a: any) => set.add(a.dateTimeStart.split("T")[0]));
    return set;
  }, [monthAppts, appointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const myAppts = useMemo(() =>
    (appointments || []).filter((a) => isOwnerOrAdmin ? true : a.staffId === user?.id),
    [appointments, isOwnerOrAdmin, user?.id]
  );

  const dateLabel = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    const isToday = selectedDate === dateKey(new Date());
    const label = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    return isToday ? `Hoy, ${label}` : label;
  }, [selectedDate]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(" ")[0]}</Text>
          <Text style={styles.dateLabel} numberOfLines={1}>{dateLabel}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.newApptBtn, pressed && { opacity: 0.8 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/appointment/new"); }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <DayStrip
        selected={selectedDate}
        onSelect={(d) => { Haptics.selectionAsync(); setSelectedDate(d); }}
        appointmentDates={appointmentDates}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Citas</Text>
          <Text style={styles.apptCount}>{myAppts.length} cita{myAppts.length !== 1 ? "s" : ""}</Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : myAppts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin citas</Text>
            <Text style={styles.emptyText}>Toca + para agregar</Text>
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
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: { fontFamily: "Nunito_800ExtraBold", fontSize: 22, color: Colors.text },
  dateLabel: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2, textTransform: "capitalize" },
  newApptBtn: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  dayStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
  },
  dayNavBtn: { padding: 8 },
  dayStripContent: { paddingHorizontal: 4, gap: 4 },
  dayCell: {
    width: 44,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 14,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayName: { fontFamily: "Nunito_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  dayNameSelected: { color: "#fff" },
  dayNum: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text, marginTop: 2 },
  dayNumSelected: { color: "#fff" },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: "transparent" },
  dotHas: { backgroundColor: Colors.primary },
  dotActive: { backgroundColor: "rgba(255,255,255,0.8)" },
  scroll: { flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 10, marginTop: 8 },
  sectionTitle: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  apptCount: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textMuted },
  list: { paddingHorizontal: 16, gap: 10 },
  apptCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  apptLeft: {
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    alignItems: "center",
    minWidth: 72,
  },
  apptTime: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  typePill: { marginTop: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptDivider: { width: 1, height: 50, backgroundColor: Colors.border },
  apptRight: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 3 },
  apptClient: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  apptStaff: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  badge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 17, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary },
});
