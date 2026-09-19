import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSegmented } from "@/components/glass";
import { PressableMotion, Stagger } from "@/components/motion";
import { BotonPrimario, CampoTexto, PanelFormulario } from "@/components/Formulario";
import { CampoFecha, CampoHora } from "@/components/CampoFechaHora";
import { useAuth } from "@/contexts/auth";
import { ahoraClave } from "@/lib/fecha";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { apiRequest, getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { alerta } from "@/lib/alerta";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Alcance = "SELF" | "CENTER";

export default function BlocksScreen() {
  const qc = useQueryClient();
  const { user, canManageAgenda } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState(ahoraClave());
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(ahoraClave());
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  // La recepcionista no tiene agenda propia: lo único que tiene sentido que cree es el
  // cierre del centro, así que su formulario arranca ya en "todo el centro".
  const [alcance, setAlcance] = useState<Alcance>(user?.role === "RECEPTION" ? "CENTER" : "SELF");

  const { data: blocks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/blocks"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/blocks", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<any[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/blocks", {
        startDateTime: `${startDate}T${startTime}:00`,
        endDateTime: `${endDate}T${endTime}:00`,
        reason: reason.trim() || undefined,
        scope: alcance,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/blocks"] });
      setShowForm(false);
      setReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => alerta("Error", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/blocks/${id}`, undefined);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/blocks"] }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); },
    onError: (err: Error) => alerta("Error", err.message),
  });

  const handleDelete = (id: string) => {
    alerta("Eliminar bloqueo", "¿Confirmas eliminar este bloqueo?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  return (
    <Screen
      title="Bloqueos"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      action={
        <GlassIconButton
          name={showForm ? "remove" : "add"}
          variant="primary"
          accessibilityLabel={showForm ? "Cerrar formulario" : "Nuevo bloqueo"}
          onPress={() => setShowForm((v) => !v)}
        />
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {showForm && (
          <PanelFormulario titulo="Nuevo bloqueo">
            {canManageAgenda && (
              <GlassSegmented
                options={[
                  { value: "SELF", label: "Mi agenda" },
                  { value: "CENTER", label: "Todo el centro" },
                ]}
                value={alcance}
                onChange={setAlcance}
              />
            )}
            <View style={styles.fila}>
              <CampoFecha style={styles.mitad} etiqueta="Fecha inicio" value={startDate} onChange={setStartDate} />
              <CampoHora style={styles.mitad} etiqueta="Hora inicio" value={startTime} onChange={setStartTime} />
            </View>
            <View style={styles.fila}>
              <CampoFecha style={styles.mitad} etiqueta="Fecha fin" value={endDate} onChange={setEndDate} />
              <CampoHora style={styles.mitad} etiqueta="Hora fin" value={endTime} onChange={setEndTime} />
            </View>
            <CampoTexto
              etiqueta="Razón (opcional)"
              value={reason}
              onChangeText={setReason}
              placeholder="Ej: Vacaciones, no trabajo"
            />
            <BotonPrimario
              titulo="Guardar bloqueo"
              cargando={createMutation.isPending}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                createMutation.mutate();
              }}
            />
          </PanelFormulario>
        )}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : !blocks?.length ? (
          <EstadoVacio
            icono="ban-outline"
            titulo="Sin bloqueos"
            texto="Toca + para agregar un bloqueo de disponibilidad"
          />
        ) : (
          <Stagger style={styles.lista}>
            {blocks.map((b) => {
              const esDelCentro = !b.userId;
              const esMio = b.userId === user?.id;
              const puedeBorrar = esMio || canManageAgenda;
              return (
                <GlassCard key={b.id} radius={Radius.card}>
                  <View style={styles.bloqueFila}>
                    <View style={[styles.bloqueIcono, esDelCentro && styles.bloqueIconoCentro]}>
                      <Ionicons
                        name={esDelCentro ? "home" : "ban"}
                        size={22}
                        color={esDelCentro ? Colors.secondary : Colors.warning}
                      />
                    </View>
                    <View style={styles.bloqueContenido}>
                      <Text style={styles.bloqueDe}>
                        {esDelCentro ? "Centro cerrado" : esMio ? "Mi agenda" : b.user?.name || "Staff"}
                      </Text>
                      <Text style={styles.bloqueFecha}>{formatDateTime(b.startDateTime)}</Text>
                      <Text style={styles.bloqueFecha}>{formatDateTime(b.endDateTime)}</Text>
                      {b.reason && <Text style={styles.bloqueRazon}>{b.reason}</Text>}
                    </View>
                    {puedeBorrar && (
                      <PressableMotion
                        gesto="escala"
                        hitSlop={8}
                        accessibilityLabel="Eliminar bloqueo"
                        onPress={() => handleDelete(b.id)}
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.error} />
                      </PressableMotion>
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
  lista: { gap: Space.md - 2 },
  fila: { flexDirection: "row", gap: Space.md - 2 },
  mitad: { flex: 1 },
  bloqueFila: { flexDirection: "row", alignItems: "center", padding: Space.lg - 2, gap: Space.md },
  bloqueIcono: {
    width: 40,
    height: 40,
    borderRadius: Radius.tile,
    backgroundColor: Colors.warning + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  bloqueIconoCentro: { backgroundColor: Colors.secondary + "20" },
  bloqueContenido: { flex: 1, gap: 2 },
  bloqueDe: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primaryDark },
  bloqueFecha: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
  bloqueRazon: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
