import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { alerta } from "@/lib/alerta";
import * as Haptics from "expo-haptics";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton } from "@/components/glass";
import { PressableMotion, Stagger } from "@/components/motion";
import { BotonPrimario, CampoTexto, PanelFormulario } from "@/components/Formulario";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { LaserBodyMap } from "@/components/LaserBodyMap";

const SIN_ELEMENTOS: any[] = [];

/** `null` es el formulario de uno nuevo; un id, el de ese paquete. */
type Edicion = { id: string | null } | null;

export default function PackagesScreen() {
  const qc = useQueryClient();
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");
  const [claves, setClaves] = useState<string[]>([]);

  const { data: packages, isLoading } = useQuery<any[]>({
    queryKey: ["/api/packages"],
    queryFn: async () => (await apiRequest("GET", "/api/packages")).json(),
  });
  const { data: laserAreas = SIN_ELEMENTOS } = useQuery<any[]>({
    queryKey: ["/api/laser-areas"],
    queryFn: async () => (await apiRequest("GET", "/api/laser-areas")).json(),
  });

  const areaPorId = useMemo(() => new Map(laserAreas.map((a: any) => [a.id, a])), [laserAreas]);

  const abrir = (pkg?: any) => {
    setEdicion({ id: pkg?.id ?? null });
    setName(pkg?.name ?? "");
    setSessions(pkg ? String(pkg.totalSessions) : "");
    setPrice(pkg ? String(pkg.price) : "");
    setClaves((pkg?.areaIds ?? []).map((id: string) => areaPorId.get(id)?.svgKey).filter(Boolean));
  };

  const cerrar = () => {
    setEdicion(null);
    setName(""); setSessions(""); setPrice(""); setClaves([]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const areaIds = laserAreas.filter((a: any) => claves.includes(a.svgKey)).map((a: any) => a.id);
      const cuerpo = { name: name.trim(), totalSessions: Number(sessions), price: Number(price), areaIds };
      if (edicion?.id) await apiRequest("PATCH", `/api/packages/${edicion.id}`, cuerpo);
      else await apiRequest("POST", "/api/packages", cuerpo);
    },
    onSuccess: () => {
      const eraNuevo = !edicion?.id;
      qc.invalidateQueries({ queryKey: ["/api/packages"] });
      cerrar();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alerta(eraNuevo ? "Paquete creado" : "Paquete actualizado");
    },
    onError: (err: Error) => alerta("No se pudo guardar el paquete", err.message),
  });

  const alternarArea = (svgKey: string) =>
    setClaves((prev) => (prev.includes(svgKey) ? prev.filter((k) => k !== svgKey) : [...prev, svgKey]));

  const formulario = (
    <PanelFormulario titulo={edicion?.id ? "Editar paquete" : "Nuevo paquete"}>
      <CampoTexto value={name} onChangeText={setName} placeholder="Nombre del paquete" />
      <CampoTexto value={sessions} onChangeText={setSessions} placeholder="Total de sesiones" keyboardType="numeric" />
      <CampoTexto value={price} onChangeText={setPrice} placeholder="Precio ($)" keyboardType="numeric" />
      <LaserBodyMap
        areas={laserAreas}
        selectedSvgKeys={claves}
        onToggleArea={alternarArea}
        title="Áreas que incluye"
      />
      <BotonPrimario
        titulo={edicion?.id ? "Guardar cambios" : "Crear paquete"}
        cargando={saveMutation.isPending}
        disabled={!name.trim() || !sessions || !price || claves.length === 0}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          saveMutation.mutate();
        }}
      />
    </PanelFormulario>
  );

  return (
    <Screen
      title="Paquetes láser"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      action={
        <GlassIconButton
          name={edicion ? "remove" : "add"}
          variant="primary"
          accessibilityLabel={edicion ? "Cerrar formulario" : "Nuevo paquete"}
          onPress={() => (edicion ? cerrar() : abrir())}
        />
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {edicion && edicion.id === null && formulario}

        {isLoading ? (
          <CargandoLista filas={3} />
        ) : (packages || []).length === 0 ? (
          <EstadoVacio icono="cube-outline" titulo="Sin paquetes" texto="Toca + para crear el primero" />
        ) : (
          <Stagger style={styles.lista}>
            {(packages || []).map((pkg) => {
              // El que se edita se abre en su sitio, no arriba del todo: si no, tocar
              // uno del final de la lista abriría un formulario fuera de la pantalla.
              if (edicion?.id === pkg.id) return <View key={pkg.id}>{formulario}</View>;
              const nombres = (pkg.areaIds ?? [])
                .map((id: string) => areaPorId.get(id)?.name)
                .filter(Boolean) as string[];
              return (
                <PressableMotion
                  key={pkg.id}
                  gesto="elevar"
                  accessibilityLabel={`Editar ${pkg.name}`}
                  onPress={() => abrir(pkg)}
                >
                  <GlassCard radius={Radius.card}>
                    <View style={styles.fila}>
                      <View style={styles.icono}>
                        <Ionicons name="cube" size={22} color={Colors.secondary} />
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.nombre}>{pkg.name}</Text>
                        <Text style={styles.sesiones}>{pkg.totalSessions} sesiones</Text>
                        {nombres.length > 0 ? (
                          <Text style={styles.areas}>{nombres.join(", ")}</Text>
                        ) : (
                          <Text style={styles.sinAreas}>Sin áreas: tócalo para elegirlas</Text>
                        )}
                      </View>
                      <Text style={styles.precio}>${pkg.price}</Text>
                    </View>
                  </GlassCard>
                </PressableMotion>
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
  fila: { flexDirection: "row", alignItems: "center", padding: Space.lg - 2, gap: Space.md },
  icono: {
    width: 44,
    height: 44,
    borderRadius: Radius.tile,
    backgroundColor: Colors.secondary + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, gap: 2 },
  nombre: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  sesiones: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted },
  areas: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.primaryDark, marginTop: 2 },
  sinAreas: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.warning, marginTop: 2 },
  precio: { fontFamily: "Nunito_800ExtraBold", fontSize: 18, color: Colors.primary },
});
