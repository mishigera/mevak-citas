import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Blur, Radius, Space } from "@/constants/theme";
import { useBreakpoint } from "@/lib/responsive";
import { ContentColumn, Screen, useScreenLayout } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSegmented, GlassSurface } from "@/components/glass";
import { Stagger } from "@/components/motion";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
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
type CalendarDay = { date: string; day: number; currentMonth: boolean };

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MODOS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "month", label: "Mes" },
];

/** Barra de navegación (mes anterior/siguiente, dia anterior/siguiente). */
function NavBar({
  label,
  onPrev,
  onNext,
  bold,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  bold?: boolean;
}) {
  return (
    <GlassSurface tone="neutral" intensity={Blur.panel} radius={Radius.panel} style={styles.nav}>
      <Pressable onPress={onPrev} hitSlop={12} style={styles.navBtn}>
        <Ionicons name="chevron-back" size={22} color={Colors.primaryDark} />
      </Pressable>
      <View style={styles.navCentro}>
        <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
        <Text style={[styles.navLabel, bold && styles.navLabelBold]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Pressable onPress={onNext} hitSlop={12} style={styles.navBtn}>
        <Ionicons name="chevron-forward" size={22} color={Colors.primaryDark} />
      </Pressable>
    </GlassSurface>
  );
}

function MonthView({
  days,
  selectedDate,
  todayKey,
  appointmentDates,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onPickDay,
}: {
  days: CalendarDay[];
  selectedDate: string;
  todayKey: string;
  appointmentDates: Set<string>;
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPickDay: (d: string) => void;
}) {
  const { paddingTop, paddingBottom } = useScreenLayout();
  const { isCompact, isExpanded } = useBreakpoint();
  // El bug original: `aspectRatio: 1`. A 1024 px cada celda medía 137 px de lado y el
  // mes no cabía en pantalla. Con alto fijo las seis semanas entran siempre.
  const alturaFila = isExpanded ? 56 : isCompact ? 48 : 52;

  return (
    <ScrollView contentContainerStyle={{ paddingTop, paddingBottom }} showsVerticalScrollIndicator={false}>
      <ContentColumn style={styles.columna}>
        <NavBar label={monthLabel} onPrev={onPrevMonth} onNext={onNextMonth} bold />

        <GlassCard radius={Radius.panel} style={styles.calendario}>
          <View style={styles.calContenido}>
            <View style={styles.calHeader}>
              {DAY_NAMES_SHORT.map((n) => (
                <View key={n} style={styles.calHeaderCell}>
                  <Text style={styles.calHeaderText}>{n}</Text>
                </View>
              ))}
            </View>
            <View style={styles.calGrid}>
              {days.map((cell, i) => {
                const isSelected = cell.date === selectedDate;
                const isToday = cell.date === todayKey;
                const hasAppts = appointmentDates.has(cell.date);
                return (
                  <Pressable
                    key={i}
                    style={[styles.calCell, { height: alturaFila }]}
                    onPress={() => onPickDay(cell.date)}
                  >
                    {(isSelected || isToday) && (
                      <GlassSurface
                        tone={isSelected ? "pinkStrong" : "pink"}
                        intensity={Blur.control}
                        radius={Radius.tile}
                        elevation="none"
                        style={styles.calCellFondo}
                      />
                    )}
                    <Text
                      style={[
                        styles.calCellText,
                        !cell.currentMonth && styles.calCellTextOther,
                        (isSelected || isToday) && styles.calCellTextActivo,
                      ]}
                    >
                      {cell.day}
                    </Text>
                    {hasAppts && <View style={styles.calDot} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GlassCard>
      </ContentColumn>
    </ScrollView>
  );
}

function DayView({
  appts,
  isLoading,
  refreshing,
  onRefresh,
  label,
  onPrevDay,
  onNextDay,
}: {
  appts: any[];
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  label: string;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  const { paddingTop, paddingBottom } = useScreenLayout();

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop, paddingBottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <ContentColumn style={styles.columna}>
        <NavBar label={label} onPrev={onPrevDay} onNext={onNextDay} />

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : appts.length === 0 ? (
          <EstadoVacio icono="calendar-outline" titulo="Sin citas" texto="No hay citas para este día" />
        ) : (
          <Stagger style={styles.apptList}>
            {appts.map((a) => {
              const typeColor = a.type === "LASER" ? Colors.secondary : Colors.accent;
              const statusColor =
                Colors.statusColors[a.status as keyof typeof Colors.statusColors] || Colors.textMuted;
              return (
                <GlassCard
                  key={a.id}
                  radius={Radius.card}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/appointment/${a.id}`);
                  }}
                >
                  <View style={styles.apptFila}>
                    <View style={styles.apptLeft}>
                      <Text style={styles.apptTime}>{formatTime(a.dateTimeStart)}</Text>
                      <View style={[styles.typePill, { backgroundColor: typeColor + "28" }]}>
                        <Text style={[styles.typePillText, { color: typeColor }]}>
                          {a.type === "LASER" ? "Láser" : "Facial"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.apptDivider} />
                    <View style={styles.apptRight}>
                      <Text style={styles.apptClientName} numberOfLines={1}>
                        {a.client?.fullName || "Cliente"}
                      </Text>
                      <View style={styles.apptRow}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        {a.staff && (
                          <Text style={styles.staffText} numberOfLines={1}>{a.staff.name}</Text>
                        )}
                      </View>
                      {a.services?.length > 0 && (
                        <Text style={styles.serviceText} numberOfLines={1}>
                          {a.services.map((s: any) => s?.name).join(", ")}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                </GlassCard>
              );
            })}
          </Stagger>
        )}
      </ContentColumn>
    </ScrollView>
  );
}

export default function CalendarScreen() {
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

  const monthStr = useMemo(
    () => `${monthYear.year}-${String(monthYear.month + 1).padStart(2, "0")}`,
    [monthYear],
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
    const days: CalendarDay[] = [];
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

  const moverDia = (días: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + días);
    setSelectedDate(dateKey(d));
  };

  return (
    <Screen
      avisos
      title="Agenda"
      action={
        <GlassIconButton
          name="add"
          variant="primary"
          accessibilityLabel="Nueva cita"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/appointment/new");
          }}
        />
      }
      below={<GlassSegmented options={MODOS} value={viewMode} onChange={setViewMode} style={styles.segmentado} />}
    >
      {viewMode === "month" ? (
        <MonthView
          days={calendarDays}
          selectedDate={selectedDate}
          todayKey={todayKey}
          appointmentDates={appointmentDates}
          monthLabel={`${MONTH_NAMES[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`}
          onPrevMonth={() => setMonthOffset((v) => v - 1)}
          onNextMonth={() => setMonthOffset((v) => v + 1)}
          onPickDay={(d) => {
            Haptics.selectionAsync();
            setSelectedDate(d);
            setViewMode("day");
          }}
        />
      ) : (
        <DayView
          appts={appts}
          isLoading={isLoading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          label={selectedDisplayDate}
          onPrevDay={() => moverDia(-1)}
          onNextDay={() => moverDia(1)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.md },
  // Sin tope, en iPad el toggle se estira a todo lo ancho de la columna.
  segmentado: { width: "100%", maxWidth: 360, alignSelf: "center" },

  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: Space.lg, paddingVertical: Space.md },
  navBtn: { padding: Space.xs },
  navCentro: { flexDirection: "row", alignItems: "center", gap: Space.sm, flex: 1, justifyContent: "center" },
  navLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text, textTransform: "capitalize" },
  navLabelBold: { fontFamily: "Nunito_700Bold", fontSize: 16 },

  // El panel del mes no se estira con la columna: en iPad quedaria enorme y vacio.
  calendario: { width: "100%", maxWidth: 520, alignSelf: "center" },
  calContenido: { padding: Space.lg },
  calHeader: { flexDirection: "row", marginBottom: Space.sm },
  calHeaderCell: { flex: 1, alignItems: "center" },
  calHeaderText: { fontFamily: "Nunito_700Bold", fontSize: 11, color: Colors.textSecondary },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", justifyContent: "center", borderRadius: Radius.tile },
  calCellFondo: { position: "absolute", top: 2, left: 4, right: 4, bottom: 2 },
  calCellText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  calCellTextOther: { color: Colors.textMuted, fontFamily: "Nunito_400Regular" },
  calCellTextActivo: { color: Colors.primaryDark },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 2 },

  apptList: { gap: Space.md },
  apptFila: { flexDirection: "row", alignItems: "center", paddingRight: Space.md },
  apptLeft: { paddingVertical: Space.lg, paddingLeft: Space.lg, paddingRight: Space.md, alignItems: "center", minWidth: 72 },
  apptTime: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  typePill: { marginTop: Space.xs, borderRadius: Radius.control, paddingHorizontal: Space.sm, paddingVertical: 2 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptDivider: { width: 1, height: 50, backgroundColor: Colors.glass.strokeSoft },
  apptRight: { flex: 1, paddingVertical: Space.md, paddingHorizontal: Space.md, gap: 3 },
  apptClientName: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  apptRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  staffText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  serviceText: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },

});
