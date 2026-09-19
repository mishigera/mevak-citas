import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { toast } from "react-toastify";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton } from "@/components/glass";
import { Stagger } from "@/components/motion";
import { BotonPrimario, CampoTexto, PanelFormulario } from "@/components/Formulario";
import { CargandoLista, EstadoVacio } from "@/components/Estados";

export default function PackagesScreen() {
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
      alert("Paquete creado correctamente");
      toast.success("Paquete creado correctamente");
      qc.invalidateQueries({ queryKey: ["/api/packages"] });
      setShowForm(false); setName(""); setSessions(""); setPrice("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
         
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  return (
    <Screen
      title="Paquetes láser"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      action={
        <GlassIconButton
          name={showForm ? "remove" : "add"}
          variant="primary"
          accessibilityLabel={showForm ? "Cerrar formulario" : "Nuevo paquete"}
          onPress={() => setShowForm((v) => !v)}
        />
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {showForm && (
          <PanelFormulario titulo="Nuevo paquete">
            <CampoTexto value={name} onChangeText={setName} placeholder="Nombre del paquete" />
            <CampoTexto
              value={sessions}
              onChangeText={setSessions}
              placeholder="Total de sesiones"
              keyboardType="numeric"
            />
            <CampoTexto value={price} onChangeText={setPrice} placeholder="Precio ($)" keyboardType="numeric" />
            <BotonPrimario
              titulo="Guardar"
              cargando={createMutation.isPending}
              disabled={!name.trim() || !sessions || !price}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                createMutation.mutate();
              }}
            />
          </PanelFormulario>
        )}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : (packages || []).length === 0 ? (
          <EstadoVacio icono="cube-outline" titulo="Sin paquetes" texto="Toca + para crear el primero" />
        ) : (
          <Stagger style={styles.lista}>
            {(packages || []).map((pkg) => (
              <GlassCard key={pkg.id} radius={Radius.card}>
                <View style={styles.fila}>
                  <View style={styles.icono}>
                    <Ionicons name="cube" size={22} color={Colors.secondary} />
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.nombre}>{pkg.name}</Text>
                    <Text style={styles.sesiones}>{pkg.totalSessions} sesiones</Text>
                  </View>
                  <Text style={styles.precio}>${pkg.price}</Text>
                </View>
              </GlassCard>
            ))}
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.lg },
  lista: { gap: Space.sm },
  fila: { flexDirection: "row", alignItems: "center", padding: Space.lg - 2, gap: Space.md },
  icono: {
    width: 44,
    height: 44,
    borderRadius: Radius.tile,
    backgroundColor: Colors.secondary + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1 },
  nombre: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  sesiones: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted },
  precio: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.primary },
});
