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
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/users", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
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
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { password: password.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingPasswordUserId(null);
      setNewPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Éxito", "Contraseña actualizada");
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))} hitSlop={12}>
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
                  <View style={styles.userMainRow}>
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
                    <View style={styles.userActions}>
                      <Pressable
                        onPress={() => {
                          if (editingPasswordUserId === u.id) {
                            setEditingPasswordUserId(null);
                            setNewPassword("");
                            return;
                          }
                          setEditingPasswordUserId(u.id);
                          setNewPassword("");
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="key-outline" size={22} color={Colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => toggleMutation.mutate({ id: u.id, isActive: !u.isActive })} hitSlop={8}>
                        <Ionicons name={u.isActive ? "checkmark-circle" : "close-circle"} size={24} color={u.isActive ? Colors.success : Colors.error} />
                      </Pressable>
                    </View>
                  </View>

                  {editingPasswordUserId === u.id && (
                    <View style={styles.passwordEditor}>
                      <TextInput
                        style={styles.passwordInput}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        placeholder="Nueva contraseña"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <View style={styles.passwordActions}>
                        <Pressable
                          style={[styles.passwordBtn, styles.passwordCancelBtn]}
                          onPress={() => {
                            setEditingPasswordUserId(null);
                            setNewPassword("");
                          }}
                        >
                          <Text style={styles.passwordCancelText}>Cancelar</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.passwordBtn, styles.passwordSaveBtn, !newPassword.trim() && { opacity: 0.5 }]}
                          onPress={() => updatePasswordMutation.mutate({ id: u.id, password: newPassword })}
                          disabled={!newPassword.trim() || updatePasswordMutation.isPending}
                        >
                          {updatePasswordMutation.isPending ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.passwordSaveText}>Guardar</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}
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
  userCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  userMainRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  userAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  userAvatarText: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  userInfo: { flex: 1, gap: 3 },
  userActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  userName: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  userEmail: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  rolePill: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  passwordEditor: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  passwordInput: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.text },
  passwordActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  passwordBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 90, alignItems: "center" },
  passwordCancelBtn: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  passwordSaveBtn: { backgroundColor: Colors.primary },
  passwordCancelText: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  passwordSaveText: { fontFamily: "Nunito_700Bold", fontSize: 13, color: "#fff" },
  center: { justifyContent: "center", alignItems: "center", paddingVertical: 60 },
});
