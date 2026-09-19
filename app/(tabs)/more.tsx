import React from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useBreakpoint } from "@/lib/responsive";
import { ContentColumn, Screen, useScreenLayout } from "@/components/Screen";
import { GlassCard } from "@/components/glass";
import { PressableMotion, Stagger } from "@/components/motion";
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
    <PressableMotion
      gesto="sutil"
      accessibilityLabel={label}
      style={styles.menuItem}
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
    </PressableMotion>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // El ancho de la celda lo pone el envoltorio del escalonado (ver `Cuerpo`), no
    // esta seccion: si lo pusieran los dos, en iPad cada tarjeta mediria el 48% del
    // 48% y quedarian cuatro columnas flacas.
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <GlassCard radius={Radius.card}>{children}</GlassCard>
    </View>
  );
}

/** El cuerpo, separado para poder leer `useScreenLayout()` dentro de `<Screen>`. */
function Cuerpo({ children }: { children: React.ReactNode }) {
  const { paddingTop, paddingBottom } = useScreenLayout();
  const { isExpanded } = useBreakpoint();
  return (
    <ScrollView
      contentContainerStyle={{ paddingTop, paddingBottom }}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ContentColumn>
        {/* Escalonado: la tarjeta de perfil y cada seccion entran una detras de otra.
            En iPad apaisado el propio escalonado es la rejilla de dos columnas. */}
        <Stagger
          style={isExpanded ? styles.rejilla : undefined}
          envoltorio={isExpanded ? styles.seccionMitad : undefined}
        >
          {children}
        </Stagger>
      </ContentColumn>
    </ScrollView>
  );
}

export default function MoreScreen() {
  const { user, logout, canCreateBlocks, canManageServices, canViewReports, isOwner } = useAuth();

  const roleLabels: Record<string, string> = {
    OWNER: "Dueña / Laserista",
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
    <Screen avisos title="Más">
      <Cuerpo>
        <GlassCard radius={Radius.card} style={styles.profileCard}>
          <View style={styles.profileFila}>
            <View style={styles.profileAvatar}>
              <Ionicons name="person" size={28} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileRole}>{roleLabels[user?.role || ""] || user?.role}</Text>
            </View>
          </View>
        </GlassCard>

        {canCreateBlocks && (
          <Section title="Disponibilidad">
            <MenuItem
              icon="ban-outline"
              label="Bloqueos"
              sublabel="Días y horas en que no se agenda"
              color={Colors.warning}
              onPress={() => router.push("/blocks")}
            />
          </Section>
        )}

        {isOwner && (
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
              label="Corte e ingresos"
              sublabel="Caja del día y resumen del mes"
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

      </Cuerpo>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rejilla: { flexDirection: "row", flexWrap: "wrap", gap: Space.lg, alignItems: "flex-start" },
  seccionMitad: { width: "48%", marginBottom: 0 },

  profileCard: { marginBottom: Space.xl, width: "100%" },
  profileFila: { flexDirection: "row", alignItems: "center", padding: Space.lg, gap: Space.lg - 2 },
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

  section: { marginBottom: Space.lg, width: "100%" },
  sectionTitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: Space.xs,
    marginBottom: Space.sm,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg - 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.strokeSoft,
    gap: Space.lg - 2,
  },
  menuIcon: { width: 40, height: 40, borderRadius: Radius.tile, justifyContent: "center", alignItems: "center" },
  menuText: { flex: 1 },
  menuLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },
  menuSublabel: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
