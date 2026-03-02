import React, { useState, useCallback, useMemo } from "react";
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
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function dateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

type ViewMode = "day" | "month";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [monthOffset, setMonthOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthYear = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    return { year, month };
  }, [currentMonthDate]);

  const monthStr = useMemo(() =>
    `${monthYear.year}-${String(monthYear.month + 1).padStart(2, "0")}`,
    [monthYear]
  );

  const { data: allMonthAppts } = useQuery<any[]>({
    queryKey: ["/api/appointments/month", monthStr],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${monthStr}`, base);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: appointments, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/appointments", selectedDate],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments?date=${selectedDate}`, base);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const appointmentDates = useMemo(() => {
    const set = new Set<string>();
    (allMonthAppts || []).forEach((a: any) => set.add(a.dateTimeStart.split("T")[0]));
    (appointments || []).forEach((a: any) => set.add(a.dateTimeStart.split("T")[0]));
    return set;
  }, [allMonthAppts, appointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const appts = appointments || [];

  const selectedDisplayDate = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    const isToday = selectedDate === dateKey(new Date());
    const label = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    return isToday ? `Hoy — ${label}` : label;
  }, [selectedDate]);

  const calendarDays = useMemo(() => {
    const { year, month } = monthYear;
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);
    const days: Array<{ date: string; day: number; currentMonth: boolean }> = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const d = daysInPrevMonth - i;
      days.push({ date: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, currentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, currentMonth: true });
    }
    const remaining = 42 - days.length;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, currentMonth: false });
    }
    return days;
  }, [monthYear]);

  const todayKey = dateKey(new Date());

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

      <View style={styles.toggleRow}>
        {(["day", "month"] as ViewMode[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.toggleBtn, viewMode === m && styles.toggleBtnActive]}
            onPress={() => setViewMode(m)}
          >
            <Text style={[styles.toggleText, viewMode === m && styles.toggleTextActive]}>
              {m === "day" ? "Día" : "Mes"}
            </Text>
          </Pressable>
        ))}
      </View>

      {viewMode === "month" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => setMonthOffset((v) => v - 1)} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
            <View style={styles.monthNavCenter}>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.monthNavLabel}>{MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}</Text>
            </View>
            <Pressable onPress={() => setMonthOffset((v) => v + 1)} hitSlop={12}>
              <Ionicons name="chevron-forward" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <View style={styles.calendar}>
            <View style={styles.calHeader}>
              {DAY_NAMES_SHORT.map((n) => (
                <View key={n} style={styles.calHeaderCell}>
                  <Text style={styles.calHeaderText}>{n}</Text>
                </View>
              ))}
            </View>
            <View style={styles.calGrid}>
              {calendarDays.map((cell, i) => {
                const isSelected = cell.date === selectedDate;
                const isToday = cell.date === todayKey;
                const hasAppts = appointmentDates.has(cell.date);
                return (
                  <Pressable
                    key={i}
                    style={[styles.calCell, isSelected && styles.calCellSelected, isToday && !isSelected && styles.calCellToday]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDate(cell.date);
                      setViewMode("day");
                    }}
                  >
                    <Text style={[styles.calCellText, !cell.currentMonth && styles.calCellTextOther, isSelected && styles.calCellTextSelected, isToday && !isSelected && { color: Colors.primary }]}>
                      {cell.day}
                    </Text>
                    {hasAppts && (
                      <View style={[styles.calDot, isSelected && { backgroundColor: "rgba(255,255,255,0.9)" }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ height: 80 }} />
        </ScrollView>
      ) : (
        <>
          <View style={styles.dayNav}>
            <Pressable onPress={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(dateKey(d));
            }} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
            <View style={styles.dayNavCenter}>
              <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
              <Text style={styles.dayNavLabel} numberOfLines={1}>{selectedDisplayDate}</Text>
            </View>
            <Pressable onPress={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(dateKey(d));
            }} hitSlop={12}>
              <Ionicons name="chevron-forward" size={22} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          >
            {isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : appts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
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
                      style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.85 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/appointment/${a.id}`); }}
                    >
                      <View style={styles.apptLeft}>
                        <Text style={styles.apptTime}>{formatTime(a.dateTimeStart)}</Text>
                        <View style={[styles.typePill, { backgroundColor: typeColor + "28" }]}>
                          <Text style={[styles.typePillText, { color: typeColor }]}>{a.type === "LASER" ? "Láser" : "Facial"}</Text>
                        </View>
                      </View>
                      <View style={styles.apptDivider} />
                      <View style={styles.apptRight}>
                        <Text style={styles.apptClientName} numberOfLines={1}>{a.client?.fullName || "Cliente"}</Text>
                        <View style={styles.apptRow}>
                          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                          {a.staff && <Text style={styles.staffText} numberOfLines={1}>{a.staff.name}</Text>}
                        </View>
                        {a.services?.length > 0 && (
                          <Text style={styles.serviceText} numberOfLines={1}>{a.services.map((s: any) => s?.name).join(", ")}</Text>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 26, color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    padding: 4,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 13,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.textSecondary },
  toggleTextActive: { color: "#fff" },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthNavCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  monthNavLabel: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  calendar: { marginHorizontal: 16, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  calHeader: { flexDirection: "row", marginBottom: 8 },
  calHeaderCell: { flex: 1, alignItems: "center" },
  calHeaderText: { fontFamily: "Nunito_700Bold", fontSize: 11, color: Colors.textMuted },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  calCellSelected: { backgroundColor: Colors.primary },
  calCellToday: { backgroundColor: Colors.primaryLight },
  calCellText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  calCellTextOther: { color: Colors.textMuted, fontFamily: "Nunito_400Regular" },
  calCellTextSelected: { color: "#fff" },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 2 },
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayNavCenter: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" },
  dayNavLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text, textTransform: "capitalize" },
  list: { flex: 1 },
  apptList: { paddingHorizontal: 16, gap: 10 },
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
  apptLeft: { paddingVertical: 14, paddingLeft: 16, paddingRight: 12, alignItems: "center", minWidth: 72 },
  apptTime: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  typePill: { marginTop: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptDivider: { width: 1, height: 50, backgroundColor: Colors.border },
  apptRight: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 3 },
  apptClientName: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  staffText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1 },
  serviceText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 17, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary },
});
