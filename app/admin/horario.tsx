/**
 * El horario del centro, un día por fila.
 *
 * Antes no existía: se podía agendar a las 03:00 de un domingo y nada protestaba. Con
 * esto el servidor rechaza lo que cae fuera, y aquí se decide qué es "fuera".
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, Alert } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard } from "@/components/glass";
import { Stagger } from "@/components/motion";
import { BotonPrimario } from "@/components/Formulario";
import { CampoHora } from "@/components/CampoFechaHora";
import { CargandoLista } from "@/components/Estados";
import { apiRequest, getApiUrl, getAuthToken, getErrorMessage } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

type Dia = { weekday: number; open: boolean; opensAt: string; closesAt: string };

const NOMBRES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Identidad estable mientras no llegan los datos: si no, el efecto no para. */
const SIN_DIAS: Dia[] = [];

export default function HorarioScreen() {
  const qc = useQueryClient();
  const [dias, setDias] = useState<Dia[]>([]);

  const { data = SIN_DIAS, isLoading } = useQuery<Dia[]>({
    queryKey: ["/api/center-hours"],
    queryFn: async () => {
      const url = new URL("/api/center-hours", getApiUrl());
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      if (!res.ok) return SIN_DIAS;
      return res.json() as Promise<Dia[]>;
    },
  });

  useEffect(() => {
    if (data.length) setDias(data.map((d) => ({ ...d })));
  }, [data]);

  const guardar = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/center-hours", dias);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/center-hours"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Horario guardado", "Las citas fuera de este horario se rechazan al agendar.");
    },
    onError: (err: Error) => Alert.alert("Error", getErrorMessage(err, "No se pudo guardar el horario")),
  });

  const cambiar = (weekday: number, cambios: Partial<Dia>) =>
    setDias((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...cambios } : d)));

  return (
    <Screen
      title="Horario del centro"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
    >
      <ScreenScroll contentStyle={styles.columna}>
        {isLoading ? (
          <CargandoLista filas={4} />
        ) : (
          <Stagger style={styles.columna}>
            {dias.map((dia) => (
              <GlassCard key={dia.weekday} radius={Radius.card}>
                <View style={styles.diaInterior}>
                  <View style={styles.diaCabecera}>
                    <Text style={styles.diaNombre}>{NOMBRES[dia.weekday]}</Text>
                    <Switch
                      value={dia.open}
                      onValueChange={(v) => cambiar(dia.weekday, { open: v })}
                      trackColor={{ true: Colors.primary }}
                      accessibilityLabel={`Abrir ${NOMBRES[dia.weekday]}`}
                    />
                  </View>
                  {dia.open ? (
                    <View style={styles.horas}>
                      <CampoHora
                        style={styles.mitad}
                        etiqueta={`Abre ${NOMBRES[dia.weekday]}`}
                        value={dia.opensAt}
                        onChange={(v) => cambiar(dia.weekday, { opensAt: v })}
                      />
                      <CampoHora
                        style={styles.mitad}
                        etiqueta={`Cierra ${NOMBRES[dia.weekday]}`}
                        value={dia.closesAt}
                        onChange={(v) => cambiar(dia.weekday, { closesAt: v })}
                      />
                    </View>
                  ) : (
                    <Text style={styles.cerrado}>Cerrado</Text>
                  )}
                </View>
              </GlassCard>
            ))}

            <BotonPrimario
              titulo="Guardar horario"
              cargando={guardar.isPending}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                guardar.mutate();
              }}
            />
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.md },
  diaInterior: { padding: Space.lg, gap: Space.md },
  diaCabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  diaNombre: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  horas: { flexDirection: "row", gap: Space.md },
  mitad: { flex: 1 },
  cerrado: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted },
});
