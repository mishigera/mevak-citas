import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { useAuth } from "@/contexts/auth";
import * as Haptics from "expo-haptics";
import { LaserBodyMap } from "@/components/LaserBodyMap";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  ARRIVED: "Llegó",
  NO_SHOW: "No llegó",
  DONE: "Terminada",
  CANCELLED: "Cancelada",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  INCLUDED: "Incluido (paquete)",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function authHeaders() {
  return { Authorization: `Bearer ${getAuthToken() || ""}` };
}

export default function AppointmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { user, isOwnerOrAdmin } = useAuth();

  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [servicesEditing, setServicesEditing] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLaserPowerModal, setShowLaserPowerModal] = useState(false);
  const [powerByArea, setPowerByArea] = useState<Record<string, string>>({});

  const { data: appt, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/appointments", id],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/appointments/${id}`, base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      if (!res.ok) throw new Error("Error al cargar cita");
      const data = await res.json() as any;
      setNotes(data.notes || "");
      const svcs = data.services?.map((s: any) => s?.id).filter(Boolean) || [];
      setSelectedServiceIds(svcs);
      if (data.laserSession?.clientPackageId) setSelectedPackageId(data.laserSession.clientPackageId);
      if (data.laserSession?.powerByArea) {
        const nextPower: Record<string, string> = {};
        Object.entries(data.laserSession.powerByArea as Record<string, unknown>).forEach(([area, value]) => {
          if (value !== null && value !== undefined) nextPower[area] = String(value);
        });
        setPowerByArea(nextPower);
      }
      return data;
    },
  });

  const { data: historyAppts } = useQuery<any[]>({
    queryKey: ["/api/clients", appt?.clientId, "appointments"],
    enabled: showHistoryModal && !!appt?.clientId,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${appt.clientId}/appointments`, base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      if (!res.ok) throw new Error("Error al cargar historial");
      return res.json() as Promise<any[]>;
    },
  });

  const { data: facialServices } = useQuery<any[]>({
    queryKey: ["/api/services", "FACIAL"],
    enabled: appt?.type === "FACIAL",
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/services?type=FACIAL", base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: clientPackages } = useQuery<any[]>({
    queryKey: ["/api/clients", appt?.clientId, "packages"],
    enabled: appt?.type === "LASER" && !!appt?.clientId,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${appt.clientId}/packages`, base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: laserAreas = [] } = useQuery<any[]>({
    queryKey: ["/api/laser-areas"],
    enabled: appt?.type === "LASER",
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/laser-areas", base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: clientLaserSelections = [] } = useQuery<any[]>({
    queryKey: ["/api/clients", appt?.clientId, "laser-areas"],
    enabled: appt?.type === "LASER" && !!appt?.clientId,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${appt.clientId}/laser-areas`, base);
      const res = await fetch(url.toString(), { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/appointments/${id}`, { status });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appointments"] }); refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const updateNotesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/appointments/${id}`, { notes });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appointments"] }); refetch(); setEditingNotes(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const updateServicesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/appointments/${id}/services`, { serviceIds: selectedServiceIds });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appointments"] }); refetch(); setServicesEditing(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const isLaser = appt?.type === "LASER";
      const method = isLaser && selectedPackageId ? "INCLUDED" : paymentMethod;
      const amount = method === "INCLUDED" ? 0 : Number(paymentAmount);
      await apiRequest("POST", `/api/appointments/${id}/payment`, {
        method,
        totalAmount: amount,
        clientPackageId: selectedPackageId || undefined,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/appointments"] }); refetch(); setShowPaymentForm(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("PATCH", `/api/payments/${paymentId}/facialist-paid`, { paid: true });
    },
    onSuccess: () => { refetch(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  });

  const saveLaserPowerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/appointments/${id}/laser-session`, {
        powerByArea,
      });
    },
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/clients", appt?.clientId, "appointments"] });
      setShowLaserPowerModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const handleReSchedule = () => {
    if (!appt) return;
    const dateStr = appt.dateTimeStart.split("T")[0];
    router.push(`/appointment/new?clientId=${appt.clientId}&staffId=${appt.staffId}&type=${appt.type}&date=${dateStr}`);
  };

  const handleStatusChange = (nextStatus: "ARRIVED" | "NO_SHOW" | "CANCELLED") => {
    if (nextStatus === "ARRIVED") {
      updateStatusMutation.mutate("ARRIVED");
      return;
    }

    const doChange = () => {
      updateStatusMutation.mutate(nextStatus, {
        onSuccess: () => {
          Alert.alert(
            nextStatus === "NO_SHOW" ? "No llegó" : "Cita cancelada",
            "¿Deseas reagendar esta cita?",
            [
              { text: "No", style: "cancel" },
              { text: "Sí, reagendar", onPress: handleReSchedule },
            ],
          );
        },
      });
    };

    const title = nextStatus === "NO_SHOW" ? "No llegó" : "Cancelar cita";
    const message = appt?.status === "ARRIVED"
      ? "Esta cita ya está marcada como 'Llegó'. ¿Deseas cambiar la selección?"
      : nextStatus === "NO_SHOW"
        ? "¿La clienta no llegó?"
        : "¿Confirmas cancelar esta cita?";

    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", style: "destructive", onPress: doChange },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!appt) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={{ fontFamily: "Nunito_700Bold", color: Colors.text }}>Cita no encontrada</Text>
      </View>
    );
  }

  const statusColor = Colors.statusColors[appt.status as keyof typeof Colors.statusColors] || Colors.textMuted;
  const typeColor = appt.type === "LASER" ? Colors.secondary : Colors.accent;
  const isDone = appt.status === "DONE";
  const isScheduledOrArrived = appt.status === "SCHEDULED" || appt.status === "ARRIVED";
  const isNoShow = appt.status === "NO_SHOW";
  const selectableClientPackages = (clientPackages || []).filter((cp) => cp.status === "ACTIVE" && cp.remainingSessions > 0);
  const selectedAreaSvgKeysFromClient = clientLaserSelections
    .map((selection: any) => laserAreas.find((area: any) => area.id === selection.areaId)?.svgKey)
    .filter(Boolean) as string[];
  const selectedAreaSvgKeys = (appt.laserSession?.areasSnapshotJson?.length
    ? appt.laserSession.areasSnapshotJson
    : selectedAreaSvgKeysFromClient) as string[];
  const laserPowerAreas = (laserAreas || []).map((area: any) => area.name);
  const packageProgressText = (() => {
    if (!appt.clientPackage?.totalSessions) return "";
    const total = appt.clientPackage.totalSessions;
    const current = appt.laserSession?.sessionNumber
      ?? (isDone ? appt.clientPackage.usedSessions : appt.clientPackage.usedSessions + 1);
    const clampedCurrent = Math.min(Math.max(current, 1), total);
    return `${clampedCurrent}/${total}`;
  })();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/calendar"))} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalle de cita</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.topBanner, { backgroundColor: typeColor + "18", borderColor: typeColor + "40" }]}>
          <View style={styles.topBannerLeft}>
            <Text style={[styles.bannerType, { color: typeColor }]}>{appt.type === "LASER" ? "LÁSER" : "FACIAL"}</Text>
            <Text style={styles.bannerClient}>{appt.client?.fullName}</Text>
            <Text style={styles.bannerTime}>{formatTime(appt.dateTimeStart)} – {formatTime(appt.dateTimeEnd)}</Text>
            <Text style={styles.bannerDate}>{new Date(appt.dateTimeStart).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "long" })}</Text>
          </View>
          <View style={[styles.statusBadgeLarge, { backgroundColor: statusColor + "20", borderColor: statusColor + "50" }]}>
            <Text style={[styles.statusBadgeLargeText, { color: statusColor }]}>{STATUS_LABELS[appt.status]}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <SectionCard title="Accesos rápidos">
            <View style={styles.quickGrid}>
              <Pressable style={styles.quickBtn} onPress={() => setShowHistoryModal(true)}>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
                <Text style={styles.quickBtnText}>Historial rápido</Text>
              </Pressable>
              {appt.type === "LASER" && (user?.role === "OWNER" || user?.role === "ADMIN") && (
                <Pressable style={styles.quickBtn} onPress={() => setShowLaserPowerModal(true)}>
                  <Ionicons name="flash-outline" size={20} color={Colors.secondary} />
                  <Text style={styles.quickBtnText}>Potencia por área</Text>
                </Pressable>
              )}
            </View>
          </SectionCard>

          {/* STATUS ACTIONS */}
          {isScheduledOrArrived && (
            <SectionCard title="Acciones">
              <View style={styles.actionRow}>
                {appt.status === "SCHEDULED" && (
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.success + "18" }, pressed && { opacity: 0.7 }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleStatusChange("ARRIVED"); }}
                  >
                    <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                    <Text style={[styles.actionBtnText, { color: Colors.success }]}>Llegó</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.error + "18" }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleStatusChange("NO_SHOW")}
                >
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                  <Text style={[styles.actionBtnText, { color: Colors.error }]}>No llegó</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.textMuted + "18" }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleStatusChange("CANCELLED")}
                >
                  <Ionicons name="ban" size={22} color={Colors.textMuted} />
                  <Text style={[styles.actionBtnText, { color: Colors.textMuted }]}>Cancelar</Text>
                </Pressable>
              </View>
            </SectionCard>
          )}

          {/* NO SHOW - REAGENDAR */}
          {isNoShow && (
            <SectionCard title="No llegó">
              <Text style={styles.noShowText}>La clienta no llegó a esta cita.</Text>
              <Pressable
                style={({ pressed }) => [styles.reagendarBtn, pressed && { opacity: 0.85 }]}
                onPress={handleReSchedule}
              >
                <Ionicons name="calendar" size={18} color="#fff" />
                <Text style={styles.reagendarBtnText}>Reagendar cita</Text>
              </Pressable>
            </SectionCard>
          )}

          {/* STAFF & CLIENT INFO */}
          <SectionCard title="Información">
            <InfoRow label="Profesional" value={appt.staff?.name} />
            <InfoRow label="Teléfono" value={appt.client?.phone} />
            {appt.client?.email && <InfoRow label="Correo" value={appt.client.email} />}
            {appt.clientPackage && (
              <View style={styles.packageBadge}>
                <Ionicons name="cube" size={16} color={Colors.secondary} />
                <Text style={styles.packageBadgeText}>
                  {(appt.clientPackage.package?.name || "Paquete láser")} · Cita {packageProgressText}
                </Text>
              </View>
            )}
          </SectionCard>

          {/* SERVICES (FACIAL) */}
          {appt.type === "FACIAL" && (
            <SectionCard title="Servicios faciales">
              {servicesEditing ? (
                <>
                  <View style={styles.serviceGrid}>
                    {(facialServices || []).map((svc) => {
                      const selected = selectedServiceIds.includes(svc.id);
                      return (
                        <Pressable
                          key={svc.id}
                          style={({ pressed }) => [styles.svcBtn, selected && { backgroundColor: Colors.accent + "30", borderColor: Colors.accent }, pressed && { opacity: 0.7 }]}
                          onPress={() => setSelectedServiceIds((ids) =>
                            ids.includes(svc.id) ? ids.filter((i) => i !== svc.id) : [...ids, svc.id]
                          )}
                        >
                          <Ionicons name="sparkles" size={16} color={selected ? Colors.accent : Colors.textMuted} />
                          <Text style={[styles.svcBtnText, selected && { color: Colors.accent }]}>{svc.name}</Text>
                          <Text style={styles.svcPrice}>${svc.price}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.editBtns}>
                    <Pressable style={styles.cancelEditBtn} onPress={() => setServicesEditing(false)}>
                      <Text style={styles.cancelEditBtnText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveEditBtn, updateServicesMutation.isPending && { opacity: 0.5 }]}
                      onPress={() => updateServicesMutation.mutate()}
                      disabled={updateServicesMutation.isPending}
                    >
                      {updateServicesMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveEditBtnText}>Guardar</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {appt.services?.length > 0 ? (
                    appt.services.map((s: any) => (
                      <View key={s?.id} style={styles.svcChip}>
                        <Ionicons name="sparkles" size={14} color={Colors.accent} />
                        <Text style={styles.svcChipText}>{s?.name}</Text>
                        <Text style={styles.svcChipPrice}>${s?.price}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>Sin servicios registrados</Text>
                  )}
                  {!isDone && !isNoShow && (
                    <Pressable style={styles.editLink} onPress={() => setServicesEditing(true)}>
                      <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                      <Text style={styles.editLinkText}>Editar servicios</Text>
                    </Pressable>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* LASER PACKAGE */}
          {appt.type === "LASER" && !isDone && !isNoShow && selectableClientPackages.length > 0 && (
            <SectionCard title="Paquete láser">
              {selectableClientPackages.map((cp) => {
                const selected = selectedPackageId === cp.id;
                const nextSession = Math.min(cp.usedSessions + 1, cp.totalSessions);
                return (
                  <Pressable
                    key={cp.id}
                    style={[styles.pkgOption, selected && { borderColor: Colors.secondary, backgroundColor: Colors.secondary + "15" }]}
                    onPress={() => setSelectedPackageId(selected ? "" : cp.id)}
                  >
                    <View style={styles.pkgOptionContent}>
                      <Text style={[styles.pkgOptionName, selected && { color: Colors.secondary }]}> 
                        {cp.package?.name || "Paquete láser"}
                      </Text>
                      <Text style={styles.pkgOptionStatus}>Activo</Text>
                    </View>
                    <Text style={styles.pkgOptionMeta}>Próxima cita {nextSession}/{cp.totalSessions} · Restantes: {cp.remainingSessions}</Text>
                    <View style={styles.pkgProgress}>
                      <View style={[styles.pkgProgressFill, { width: `${(cp.usedSessions / cp.totalSessions) * 100}%` }]} />
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.secondary} />}
                  </Pressable>
                );
              })}
            </SectionCard>
          )}

          {appt.type === "LASER" && !isDone && !isNoShow && selectableClientPackages.length === 0 && (
            <SectionCard title="Paquete láser">
              <Text style={styles.emptyText}>No hay paquetes activos vinculados para esta clienta.</Text>
            </SectionCard>
          )}

          {appt.type === "LASER" && (
            <SectionCard title="Áreas láser">
              <LaserBodyMap
                areas={laserAreas}
                selectedSvgKeys={selectedAreaSvgKeys}
                readOnly
                title={isDone ? "Snapshot de áreas depiladas" : "Referencia rápida para depilación"}
              />
            </SectionCard>
          )}

          {/* NOTES */}
          <SectionCard title="Notas">
            {editingNotes ? (
              <>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Agrega notas..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  autoFocus
                />
                <View style={styles.editBtns}>
                  <Pressable style={styles.cancelEditBtn} onPress={() => { setNotes(appt.notes || ""); setEditingNotes(false); }}>
                    <Text style={styles.cancelEditBtnText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.saveEditBtn}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateNotesMutation.mutate(); }}
                    disabled={updateNotesMutation.isPending}
                  >
                    {updateNotesMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveEditBtnText}>Guardar</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.notesText}>{appt.notes || "Sin notas"}</Text>
                {!isDone && !isNoShow && (
                  <Pressable style={styles.editLink} onPress={() => setEditingNotes(true)}>
                    <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                    <Text style={styles.editLinkText}>Editar notas</Text>
                  </Pressable>
                )}
              </>
            )}
          </SectionCard>

          {/* PAYMENT */}
          {isDone && appt.payment ? (
            <SectionCard title="Pago registrado">
              <InfoRow label="Método" value={METHOD_LABELS[appt.payment.method]} />
              <InfoRow label="Total" value={`$${appt.payment.totalAmount}`} />
              {appt.type === "FACIAL" && (
                <>
                  <InfoRow label="Owner" value={`$${appt.payment.ownerNetAmount}`} />
                  <InfoRow label="Facialista" value={`$${appt.payment.facialistNetAmount}`} />
                  {isOwnerOrAdmin && (
                    <View style={styles.paidToggle}>
                      <Text style={[styles.paidToggleLabel, appt.payment.facialistPaidFlag && { color: Colors.success }]}>
                        {appt.payment.facialistPaidFlag ? "✓ Pagado a facialista" : "⏳ Pendiente pago facialista"}
                      </Text>
                      {!appt.payment.facialistPaidFlag && (
                        <Pressable
                          style={styles.markPaidBtn}
                          onPress={() => markPaidMutation.mutate(appt.payment.id)}
                          disabled={markPaidMutation.isPending}
                        >
                          <Text style={styles.markPaidBtnText}>Marcar pagado</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </>
              )}
            </SectionCard>
          ) : !isDone && !isNoShow && appt.status !== "CANCELLED" && (
            <SectionCard title="Pago">
              {!showPaymentForm ? (
                appt.status === "ARRIVED" ? (
                  <Pressable
                    style={({ pressed }) => [styles.finishBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => setShowPaymentForm(true)}
                  >
                    <Ionicons name="card-outline" size={18} color="#fff" />
                    <Text style={styles.finishBtnText}>Registrar pago y terminar</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.emptyText}>Marca &quot;Llegó&quot; para registrar el pago</Text>
                )
              ) : (
                <>
                  {appt.type === "LASER" && selectedPackageId ? (
                    <View style={styles.includedBadge}>
                      <Ionicons name="cube" size={16} color={Colors.secondary} />
                      <Text style={styles.includedText}>Sesión incluida en paquete</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>Método de pago</Text>
                      <View style={styles.methodRow}>
                        {(["CASH", "CARD"] as const).map((m) => (
                          <Pressable
                            key={m}
                            style={[styles.methodBtn, paymentMethod === m && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                            onPress={() => setPaymentMethod(m)}
                          >
                            <Ionicons name={m === "CASH" ? "cash-outline" : "card-outline"} size={16} color={paymentMethod === m ? "#fff" : Colors.textSecondary} />
                            <Text style={[styles.methodBtnText, paymentMethod === m && { color: "#fff" }]}>
                              {m === "CASH" ? "Efectivo" : "Tarjeta"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.fieldLabel}>Monto total ($)</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </>
                  )}
                  <View style={styles.editBtns}>
                    <Pressable style={styles.cancelEditBtn} onPress={() => setShowPaymentForm(false)}>
                      <Text style={styles.cancelEditBtnText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveEditBtn, paymentMutation.isPending && { opacity: 0.5 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); paymentMutation.mutate(); }}
                      disabled={paymentMutation.isPending}
                    >
                      {paymentMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveEditBtnText}>Confirmar pago</Text>}
                    </Pressable>
                  </View>
                </>
              )}
            </SectionCard>
          )}

          <Pressable
            style={({ pressed }) => [styles.clientBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(`/client/${appt.clientId}`)}
          >
            <Ionicons name="person-outline" size={18} color={Colors.primary} />
            <Text style={styles.clientBtnText}>Ver perfil de {appt.client?.fullName}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      <Modal visible={showHistoryModal} transparent animationType="slide" onRequestClose={() => setShowHistoryModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historial rápido</Text>
              <Pressable onPress={() => setShowHistoryModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(historyAppts || []).slice(0, 8).map((h) => {
                const isLaserView = user?.role === "OWNER" || user?.role === "ADMIN";
                return (
                  <View key={h.id} style={styles.historyItem}>
                    <Text style={styles.historyDate}>{new Date(h.dateTimeStart).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} · {formatTime(h.dateTimeStart)}</Text>
                    <Text style={styles.historyStatus}>{STATUS_LABELS[h.status] || h.status}</Text>
                    {isLaserView && h.type === "LASER" ? (
                      <>
                        {!!h.clientPackage?.totalSessions && !!h.laserSession?.sessionNumber && (
                          <Text style={styles.historyMeta}>
                            📦 {(h.clientPackage.package?.name || "Paquete láser")} · Cita {h.laserSession.sessionNumber}/{h.clientPackage.totalSessions}
                          </Text>
                        )}
                        {!!h.laserSession?.powerByArea && (
                          <Text style={styles.historyMeta} numberOfLines={2}>
                            {Object.entries(h.laserSession.powerByArea).map(([area, val]) => `${area}: ${val}`).join(" · ")}
                          </Text>
                        )}
                        {!!h.payment && <Text style={styles.historyMeta}>Pago: ${h.payment.totalAmount}</Text>}
                      </>
                    ) : (
                      <Text style={styles.historyMeta}>{h.notes || "Sin notas"}</Text>
                    )}
                  </View>
                );
              })}
              {!historyAppts?.length && <Text style={styles.emptyText}>Sin historial disponible</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showLaserPowerModal} transparent animationType="slide" onRequestClose={() => setShowLaserPowerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Potencia por área</Text>
              <Pressable onPress={() => setShowLaserPowerModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {laserPowerAreas.map((area) => (
                <View key={area} style={styles.powerRow}>
                  <Text style={styles.powerLabel}>{area}</Text>
                  <TextInput
                    value={powerByArea[area] || ""}
                    onChangeText={(value) => setPowerByArea((prev) => ({ ...prev, [area]: value }))}
                    style={styles.powerInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              ))}
              <View style={styles.editBtns}>
                <Pressable style={styles.cancelEditBtn} onPress={() => setShowLaserPowerModal(false)}>
                  <Text style={styles.cancelEditBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveEditBtn, saveLaserPowerMutation.isPending && { opacity: 0.5 }]}
                  onPress={() => saveLaserPowerMutation.mutate()}
                  disabled={saveLaserPowerMutation.isPending}
                >
                  {saveLaserPowerMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveEditBtnText}>Guardar</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  topBanner: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 18, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  topBannerLeft: { gap: 3, flex: 1 },
  bannerType: { fontFamily: "Nunito_700Bold", fontSize: 11, letterSpacing: 1 },
  bannerClient: { fontFamily: "Nunito_800ExtraBold", fontSize: 20, color: Colors.text },
  bannerTime: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  bannerDate: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, textTransform: "capitalize" },
  statusBadgeLarge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  statusBadgeLargeText: { fontFamily: "Nunito_700Bold", fontSize: 12 },
  content: { paddingHorizontal: 16, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text, marginBottom: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  infoValue: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
  packageBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.secondary + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  packageBadgeText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.secondary },
  quickGrid: { flexDirection: "row", gap: 10 },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickBtnText: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.text },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, borderRadius: 12 },
  actionBtnText: { fontFamily: "Nunito_700Bold", fontSize: 12 },
  noShowText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary },
  reagendarBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  reagendarBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  serviceGrid: { gap: 8 },
  svcBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.background },
  svcBtnText: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  svcPrice: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.textMuted },
  svcChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + "80" },
  svcChipText: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  svcChipPrice: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.accent },
  pkgOption: { borderWidth: 2, borderColor: Colors.border, borderRadius: 12, padding: 12, gap: 8 },
  pkgOptionContent: { flexDirection: "row", justifyContent: "space-between" },
  pkgOptionName: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  pkgOptionStatus: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  pkgOptionMeta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  pkgProgress: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  pkgProgressFill: { height: 6, backgroundColor: Colors.secondary, borderRadius: 3 },
  notesInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, minHeight: 80, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text, textAlignVertical: "top" },
  notesText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  editLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  editLinkText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.primary },
  editBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelEditBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  cancelEditBtnText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.textSecondary },
  saveEditBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  saveEditBtnText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: "#fff" },
  fieldLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  methodRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  methodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface2 },
  methodBtnText: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.textSecondary },
  amountInput: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text, marginBottom: 4 },
  includedBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.secondary + "15", borderRadius: 10, padding: 12 },
  includedText: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.secondary },
  paidToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  paidToggleLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  markPaidBtn: { backgroundColor: Colors.success + "20", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  markPaidBtnText: { fontFamily: "Nunito_700Bold", fontSize: 12, color: Colors.success },
  finishBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  finishBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  clientBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  clientBtnText: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.primary },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted, fontStyle: "italic" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
    maxHeight: "82%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.text },
  historyItem: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.background,
  },
  historyDate: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.text },
  historyStatus: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.primary, marginTop: 2 },
  historyMeta: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  powerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  powerLabel: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
  powerInput: {
    width: 96,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "right",
  },
});
