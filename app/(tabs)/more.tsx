import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import * as Haptics from "expo-haptics";

function MenuItem({
  icon,
  label,
  sublabel,
  onPress,
  color,
  danger,
}: {
  icon: any;
  label: string;
  sublabel?: string;
  onPress: () => void;
  color?: string;
  danger?: boolean;
}) {
  const iconColor = danger ? Colors.error : color || Colors.primary;
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, danger && { color: Colors.error }]}>{label}</Text>
        {sublabel && <Text style={styles.menuSublabel}>{sublabel}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, canCreateBlocks, canManageServices, canViewReports, isOwnerOrAdmin } = useAuth();

  const roleLabels: Record<string, string> = {
    ADMIN: "Administrador",
    OWNER: "Propietaria / Laserista",
    RECEPTION: "Recepcionista",
    FACIALIST: "Facialista",
  };

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar tu sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } finally {
            router.replace("/login");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <Text style={styles.title}>Más</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={28} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>{roleLabels[user?.role || ""] || user?.role}</Text>
          </View>
        </View>

        {canCreateBlocks && (
          <Section title="Disponibilidad">
            <MenuItem
              icon="ban-outline"
              label="Mis bloqueos"
              sublabel="Gestionar días/horas no disponibles"
              color={Colors.warning}
              onPress={() => router.push("/blocks")}
            />
          </Section>
        )}

        {isOwnerOrAdmin && (
          <Section title="Pagos">
            <MenuItem
              icon="cash-outline"
              label="Pagos pendientes facialistas"
              sublabel="Ver y liquidar pagos"
              color={Colors.success}
              onPress={() => router.push("/admin/payments")}
            />
          </Section>
        )}

        {canViewReports && (
          <Section title="Reportes">
            <MenuItem
              icon="bar-chart-outline"
              label="Reporte de ingresos"
              sublabel="Ingresos por mes"
              color={Colors.secondary}
              onPress={() => router.push("/admin/reports")}
            />
          </Section>
        )}

        {canManageServices && (
          <Section title="Administración">
            <MenuItem
              icon="grid-outline"
              label="Servicios"
              sublabel="Catálogo de servicios faciales y láser"
              onPress={() => router.push("/admin/services")}
            />
            <MenuItem
              icon="cube-outline"
              label="Paquetes"
              sublabel="Paquetes de sesiones láser"
              onPress={() => router.push("/admin/packages")}
            />
            <MenuItem
              icon="people-outline"
              label="Usuarios"
              sublabel="Gestionar staff"
              onPress={() => router.push("/admin/users")}
            />
          </Section>
        )}

        <Section title="Sesión">
          <MenuItem
            icon="log-out-outline"
            label="Cerrar sesión"
            onPress={handleLogout}
            danger
          />
        </Section>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontFamily: "Nunito_800ExtraBold", fontSize: 26, color: Colors.text, paddingHorizontal: 20, marginBottom: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: { fontFamily: "Nunito_700Bold", fontSize: 17, color: Colors.text },
  profileRole: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontFamily: "Nunito_700Bold", fontSize: 12, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginLeft: 20, marginBottom: 8 },
  sectionCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 14,
  },
  menuIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuText: { flex: 1 },
  menuLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },
  menuSublabel: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 1 },
});
