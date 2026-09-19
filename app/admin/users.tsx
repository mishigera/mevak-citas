import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton } from "@/components/glass";
import { Entrar, PressableMotion, Stagger } from "@/components/motion";
import { BotonPrimario, CampoTexto, PanelFormulario } from "@/components/Formulario";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

const ROLES = ["OWNER", "RECEPTION", "FACIALIST"] as const;
const ROLE_LABELS: Record<string, string> = { OWNER: "Dueña/Laserista", RECEPTION: "Recepcionista", FACIALIST: "Facialista" };
const ROLE_COLORS: Record<string, string> = { OWNER: Colors.primary, RECEPTION: Colors.secondary, FACIALIST: Colors.accent };

export default function UsersScreen() {
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
    <Screen
      title="Usuarios"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      action={
        <GlassIconButton
          name={showForm ? "remove" : "add"}
          variant="primary"
          accessibilityLabel={showForm ? "Cerrar formulario" : "Nuevo usuario"}
          onPress={() => setShowForm((v) => !v)}
        />
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {showForm && (
          <PanelFormulario titulo="Nuevo usuario">
            <CampoTexto value={name} onChangeText={setName} placeholder="Nombre completo" />
            <CampoTexto
              value={email}
              onChangeText={setEmail}
              placeholder="Correo electrónico"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <CampoTexto value={password} onChangeText={setPassword} placeholder="Contraseña" secureTextEntry />
            <Text style={styles.roleLabel}>Rol</Text>
            <View style={styles.roleGrid}>
              {ROLES.map((r) => (
                <PressableMotion
                  key={r}
                  gesto="sutil"
                  accessibilityLabel={ROLE_LABELS[r]}
                  accessibilityState={{ selected: role === r }}
                  style={[
                    styles.roleBtn,
                    role === r && { backgroundColor: ROLE_COLORS[r] + "20", borderColor: ROLE_COLORS[r] },
                  ]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleBtnText, role === r && { color: ROLE_COLORS[r] }]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </PressableMotion>
              ))}
            </View>
            <BotonPrimario
              titulo="Crear usuario"
              cargando={createMutation.isPending}
              disabled={!name.trim() || !email.trim() || !password}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                createMutation.mutate();
              }}
            />
          </PanelFormulario>
        )}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : (users || []).length === 0 ? (
          <EstadoVacio icono="people-outline" titulo="Sin usuarios" texto="Toca + para dar de alta al staff" />
        ) : (
          <Stagger style={styles.lista}>
            {(users || []).map((u) => {
              const initials = u.name.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() || "").join("");
              const roleColor = ROLE_COLORS[u.role] || Colors.primary;
              return (
                <GlassCard key={u.id} radius={Radius.card}>
                  <View style={styles.tarjeta}>
                    <View style={styles.filaPrincipal}>
                      <View style={[styles.avatar, { backgroundColor: roleColor + "20" }]}>
                        <Text style={[styles.avatarTexto, { color: roleColor }]}>{initials}</Text>
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.nombre}>{u.name}</Text>
                        <Text style={styles.correo}>{u.email}</Text>
                        <View style={[styles.rolePill, { backgroundColor: roleColor + "18" }]}>
                          <Text style={[styles.rolePillText, { color: roleColor }]}>{ROLE_LABELS[u.role]}</Text>
                        </View>
                      </View>
                      <View style={styles.acciones}>
                        <PressableMotion
                          gesto="escala"
                          hitSlop={8}
                          accessibilityLabel="Cambiar contraseña"
                          onPress={() => {
                            if (editingPasswordUserId === u.id) {
                              setEditingPasswordUserId(null);
                              setNewPassword("");
                              return;
                            }
                            setEditingPasswordUserId(u.id);
                            setNewPassword("");
                          }}
                        >
                          <Ionicons name="key-outline" size={22} color={Colors.primary} />
                        </PressableMotion>
                        <PressableMotion
                          gesto="escala"
                          hitSlop={8}
                          accessibilityLabel={u.isActive ? "Desactivar usuario" : "Activar usuario"}
                          onPress={() => toggleMutation.mutate({ id: u.id, isActive: !u.isActive })}
                        >
                          <Ionicons
                            name={u.isActive ? "checkmark-circle" : "close-circle"}
                            size={24}
                            color={u.isActive ? Colors.success : Colors.error}
                          />
                        </PressableMotion>
                      </View>
                    </View>

                    {editingPasswordUserId === u.id && (
                      /* El editor no aparece de golpe: entra como todo lo demás. */
                      <Entrar style={styles.editorClave}>
                        <CampoTexto
                          value={newPassword}
                          onChangeText={setNewPassword}
                          secureTextEntry
                          placeholder="Nueva contraseña"
                        />
                        <View style={styles.editorAcciones}>
                          <PressableMotion
                            gesto="sutil"
                            accessibilityLabel="Cancelar"
                            style={[styles.botonClave, styles.botonCancelar]}
                            onPress={() => {
                              setEditingPasswordUserId(null);
                              setNewPassword("");
                            }}
                          >
                            <Text style={styles.textoCancelar}>Cancelar</Text>
                          </PressableMotion>
                          <BotonPrimario
                            titulo="Guardar"
                            style={styles.botonClave}
                            cargando={updatePasswordMutation.isPending}
                            disabled={!newPassword.trim()}
                            onPress={() => updatePasswordMutation.mutate({ id: u.id, password: newPassword })}
                          />
                        </View>
                      </Entrar>
                    )}
                  </View>
                </GlassCard>
              );
            })}
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.lg },
  lista: { gap: Space.sm },
  roleLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.tile / 2,
    borderWidth: 2,
    borderColor: Colors.glass.strokeSoft,
  },
  roleBtnText: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  tarjeta: { padding: Space.lg - 2 },
  filaPrincipal: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  avatarTexto: { fontFamily: "Nunito_700Bold", fontSize: 16 },
  info: { flex: 1, gap: 3 },
  acciones: { flexDirection: "row", alignItems: "center", gap: Space.md - 2 },
  nombre: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  correo: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  rolePill: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: Space.sm, paddingVertical: 2 },
  rolePillText: { fontFamily: "Nunito_700Bold", fontSize: 10 },

  editorClave: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.strokeSoft,
    gap: Space.md - 2,
  },
  editorAcciones: { flexDirection: "row", justifyContent: "flex-end", gap: Space.sm },
  botonClave: { minWidth: 100, paddingHorizontal: Space.lg - 2, paddingVertical: Space.md - 2 },
  botonCancelar: {
    borderWidth: 1,
    borderColor: Colors.glass.strokeSoft,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  textoCancelar: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary },
});
