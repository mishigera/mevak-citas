import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function BlocksScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");

  const { data: blocks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/blocks", base);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/blocks", {
        startDateTime: `${startDate}T${startTime}:00.000Z`,
        endDateTime: `${endDate}T${endTime}:00.000Z`,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/blocks"] });
      setShowForm(false);
      setReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/blocks/${id}`, undefined);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/blocks"] }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const handleDelete = (id: string) => {
    Alert.alert("Eliminar bloqueo", "¿Confirmas eliminar este bloqueo?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Mis bloqueos</Text>
        <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={12}>
          <Ionicons name={showForm ? "remove" : "add"} size={24} color={Colors.primary} />
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Nuevo bloqueo</Text>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Fecha inicio</Text>
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Hora inicio</Text>
              <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="HH:MM" keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Fecha fin</Text>
              <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Hora fin</Text>
              <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="HH:MM" keyboardType="numeric" />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Razón (opcional)</Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Ej: Vacaciones, no trabajo" />
          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar bloqueo</Text>}
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : !blocks?.length ? (
          <View style={styles.empty}>
            <Ionicons name="ban-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sin bloqueos</Text>
            <Text style={styles.emptyText}>Toca + para agregar un bloqueo de disponibilidad</Text>
          </View>
        ) : (
          <View style={styles.blockList}>
            {blocks.map((b) => (
              <View key={b.id} style={styles.blockCard}>
                <View style={styles.blockIconBox}>
                  <Ionicons name="ban" size={22} color={Colors.warning} />
                </View>
                <View style={styles.blockContent}>
                  <Text style={styles.blockDate}>{formatDateTime(b.startDateTime)}</Text>
                  <Text style={styles.blockDate}>{formatDateTime(b.endDateTime)}</Text>
                  {b.reason && <Text style={styles.blockReason}>{b.reason}</Text>}
                </View>
                <Pressable onPress={() => handleDelete(b.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </Pressable>
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
  form: { backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  formTitle: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text, marginBottom: 4 },
  formRow: { flexDirection: "row", gap: 10 },
  fieldLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  list: { flex: 1, paddingHorizontal: 16 },
  blockList: { gap: 10 },
  blockCard: { backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  blockIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.warning + "20", justifyContent: "center", alignItems: "center" },
  blockContent: { flex: 1, gap: 2 },
  blockDate: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
  blockReason: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  emptyText: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
});
