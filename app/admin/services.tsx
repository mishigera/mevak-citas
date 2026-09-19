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
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { apiRequest } from "@/lib/query-client";
import { alerta } from "@/lib/alerta";
import * as Haptics from "expo-haptics";

export default function ServicesScreen() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"FACIAL" | "LASER">("FACIAL");
  const [price, setPrice] = useState("");
  const [duracion, setDuracion] = useState("60");

  // Con los desactivados: si no, al tocar el ojo el servicio desaparecía de esta lista y
  // no quedaba forma de volver a activarlo. La clave cuelga de "/api/services" para que
  // las invalidaciones de siempre la alcancen.
  const { data: services, isLoading } = useQuery<any[]>({
    queryKey: ["/api/services", "todos"],
    queryFn: async () => (await apiRequest("GET", "/api/services?includeInactive=1")).json(),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/services", {
        name: name.trim(), type, price: Number(price), durationMinutes: Number(duracion) || 60,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/services"] });
      setShowForm(false);
      setName(""); setPrice("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alerta("Servicio creado");
    },
    onError: (err: Error) => alerta("No se pudo crear el servicio", err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/services/${id}`, { isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/services"] }),
  });

  return (
    <Screen
      title="Servicios"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      action={
        <GlassIconButton
          name={showForm ? "remove" : "add"}
          variant="primary"
          accessibilityLabel={showForm ? "Cerrar formulario" : "Nuevo servicio"}
          onPress={() => setShowForm((v) => !v)}
        />
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {showForm && (
          <PanelFormulario titulo="Nuevo servicio">
            {/* El selector de tipo ya no son dos botones que se encienden: es el
                segmentado del sistema, con su pulgar de vidrio deslizándose. */}
            <GlassSegmented
              options={[
                { value: "FACIAL", label: "FACIAL" },
                { value: "LASER", label: "LASER" },
              ]}
              value={type}
              onChange={setType}
            />
            <CampoTexto value={name} onChangeText={setName} placeholder="Nombre del servicio" />
            <CampoTexto value={price} onChangeText={setPrice} placeholder="Precio ($)" keyboardType="numeric" />
            <CampoTexto value={duracion} onChangeText={setDuracion} placeholder="Duración (minutos)" keyboardType="numeric" />
            <BotonPrimario
              titulo="Guardar"
              cargando={createMutation.isPending}
              disabled={!name.trim() || !price}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                createMutation.mutate();
              }}
            />
          </PanelFormulario>
        )}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : (services || []).length === 0 ? (
          <EstadoVacio icono="pricetags-outline" titulo="Sin servicios" texto="Toca + para crear el primero" />
        ) : (
          <Stagger style={styles.lista}>
            {(services || []).map((svc) => (
              <GlassCard key={svc.id} radius={Radius.card}>
                <View style={styles.fila}>
                  <View
                    style={[
                      styles.tipo,
                      !svc.isActive && styles.apagado,
                      { backgroundColor: (svc.type === "LASER" ? Colors.secondary : Colors.accent) + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tipoTexto,
                        { color: svc.type === "LASER" ? Colors.secondary : Colors.accent },
                      ]}
                    >
                      {svc.type}
                    </Text>
                  </View>
                  <View style={[styles.info, !svc.isActive && styles.apagado]}>
                    <Text style={styles.nombre}>{svc.name}</Text>
                    <Text style={styles.precio}>${svc.price}</Text>
                    <Text style={styles.duracion}>{svc.durationMinutes ?? 60} min</Text>
                    {!svc.isActive && (
                      <Text style={styles.inactivo}>Desactivado · no se ofrece al agendar</Text>
                    )}
                  </View>
                  <PressableMotion
                    gesto="escala"
                    hitSlop={8}
                    accessibilityLabel={svc.isActive ? "Desactivar servicio" : "Activar servicio"}
                    onPress={() => toggleMutation.mutate({ id: svc.id, isActive: !svc.isActive })}
                  >
                    <Ionicons
                      name={svc.isActive ? "eye-outline" : "eye-off-outline"}
                      size={20}
                      color={svc.isActive ? Colors.success : Colors.textMuted}
                    />
                  </PressableMotion>
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
  tipo: { borderRadius: Radius.tile / 2, paddingHorizontal: Space.sm, paddingVertical: Space.xs },
  tipoTexto: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  info: { flex: 1 },
  nombre: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  precio: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primary },
  duracion: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  apagado: { opacity: 0.5 },
  inactivo: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
