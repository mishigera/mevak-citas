import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

const ROLES = ["ADMIN", "OWNER", "RECEPTION", "FACIALIST"] as const;
const ROLE_LABELS: Record<string, string> = { ADMIN: "Admin", OWNER: "Owner/Laserista", RECEPTION: "Recepcionista", FACIALIST: "Facialista" };
const ROLE_COLORS: Record<string, string> = { ADMIN: Colors.error, OWNER: Colors.primary, RECEPTION: Colors.secondary, FACIALIST: Colors.accent };

export default function UsersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("FACIALIST");

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/users", base);
      const res = await fetch(url.toString(), { credentials: "include" });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users", { name: name.trim(), email: email.trim().toLowerCase(), password, role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setShowForm(false); setName(""); setEmail(""); setPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/users"] }),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Usuarios</Text>
        <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={12}>
          <Ionicons name={showForm ? "remove" : "add"} size={24} color={Colors.primary} />
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Nuevo usuario</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre completo" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo electrónico" keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Contraseña" secureTextEntry />
          <Text style={styles.roleLabel}>Rol</Text>
          <View style={styles.roleGrid}>
            {ROLES.map((r) => (
              <Pressable key={r} style={[styles.roleBtn, role === r && { backgroundColor: ROLE_COLORS[r] + "20", borderColor: ROLE_COLORS[r] }]} onPress={() => setRole(r)}>
                <Text style={[styles.roleBtnText, role === r && { color: ROLE_COLORS[r] }]}>{ROLE_LABELS[r]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.saveBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }} disabled={!name.trim() || !email.trim() || !password || createMutation.isPending}>
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Crear usuario</Text>}
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : (
          <View style={styles.userList}>
            {(users || []).map((u) => {
              const initials = u.name.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() || "").join("");
              const roleColor = ROLE_COLORS[u.role] || Colors.primary;
              return (
                <View key={u.id} style={styles.userCard}>
                  <View style={[styles.userAvatar, { backgroundColor: roleColor + "20" }]}>
                    <Text style={[styles.userAvatarText, { color: roleColor }]}>{initials}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{u.name}</Text>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <View style={[styles.rolePill, { backgroundColor: roleColor + "18" }]}>
                      <Text style={[styles.rolePillText, { color: roleColor }]}>{ROLE_LABELS[u.role]}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => toggleMutation.mutate({ id: u.id, isActive: !u.isActive })} hitSlop={8}>
                    <Ionicons name={u.isActive ? "checkmark-circle" : "close-circle"} size={24} color={u.isActive ? Colors.success : Colors.error} />
                  </Pressable>
                </View>
              );
            })}
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
  roleLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 2, borderColor: Colors.border },
  roleBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15, color: "#fff" },
  list: { flex: 1, paddingHorizontal: 16 },
  userList: { gap: 8 },
  userCard: { backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  userAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  userAvatarText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  userEmail: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  rolePill: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
});
