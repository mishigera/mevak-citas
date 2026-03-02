import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"FACIAL" | "LASER">("FACIAL");
  const [price, setPrice] = useState("");

  const { data: services, isLoading } = useQuery<any[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/services", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/services", { name: name.trim(), type, price: Number(price) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/services"] });
      setShowForm(false);
      setName(""); setPrice("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/services/${id}`, { isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/services"] }),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Servicios</Text>
        <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={12}>
          <Ionicons name={showForm ? "remove" : "add"} size={24} color={Colors.primary} />
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Nuevo servicio</Text>
          <View style={styles.typeRow}>
            {(["FACIAL", "LASER"] as const).map((t) => (
              <Pressable key={t} style={[styles.typeBtn, type === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setType(t)}>
                <Text style={[styles.typeBtnText, type === t && { color: "#fff" }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre del servicio" />
          <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="Precio ($)" keyboardType="numeric" />
          <Pressable style={styles.saveBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }} disabled={!name.trim() || !price || createMutation.isPending}>
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : (
          <View style={styles.svcList}>
            {(services || []).map((svc) => (
              <View key={svc.id} style={styles.svcCard}>
                <View style={[styles.svcType, { backgroundColor: svc.type === "LASER" ? Colors.secondary + "20" : Colors.accent + "20" }]}>
                  <Text style={[styles.svcTypeText, { color: svc.type === "LASER" ? Colors.secondary : Colors.accent }]}>{svc.type}</Text>
                </View>
                <View style={styles.svcInfo}>
                  <Text style={styles.svcName}>{svc.name}</Text>
                  <Text style={styles.svcPrice}>${svc.price}</Text>
                </View>
                <Pressable
                  onPress={() => toggleMutation.mutate({ id: svc.id, isActive: !svc.isActive })}
                  hitSlop={8}
                >
                  <Ionicons name={svc.isActive ? "eye-outline" : "eye-off-outline"} size={20} color={svc.isActive ? Colors.success : Colors.textMuted} />
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
  form: { backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, gap: 10 },
  formTitle: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: "center" },
  typeBtnText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.textSecondary },
  input: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  list: { flex: 1, paddingHorizontal: 16 },
  svcList: { gap: 8 },
  svcCard: { backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  svcType: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  svcTypeText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  svcInfo: { flex: 1 },
  svcName: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  svcPrice: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primary },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
});
