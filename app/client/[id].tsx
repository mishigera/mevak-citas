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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { useAuth } from "@/contexts/auth";
import * as Haptics from "expo-haptics";

const TABS = ["Resumen", "Faciales", "Láser", "Clínica"] as const;
type Tab = typeof TABS[number];

const PHOTOTYPES = [
  { num: 1, skin: "#FDECD0", desc: "Siempre se quema, nunca se broncea. Muy blanca." },
  { num: 2, skin: "#F8D5B0", desc: "Generalmente se quema, rara vez se broncea." },
  { num: 3, skin: "#E8B88A", desc: "A veces se quema levemente, se broncea gradualmente." },
  { num: 4, skin: "#C4956A", desc: "Mínimamente se quema, siempre se broncea bien." },
  { num: 5, skin: "#A0714A", desc: "Raramente se quema, se broncea profundamente." },
  { num: 6, skin: "#6B4226", desc: "Nunca se quema. Pigmentación profunda." },
];

const CONDITIONS_LIST = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertensión" },
  { key: "renales", label: "Enfermedades renales" },
  { key: "cardiacas", label: "Cardiopatías" },
  { key: "circulatorias", label: "Problemas circulatorios" },
  { key: "digestivas", label: "Enfermedades digestivas" },
  { key: "pulmonares", label: "Enfermedades pulmonares" },
  { key: "endocrinas", label: "Endocrinopatías" },
  { key: "neurologicas", label: "Enfermedades neurológicas" },
  { key: "hematologicas", label: "Hemopatías" },
  { key: "dermatologicas", label: "Enfermedades dermatológicas" },
];

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function StatusPill({ status }: { status: string }) {
  const color = Colors.statusColors[status as keyof typeof Colors.statusColors] || Colors.textMuted;
  const labels: Record<string, string> = { SCHEDULED: "Agendada", ARRIVED: "Llegó", NO_SHOW: "No llegó", DONE: "Hecha", CANCELLED: "Cancelada" };
  return <View style={[styles.pill, { backgroundColor: color + "20" }]}><Text style={[styles.pillText, { color }]}>{labels[status] || status}</Text></View>;
}

export default function ClientDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { canViewClinical, isOwnerOrAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const [clinical, setClinical] = useState<any>(null);
  const [clinicalEditing, setClinicalEditing] = useState(false);

  const { data: client, isLoading } = useQuery<any>({
    queryKey: ["/api/clients", id],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${id}`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<any>;
    },
  });

  const { data: appointments } = useQuery<any[]>({
    queryKey: ["/api/clients", id, "appointments"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${id}/appointments`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
  });

  const { data: packages } = useQuery<any[]>({
    queryKey: ["/api/clients", id, "packages"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${id}/packages`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
  });

  const { data: clinicalData } = useQuery<any>({
    queryKey: ["/api/clients", id, "clinical"],
    enabled: canViewClinical,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/clients/${id}/clinical`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      const data = await res.json() as any;
      const defaultConditions = Object.fromEntries(CONDITIONS_LIST.map((c) => [c.key, false]));
      const obj = data || { allergiesFlag: false, conditionsJson: defaultConditions, phototype: null };
      setClinical(obj);
      return obj;
    },
  });

  const saveClinicalMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/clients/${id}/clinical`, clinical);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clients", id, "clinical"] });
      setClinicalEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const facialAppts = (appointments || []).filter((a) => a.type === "FACIAL");
  const laserAppts = (appointments || []).filter((a) => a.type === "LASER");

  const initials = (client?.fullName || "?").split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() || "").join("");

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  function renderResumen() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información personal</Text>
          {[
            ["Teléfono", client?.phone],
            ["Correo", client?.email],
            ["Nacimiento", formatDate(client?.birthDate)],
            ["Sexo", client?.sex === "F" ? "Femenino" : client?.sex === "M" ? "Masculino" : "-"],
            ["Ocupación", client?.occupation],
          ].map(([label, value]) =>
            value ? (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
              </View>
            ) : null
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.newApptBtn, pressed && { opacity: 0.8 }]}
          onPress={() => router.push({ pathname: "/appointment/new", params: { clientId: id, clientName: client?.fullName } })}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.newApptBtnText}>Nueva cita</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Últimas citas</Text>
          {(appointments || []).slice(0, 3).map((a: any) => (
            <Pressable key={a.id} style={styles.apptRow} onPress={() => router.push(`/appointment/${a.id}`)}>
              <View style={[styles.apptTypeDot, { backgroundColor: a.type === "LASER" ? Colors.secondary : Colors.accent }]} />
              <View style={styles.apptRowContent}>
                <Text style={styles.apptRowDate}>{formatDate(a.dateTimeStart)}</Text>
                <Text style={styles.apptRowTime}>{formatTime(a.dateTimeStart)}</Text>
              </View>
              <StatusPill status={a.status} />
            </Pressable>
          ))}
          {!appointments?.length && <Text style={styles.emptyText}>Sin citas registradas</Text>}
        </View>
      </View>
    );
  }

  function renderFaciales() {
    return (
      <View style={styles.tabContent}>
        {facialAppts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin citas faciales</Text>
          </View>
        ) : (
          facialAppts.map((a: any) => (
            <Pressable key={a.id} style={[styles.card, { padding: 14 }]} onPress={() => router.push(`/appointment/${a.id}`)}>
              <View style={styles.apptCardHeader}>
                <Text style={styles.apptCardDate}>{formatDate(a.dateTimeStart)}</Text>
                <StatusPill status={a.status} />
              </View>
              {a.services?.length > 0 && <Text style={styles.apptCardServices}>{a.services.map((s: any) => s?.name).join(", ")}</Text>}
              {a.staff && <Text style={styles.apptCardStaff}>{a.staff.name}</Text>}
              {a.payment && <Text style={styles.apptCardPayment}>${a.payment.totalAmount} · {a.payment.method}</Text>}
              {a.notes && <Text style={styles.apptCardNotes}>{a.notes}</Text>}
            </Pressable>
          ))
        )}
      </View>
    );
  }

  function renderLaser() {
    return (
      <View style={styles.tabContent}>
        {(packages || []).map((cp: any) => (
          <View key={cp.id} style={styles.card}>
            <Text style={styles.cardTitle}>Paquete láser</Text>
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>{cp.usedSessions}/{cp.totalSessions} sesiones</Text>
              <Text style={[styles.progressStatus, { color: cp.status === "ACTIVE" ? Colors.success : Colors.textMuted }]}>
                {cp.status === "ACTIVE" ? "Activo" : cp.status === "FINISHED" ? "Terminado" : "Pausado"}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(cp.usedSessions / cp.totalSessions) * 100}%` }]} />
            </View>
            <Text style={styles.progressDate}>Inicio: {formatDate(cp.startDate)}</Text>
          </View>
        ))}

        {laserAppts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="flash-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin sesiones láser</Text>
          </View>
        ) : (
          laserAppts.map((a: any) => (
            <Pressable key={a.id} style={[styles.card, { padding: 14 }]} onPress={() => router.push(`/appointment/${a.id}`)}>
              <View style={styles.apptCardHeader}>
                <Text style={styles.apptCardDate}>{formatDate(a.dateTimeStart)}</Text>
                <StatusPill status={a.status} />
              </View>
              {a.staff && <Text style={styles.apptCardStaff}>{a.staff.name}</Text>}
              {a.notes && <Text style={styles.apptCardNotes}>{a.notes}</Text>}
            </Pressable>
          ))
        )}
      </View>
    );
  }

  function renderClinica() {
    if (!canViewClinical) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Acceso restringido</Text>
          <Text style={styles.emptySubtitle}>No tienes permiso para ver la historia clínica</Text>
        </View>
      );
    }

    const clin = clinical || clinicalData;
    if (!clin) return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;

    if (!clinicalEditing) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Historia clínica</Text>
              <Pressable onPress={() => setClinicalEditing(true)} style={styles.editIconBtn}>
                <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
              </Pressable>
            </View>
            {clin.phototype && (
              <View style={styles.phototypeDisplay}>
                <View style={[styles.phototypeCircle, { backgroundColor: PHOTOTYPES[(clin.phototype - 1)]?.skin }]} />
                <Text style={styles.phototypeText}>Fototipo {clin.phototype}: {PHOTOTYPES[(clin.phototype - 1)]?.desc}</Text>
              </View>
            )}
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Alergias</Text><Text style={styles.infoValue}>{clin.allergiesFlag ? (clin.allergiesText || "Sí") : "No"}</Text></View>
            {clin.medsText && <View style={styles.infoRow}><Text style={styles.infoLabel}>Medicamentos</Text><Text style={styles.infoValue}>{clin.medsText}</Text></View>}
            {clin.surgeriesText && <View style={styles.infoRow}><Text style={styles.infoLabel}>Cirugías</Text><Text style={styles.infoValue}>{clin.surgeriesText}</Text></View>}
            {clin.eyeColor && <View style={styles.infoRow}><Text style={styles.infoLabel}>Color de ojos</Text><Text style={styles.infoValue}>{clin.eyeColor}</Text></View>}
            {clin.hairColor && <View style={styles.infoRow}><Text style={styles.infoLabel}>Color de cabello</Text><Text style={styles.infoValue}>{clin.hairColor}</Text></View>}
            {clin.conditionsJson && (
              <>
                <Text style={[styles.cardTitle, { fontSize: 13, marginTop: 8 }]}>Antecedentes</Text>
                {CONDITIONS_LIST.map((c) =>
                  clin.conditionsJson[c.key] ? (
                    <View key={c.key} style={styles.conditionRow}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.warning} />
                      <Text style={styles.conditionLabel}>{c.label}</Text>
                    </View>
                  ) : null
                )}
              </>
            )}
          </View>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fototipo de piel</Text>
          <View style={styles.phototypeGrid}>
            {PHOTOTYPES.map((pt) => (
              <Pressable
                key={pt.num}
                style={[styles.phototypeCard, clin?.phototype === pt.num && styles.phototypeCardSelected]}
                onPress={() => setClinical((prev: any) => ({ ...prev, phototype: pt.num }))}
              >
                <View style={[styles.phototypeCardCircle, { backgroundColor: pt.skin }]} />
                <Text style={styles.phototypeCardNum}>Tipo {pt.num}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alergias</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Tiene alergias</Text>
            <Switch
              value={clin?.allergiesFlag}
              onValueChange={(v) => setClinical((p: any) => ({ ...p, allergiesFlag: v }))}
              trackColor={{ true: Colors.primary }}
            />
          </View>
          {clin?.allergiesFlag && (
            <TextInput
              style={styles.clinInput}
              value={clin?.allergiesText || ""}
              onChangeText={(v) => setClinical((p: any) => ({ ...p, allergiesText: v }))}
              placeholder="Describir alergias..."
              multiline
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Antecedentes médicos</Text>
          {CONDITIONS_LIST.map((c) => (
            <View key={c.key} style={styles.switchRow}>
              <Text style={styles.switchLabel}>{c.label}</Text>
              <Switch
                value={!!clin?.conditionsJson?.[c.key]}
                onValueChange={(v) => setClinical((p: any) => ({ ...p, conditionsJson: { ...p.conditionsJson, [c.key]: v } }))}
                trackColor={{ true: Colors.primary }}
              />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Otros</Text>
          {[
            ["medsText", "Medicamentos actuales"],
            ["surgeriesText", "Cirugías previas"],
            ["eyeColor", "Color de ojos"],
            ["hairColor", "Color de cabello"],
          ].map(([key, label]) => (
            <View key={key} style={styles.clinField}>
              <Text style={styles.clinFieldLabel}>{label}</Text>
              <TextInput
                style={styles.clinInput}
                value={clin?.[key] || ""}
                onChangeText={(v) => setClinical((p: any) => ({ ...p, [key]: v }))}
                placeholder={label}
              />
            </View>
          ))}
        </View>

        <View style={styles.editBtns}>
          <Pressable style={styles.cancelEditBtn} onPress={() => { setClinical(clinicalData); setClinicalEditing(false); }}>
            <Text style={styles.cancelEditBtnText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.saveEditBtn, saveClinicalMutation.isPending && { opacity: 0.5 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); saveClinicalMutation.mutate(); }}
            disabled={saveClinicalMutation.isPending}
          >
            {saveClinicalMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveEditBtnText}>Guardar</Text>}
          </Pressable>
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerAvatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.clientHeader}>
        <Text style={styles.clientName}>{client?.fullName}</Text>
        <Text style={styles.clientPhone}>{client?.phone}</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.filter((t) => t !== "Clínica" || canViewClinical).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(tab); }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {activeTab === "Resumen" && renderResumen()}
        {activeTab === "Faciales" && renderFaciales()}
        {activeTab === "Láser" && renderLaser()}
        {activeTab === "Clínica" && renderClinica()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, justifyContent: "center", alignItems: "center" },
  avatarText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.primaryDark },
  clientHeader: { alignItems: "center", paddingBottom: 16, gap: 4 },
  clientName: { fontFamily: "Nunito_800ExtraBold", fontSize: 22, color: Colors.text },
  clientPhone: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary },
  tabs: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, backgroundColor: "transparent" },
  tabActive: { backgroundColor: Colors.primaryLight },
  tabText: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textMuted },
  tabTextActive: { color: Colors.primaryDark },
  tabContent: { paddingHorizontal: 16, gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editIconBtn: { padding: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  infoLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  infoValue: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text, flex: 2, textAlign: "right" },
  newApptBtn: { backgroundColor: Colors.primary, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  newApptBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + "60" },
  apptTypeDot: { width: 8, height: 8, borderRadius: 4 },
  apptRowContent: { flex: 1 },
  apptRowDate: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
  apptRowTime: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  apptCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  apptCardDate: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  apptCardServices: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary },
  apptCardStaff: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  apptCardPayment: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.success },
  apptCardNotes: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, fontStyle: "italic" },
  progressContainer: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.text },
  progressStatus: { fontFamily: "Nunito_600SemiBold", fontSize: 13 },
  progressBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: Colors.secondary, borderRadius: 4 },
  progressDate: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  phototypeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  phototypeCard: { flex: 1, minWidth: "28%", alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: "#fff", gap: 4 },
  phototypeCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  phototypeCardCircle: { width: 36, height: 36, borderRadius: 18 },
  phototypeCardNum: { fontFamily: "Nunito_700Bold", fontSize: 12, color: Colors.text },
  phototypeDisplay: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  phototypeCircle: { width: 32, height: 32, borderRadius: 16 },
  phototypeText: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  switchLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  conditionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  conditionLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.warning },
  clinField: { gap: 4, marginBottom: 10 },
  clinFieldLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  clinInput: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptySubtitle: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textMuted },
  editBtns: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  cancelEditBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelEditBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  saveEditBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  saveEditBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: "#fff" },
});
