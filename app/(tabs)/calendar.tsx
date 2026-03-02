import React, { useState, useCallback } from "react";
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
import * as Haptics from "expo-haptics";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function formatDateISO(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function getWeekDays(base: Date): Date[] {
  const monday = new Date(base);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekBase, setWeekBase] = useState<Date>(new Date());
  const weekDays = getWeekDays(weekBase);
  const today = new Date();

  const dateStr = formatDateISO(selectedDate);

  const { data: appointments, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/appointments", dateStr],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${dateStr}`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json() as Promise<any[]>;
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const prevWeek = () => {
    const d = new Date(weekBase);
    d.setDate(d.getDate() - 7);
    setWeekBase(d);
  };
  const nextWeek = () => {
    const d = new Date(weekBase);
    d.setDate(d.getDate() + 7);
    setWeekBase(d);
  };

  const appts = appointments || [];

  const monthLabel = selectedDate.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Agenda</Text>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/appointment/new"); }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.weekNav}>
        <Pressable onPress={prevWeek} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={nextWeek} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
        {weekDays.map((d) => {
          const isSelected = formatDateISO(d) === dateStr;
          const isToday = formatDateISO(d) === formatDateISO(today);
          const dayAppts = (appointments || []).filter((a) => a.dateTimeStart.startsWith(formatDateISO(d)));
          return (
            <Pressable
              key={d.toISOString()}
              style={({ pressed }) => [styles.dayBtn, isSelected && styles.dayBtnSelected, pressed && { opacity: 0.7 }]}
              onPress={() => { Haptics.selectionAsync(); setSelectedDate(d); }}
            >
              <Text style={[styles.dayName, isSelected && { color: "#fff" }]}>
                {d.toLocaleDateString("es-MX", { weekday: "short" }).substring(0, 2).toUpperCase()}
              </Text>
              <Text style={[styles.dayNum, isSelected && { color: "#fff" }, isToday && !isSelected && { color: Colors.primary }]}>
                {d.getDate()}
              </Text>
              {dayAppts.length > 0 && (
                <View style={[styles.dot, isSelected && { backgroundColor: "rgba(255,255,255,0.6)" }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.dateBar}>
        <Text style={styles.dateBarText}>
          {selectedDate.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <Text style={styles.apptCount}>{appts.length} cita{appts.length !== 1 ? "s" : ""}</Text>
      </View>

      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentInsetAdjustmentBehavior="automatic"
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : appts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin citas</Text>
            <Text style={styles.emptyText}>No hay citas para este día</Text>
          </View>
        ) : (
          <View style={styles.apptList}>
            {appts.map((a) => {
              const typeColor = a.type === "LASER" ? Colors.secondary : Colors.accent;
              const statusColor = Colors.statusColors[a.status as keyof typeof Colors.statusColors] || Colors.textMuted;
              return (
                <Pressable
                  key={a.id}
                  style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/appointment/${a.id}`); }}
                >
                  <View style={styles.apptTimeCol}>
                    <Text style={styles.apptStartTime}>{formatTime(a.dateTimeStart)}</Text>
                    <View style={styles.timeLine} />
                    <Text style={styles.apptEndTime}>{formatTime(a.dateTimeEnd)}</Text>
                  </View>
                  <View style={[styles.apptCardContent, { borderLeftColor: typeColor }]}>
                    <Text style={styles.apptClientName}>{a.client?.fullName || "Cliente"}</Text>
                    <View style={styles.apptRow}>
                      <View style={[styles.typePill, { backgroundColor: typeColor + "25" }]}>
                        <Text style={[styles.typePillText, { color: typeColor }]}>{a.type}</Text>
                      </View>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      {a.staff && <Text style={styles.staffText}>{a.staff.name}</Text>}
                    </View>
                    {a.services && a.services.length > 0 && (
                      <Text style={styles.serviceText} numberOfLines={1}>
                        {a.services.map((s: any) => s?.name).join(", ")}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 26, color: Colors.text },
  addBtn: {
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
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 },
  monthLabel: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text, textTransform: "capitalize" },
  weekRow: { paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  dayBtn: {
    width: 44,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 4,
  },
  dayBtnSelected: { backgroundColor: Colors.primary },
  dayName: { fontFamily: "Nunito_600SemiBold", fontSize: 11, color: Colors.textMuted },
  dayNum: { fontFamily: "Nunito_700Bold", fontSize: 17, color: Colors.text },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary },
  dateBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateBarText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text, textTransform: "capitalize" },
  apptCount: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textMuted },
  list: { flex: 1 },
  apptList: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  apptCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  apptTimeCol: { alignItems: "center", width: 52 },
  apptStartTime: { fontFamily: "Nunito_700Bold", fontSize: 11, color: Colors.text },
  timeLine: { width: 1, height: 16, backgroundColor: Colors.border, marginVertical: 2 },
  apptEndTime: { fontFamily: "Nunito_400Regular", fontSize: 11, color: Colors.textMuted },
  apptCardContent: { flex: 1, borderLeftWidth: 3, paddingLeft: 10, gap: 3 },
  apptClientName: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  typePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  staffText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  serviceText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary },
});
