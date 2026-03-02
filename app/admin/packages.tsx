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

export default function PackagesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");

  const { data: packages, isLoading } = useQuery<any[]>({
    queryKey: ["/api/packages"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/packages", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/packages", { name: name.trim(), totalSessions: Number(sessions), price: Number(price) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/packages"] });
      setShowForm(false); setName(""); setSessions(""); setPrice("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Paquetes láser</Text>
        <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={12}>
          <Ionicons name={showForm ? "remove" : "add"} size={24} color={Colors.primary} />
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Nuevo paquete</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre del paquete" />
          <TextInput style={styles.input} value={sessions} onChangeText={setSessions} placeholder="Total de sesiones" keyboardType="numeric" />
          <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="Precio ($)" keyboardType="numeric" />
          <Pressable style={styles.saveBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }} disabled={!name.trim() || !sessions || !price || createMutation.isPending}>
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : (
          <View style={styles.pkgList}>
            {(packages || []).map((pkg) => (
              <View key={pkg.id} style={styles.pkgCard}>
                <View style={styles.pkgIcon}>
                  <Ionicons name="cube" size={22} color={Colors.secondary} />
                </View>
                <View style={styles.pkgInfo}>
                  <Text style={styles.pkgName}>{pkg.name}</Text>
                  <Text style={styles.pkgSessions}>{pkg.totalSessions} sesiones</Text>
                </View>
                <Text style={styles.pkgPrice}>${pkg.price}</Text>
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
  input: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  list: { flex: 1, paddingHorizontal: 16 },
  pkgList: { gap: 8 },
  pkgCard: { backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pkgIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.secondary + "18", justifyContent: "center", alignItems: "center" },
  pkgInfo: { flex: 1 },
  pkgName: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  pkgSessions: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted },
  pkgPrice: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.primary },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
});
