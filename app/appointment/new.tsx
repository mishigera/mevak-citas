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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={styles.selectRow} onPress={onPress}>
      <Text style={[styles.selectVal, !value && { color: Colors.textMuted }]}>{value || `Seleccionar ${label}`}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function NewAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const qc = useQueryClient();

  const [clientId, setClientId] = useState<string>(params.clientId as string || "");
  const [clientName, setClientName] = useState<string>(params.clientName as string || "");
  const [staffId, setStaffId] = useState<string>("");
  const [staffName, setStaffName] = useState<string>("");
  const [type, setType] = useState<"FACIAL" | "LASER">("FACIAL");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState<string>("10:00");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [notes, setNotes] = useState<string>("");
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const authH = () => ({ Authorization: `Bearer ${getAuthToken() || ""}` });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/clients", base);
      const res = await fetch(url.toString(), { headers: authH() });
      return res.json() as Promise<any[]>;
    },
  });

  const { data: staff } = useQuery<any[]>({
    queryKey: ["/api/users/staff"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/users/staff", base);
      const res = await fetch(url.toString(), { headers: authH() });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const dateTimeStart = `${date}T${startTime}:00.000Z`;
      const dateTimeEnd = `${date}T${endTime}:00.000Z`;
      const res = await apiRequest("POST", "/api/appointments", {
        dateTimeStart,
        dateTimeEnd,
        clientId,
        staffId,
        type,
        notes,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.push(`/appointment/${data.id}`);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const filteredClients = (clients || []).filter((c) =>
    c.fullName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  if (showClientPicker) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.pickerHeader}>
          <Pressable onPress={() => setShowClientPicker(false)}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.pickerTitle}>Seleccionar cliente</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar..."
            value={clientSearch}
            onChangeText={setClientSearch}
            autoFocus
          />
        </View>
        <ScrollView style={styles.pickerList}>
          {filteredClients.map((c) => (
            <Pressable
              key={c.id}
              style={styles.pickerItem}
              onPress={() => { setClientId(c.id); setClientName(c.fullName); setShowClientPicker(false); }}
            >
              <Text style={styles.pickerItemText}>{c.fullName}</Text>
              <Text style={styles.pickerItemSub}>{c.phone}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (showStaffPicker) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.pickerHeader}>
          <Pressable onPress={() => setShowStaffPicker(false)}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.pickerTitle}>Seleccionar staff</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.pickerList}>
          {(staff || []).map((s) => (
            <Pressable
              key={s.id}
              style={styles.pickerItem}
              onPress={() => { setStaffId(s.id); setStaffName(s.name); setShowStaffPicker(false); }}
            >
              <Text style={styles.pickerItemText}>{s.name}</Text>
              <Text style={styles.pickerItemSub}>{s.role === "OWNER" ? "Laserista/Owner" : "Facialista"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Nueva cita</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Label>Tipo de cita</Label>
          <View style={styles.typeRow}>
            {(["FACIAL", "LASER"] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.typeBtn, type === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => setType(t)}
              >
                <Ionicons name={t === "FACIAL" ? "sparkles" : "flash"} size={18} color={type === t ? "#fff" : Colors.textSecondary} />
                <Text style={[styles.typeBtnText, type === t && { color: "#fff" }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Label>Cliente</Label>
          <Row label="cliente" value={clientName} onPress={() => setShowClientPicker(true)} />
        </View>

        <View style={styles.section}>
          <Label>Staff asignado</Label>
          <Row label="staff" value={staffName} onPress={() => setShowStaffPicker(true)} />
        </View>

        <View style={styles.section}>
          <Label>Fecha</Label>
          <TextInput
            style={styles.textInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Label>Hora inicio</Label>
          <TextInput
            style={styles.textInput}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="HH:MM"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Label>Hora fin</Label>
          <TextInput
            style={styles.textInput}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="HH:MM"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Label>Notas (opcional)</Label>
          <TextInput
            style={[styles.textInput, { minHeight: 80, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notas sobre la cita..."
            multiline
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, (!clientId || !staffId) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }}
          disabled={!clientId || !staffId || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Crear cita</Text>
          )}
        </Pressable>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  scroll: { flex: 1, paddingHorizontal: 20 },
  section: { marginBottom: 18 },
  label: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: "#fff",
  },
  typeBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.textSecondary },
  selectRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectVal: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text, flex: 1 },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#fff" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  pickerTitle: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 15, color: Colors.text },
  pickerList: { flex: 1 },
  pickerItem: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerItemText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  pickerItemSub: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
