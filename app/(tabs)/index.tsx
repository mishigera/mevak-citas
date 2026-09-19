import React, { useCallback, useState, useMemo } from "react";
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
import { useAuth } from "@/contexts/auth";
import { useBreakpoint } from "@/lib/responsive";
import { ContentColumn, Screen, useScreenLayout } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSurface } from "@/components/glass";
import { Entrar, Stagger } from "@/components/motion";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import * as Haptics from "expo-haptics";
import { getApiUrl } from "@/lib/query-client";
import { ahoraClave, claveDiaISO, claveDiaLocal, desdeClave, sumarDias } from "@/lib/fecha";
import { fetch } from "expo/fetch";

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

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

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
    <GlassCard onPress={onPress} radius={Radius.card}>
      <View style={styles.apptFila}>
        <View style={styles.apptLeft}>
          <Text style={styles.apptTime}>{formatTime(appt.dateTimeStart)}</Text>
          <View style={[styles.typePill, { backgroundColor: typeColor + "28" }]}>
            <Text style={[styles.typePillText, { color: typeColor }]}>
              {appt.type === "LASER" ? "Láser" : "Facial"}
            </Text>
          </View>
        </View>
        <View style={styles.apptDivider} />
        <View style={styles.apptRight}>
          <Text style={styles.apptClient} numberOfLines={1}>{appt.client?.fullName || "Cliente"}</Text>
          <StatusBadge status={appt.status} />
          {appt.staff && <Text style={styles.apptStaff} numberOfLines={1}>{appt.staff.name}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </GlassCard>
  );
}

function DayStrip({
  selected,
  onSelect,
  appointmentDates,
}: {
  selected: string;
  onSelect: (d: string) => void;
  appointmentDates: Set<string>;
}) {
  const { isCompact } = useBreakpoint();
  // En pantalla ancha cabe mas de una semana: se aprovecha en vez de dejar hueco.
  const radio = isCompact ? 3 : 5;

  const days = useMemo(() => {
    const result = [];
    const base = desdeClave(selected);
    for (let i = -radio; i <= radio; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      result.push(d);
    }
    return result;
  }, [selected, radio]);

  const mover = (días: number) => onSelect(sumarDias(selected, días));

  return (
    <GlassSurface tone="neutral" intensity={Blur.panel} radius={Radius.panel} style={styles.dayStrip}>
      <Pressable onPress={() => mover(-1)} style={styles.dayNavBtn} hitSlop={6}>
        <Ionicons name="chevron-back" size={20} color={Colors.primaryDark} />
      </Pressable>
      <View style={styles.dayStripContent}>
        {days.map((d) => {
          const key = claveDiaLocal(d);
          const isSelected = key === selected;
          const hasAppts = appointmentDates.has(key);
          return (
            <Pressable key={key} onPress={() => onSelect(key)} style={styles.dayCellBoton}>
              {isSelected && (
                <GlassSurface
                  tone="pinkStrong"
                  intensity={Blur.control}
                  radius={Radius.tile}
                  style={StyleSheet.absoluteFillObject}
                  elevation="none"
                />
              )}
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{DAY_NAMES[d.getDay()]}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{d.getDate()}</Text>
              <View style={[styles.dot, hasAppts && (isSelected ? styles.dotActive : styles.dotHas)]} />
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => mover(1)} style={styles.dayNavBtn} hitSlop={6}>
        <Ionicons name="chevron-forward" size={20} color={Colors.primaryDark} />
      </Pressable>
    </GlassSurface>
  );
}

/**
 * La lista va en su propio componente porque `useScreenLayout()` solo tiene valor
 * dentro de `<Screen>`: es de ahi de donde salen los huecos que deja el chrome flotante.
 */
function DayList({
  appts,
  isLoading,
  refreshing,
  onRefresh,
}: {
  appts: any[];
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { paddingTop, paddingBottom } = useScreenLayout();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop, paddingBottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <ContentColumn>
        <Entrar style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Citas</Text>
          <Text style={styles.apptCount}>
            {appts.length} cita{appts.length !== 1 ? "s" : ""}
          </Text>
        </Entrar>

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : appts.length === 0 ? (
          <EstadoVacio icono="calendar-outline" titulo="Sin citas" texto="Toca + para agregar" />
        ) : (
          /* Escalonado: cada cita entra 60 ms después de la anterior. De la 11.ª en
             adelante entran juntas, que si no la lista tarda una eternidad. */
          <Stagger style={styles.list}>
            {appts.map((a) => (
              <AppointmentCard
                key={a.id}
                appt={a}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/appointment/${a.id}`);
                }}
              />
            ))}
          </Stagger>
        )}
      </ContentColumn>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(ahoraClave());

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
    (monthAppts || []).forEach((a: any) => set.add(claveDiaISO(a.dateTimeStart)));
    (appointments || []).forEach((a: any) => set.add(claveDiaISO(a.dateTimeStart)));
    return set;
  }, [monthAppts, appointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Solo la facialista ve "sus" citas; la dueña y la recepcionista ven el día entero.
  // Antes el filtro era "todo el mundo menos la dueña ve lo suyo", y como la
  // recepcionista **nunca** es la profesional de una cita, su pantalla salía siempre
  // vacía. Deuda §27.
  const soloMias = user?.role === "FACIALIST";
  const myAppts = useMemo(
    () => (appointments || []).filter((a) => (soloMias ? a.staffId === user?.id : true)),
    [appointments, soloMias, user?.id],
  );

  const dateLabel = useMemo(() => {
    const d = desdeClave(selectedDate);
    const isToday = selectedDate === ahoraClave();
    const label = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    return isToday ? `Hoy, ${label}` : label;
  }, [selectedDate]);

  return (
    <Screen
      avisos
      title={`Hola, ${user?.name?.split(" ")[0]}`}
      subtitle={dateLabel}
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
      below={
        <DayStrip
          selected={selectedDate}
          onSelect={(d) => {
            Haptics.selectionAsync();
            setSelectedDate(d);
          }}
          appointmentDates={appointmentDates}
        />
      }
    >
      <DayList appts={myAppts} isLoading={isLoading} refreshing={refreshing} onRefresh={onRefresh} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },

  dayStrip: { flexDirection: "row", alignItems: "center", paddingHorizontal: Space.xs, paddingVertical: Space.sm },
  dayNavBtn: { padding: Space.sm },
  dayStripContent: { flex: 1, flexDirection: "row", gap: 2 },
  dayCellBoton: {
    // Flexible, no de ancho fijo: así las 7 (u 11) celdas siempre caben en el ancho
    // que haya y no se corta la última.
    flex: 1,
    alignItems: "center",
    paddingVertical: Space.sm,
    borderRadius: Radius.tile,
  },
  dayName: { fontFamily: "Nunito_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  dayNameSelected: { color: Colors.primaryDark },
  dayNum: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text, marginTop: 2 },
  dayNumSelected: { color: Colors.primaryDark },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: "transparent" },
  dotHas: { backgroundColor: Colors.primary },
  dotActive: { backgroundColor: Colors.primaryDark },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.xs,
  },
  sectionTitle: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  apptCount: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  list: { gap: Space.md },
  apptFila: { flexDirection: "row", alignItems: "center", paddingRight: Space.md },
  apptLeft: { paddingVertical: Space.lg, paddingLeft: Space.lg, paddingRight: Space.md, alignItems: "center", minWidth: 72 },
  apptTime: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  typePill: { marginTop: Space.xs, borderRadius: Radius.control, paddingHorizontal: Space.sm, paddingVertical: 2 },
  typePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptDivider: { width: 1, height: 50, backgroundColor: Colors.glass.strokeSoft },
  apptRight: { flex: 1, paddingVertical: Space.md, paddingHorizontal: Space.md, gap: 3 },
  apptClient: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  apptStaff: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary },
  badge: { alignSelf: "flex-start", borderRadius: Radius.control, paddingHorizontal: Space.sm, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontFamily: "Nunito_700Bold", fontSize: 10 },

});
