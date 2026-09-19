import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassPopover, GlassSegmented, GlassSurface } from "@/components/glass";
import { PressableMotion, Stagger } from "@/components/motion";
import { BotonPrimario, CampoTexto } from "@/components/Formulario";
import { CampoFecha, CampoHora } from "@/components/CampoFechaHora";
import { ahoraClave } from "@/lib/fecha";
import { ApiError, apiRequest, getApiUrl, getAuthToken, getErrorMessage } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { alerta } from "@/lib/alerta";

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/**
 * La fila que abre un selector. El panel se ancla a ella —`position: relative`— para
 * que nazca justo de donde se ha pulsado y no del centro de la pantalla.
 */
function Selector({
  label,
  value,
  abierto,
  onAbrir,
  onCerrar,
  titulo,
  children,
}: {
  label: string;
  value: string;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const refAncla = useRef<View | null>(null);
  return (
    <View ref={refAncla} style={styles.ancla}>
      <PressableMotion
        gesto="sutil"
        accessibilityLabel={value || `Seleccionar ${label}`}
        accessibilityHasPopup
        accessibilityState={{ expanded: abierto }}
        onPress={onAbrir}
      >
        <GlassSurface radius={Radius.tile} style={styles.selectorFila}>
          <Text style={[styles.selectorValor, !value && { color: Colors.textMuted }]}>
            {value || `Seleccionar ${label}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </GlassSurface>
      </PressableMotion>

      <GlassPopover
        visible={abierto}
        onClose={onCerrar}
        titulo={titulo}
        origen="arriba-izquierda"
        diametroOrigen={52}
        anclaRef={refAncla}
        style={styles.panelSelector}
      >
        {children}
      </GlassPopover>
    </View>
  );
}

/** `"12:30"` → `"13:30"`, sin pasar de las 23. La duración real la ponen los servicios. */
function unaHoraDespues(hora: string): string {
  const h = Math.min(Number(hora.slice(0, 2)) + 1, 23);
  return `${String(h).padStart(2, "0")}:${hora.slice(3, 5)}`;
}

export default function NewAppointmentScreen() {
  const params = useLocalSearchParams();
  const qc = useQueryClient();

  const [clientId, setClientId] = useState<string>(params.clientId as string || "");
  const [clientName, setClientName] = useState<string>(params.clientName as string || "");
  const [staffId, setStaffId] = useState<string>(params.staffId as string || "");
  const [staffName, setStaffName] = useState<string>(params.staffName as string || "");
  const [type, setType] = useState<"FACIAL" | "LASER">((params.type as "FACIAL" | "LASER") || "FACIAL");
  const [date, setDate] = useState<string>((params.date as string) || ahoraClave());
  // Desde un hueco del inicio llega también la hora (plan p008).
  const horaParam = typeof params.hora === "string" && /^\d{2}:\d{2}$/.test(params.hora) ? params.hora : null;
  const [startTime, setStartTime] = useState<string>(horaParam ?? "10:00");
  const [endTime, setEndTime] = useState<string>(horaParam ? unaHoraDespues(horaParam) : "11:00");
  const [notes, setNotes] = useState<string>("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  const authH = () => ({ Authorization: `Bearer ${getAuthToken() || ""}` });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/clients", base);
      const res = await fetch(url.toString(), { headers: authH() });
      return res.json() as Promise<any[]>;
    },
  });

  const { data: staff } = useQuery<any[]>({
    queryKey: ["/api/users/staff"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/users/staff", base);
      const res = await fetch(url.toString(), { headers: authH() });
      return res.json() as Promise<any[]>;
    },
  });

  const { data: services } = useQuery<any[]>({
    queryKey: ["/api/services", type],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/services?type=${type}`, base);
      const res = await fetch(url.toString(), { headers: authH() });
      return res.json() as Promise<any[]>;
    },
  });

  const elegidos = (services || []).filter((s) => serviceIds.includes(s.id));
  const duraciónTotal = elegidos.reduce((suma, s) => suma + (Number(s.durationMinutes) || 60), 0);

  /** Suma minutos a `"HH:MM"` sin salirse del día. */
  const sumarMinutos = (hora: string, minutos: number) => {
    const total = Math.min(Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos, 23 * 60 + 59);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  /**
   * Elegir servicio recalcula la hora de fin con lo que duran. Antes había que
   * calcularla a mano y el formulario siempre arrancaba en 10:00–11:00.
   */
  const alternarServicio = (servicio: any) => {
    const siguiente = serviceIds.includes(servicio.id)
      ? serviceIds.filter((id) => id !== servicio.id)
      : [...serviceIds, servicio.id];
    setServiceIds(siguiente);

    const minutos = (services || [])
      .filter((s) => siguiente.includes(s.id))
      .reduce((suma, s) => suma + (Number(s.durationMinutes) || 60), 0);
    if (minutos > 0) setEndTime(sumarMinutos(startTime, minutos));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const dateTimeStart = `${date}T${startTime}:00`;
      const dateTimeEnd = `${date}T${endTime}:00`;
      const res = await apiRequest("POST", "/api/appointments", {
        dateTimeStart,
        dateTimeEnd,
        clientId,
        staffId,
        type,
        notes,
      });
      const cita = await res.json() as { id: string };
      // Los servicios se asignan aparte: el POST de la cita no los acepta.
      if (serviceIds.length) {
        await apiRequest("PUT", `/api/appointments/${cita.id}/services`, { serviceIds });
      }
      return cita;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
      router.push(`/appointment/${data.id}`);
    },
    onError: (err: Error) => {
      const message = getErrorMessage(err, "No se pudo crear la cita");
      const isScheduleConflict = err instanceof ApiError && err.status === 409 && /conflicto|bloqueo/i.test(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (isScheduleConflict) {
        alerta("Horario no disponible", message);
        return;
      }

      alerta("Error", message);
    },
  });

  /**
   * Mover el inicio arrastra el fin con la misma duración. Sin esto es facilísimo dejar
   * un fin anterior al inicio, que ahora el servidor rechaza con un 400.
   */
  const alCambiarInicio = (nuevo: string) => {
    const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    const duración = duraciónTotal || Math.max(minutos(endTime) - minutos(startTime), 15);
    setStartTime(nuevo);
    setEndTime(sumarMinutos(nuevo, duración));
  };

  const filteredClients = (clients || []).filter((c) =>
    c.fullName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <Screen
      title="Nueva cita"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/calendar"))}
    >
      <ScreenScroll>
        <Stagger style={styles.campos}>
          <View style={styles.grupo}>
            <Label>Tipo de cita</Label>
            <GlassSegmented
              options={[
                { value: "FACIAL", label: "FACIAL" },
                { value: "LASER", label: "LASER" },
              ]}
              value={type}
              onChange={setType}
            />
          </View>

          <View style={styles.grupo}>
            <Label>Cliente</Label>
            <Selector
              label="cliente"
              value={clientName}
              titulo="Clientes"
              abierto={showClientPicker}
              onAbrir={() => setShowClientPicker(true)}
              onCerrar={() => setShowClientPicker(false)}
            >
              <View style={styles.buscador}>
                <CampoTexto
                  placeholder="Buscar..."
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  autoFocus
                />
              </View>
              <ScrollView style={styles.panelLista} keyboardShouldPersistTaps="handled">
                <Stagger style={styles.panelListaContenido}>
                  {filteredClients.map((c) => (
                    <PressableMotion
                      key={c.id}
                      gesto="sutil"
                      accessibilityLabel={c.fullName}
                      style={styles.opcion}
                      onPress={() => {
                        setClientId(c.id);
                        setClientName(c.fullName);
                        setShowClientPicker(false);
                      }}
                    >
                      <Text style={styles.opcionTexto}>{c.fullName}</Text>
                      <Text style={styles.opcionSub}>{c.phone}</Text>
                    </PressableMotion>
                  ))}
                </Stagger>
              </ScrollView>
            </Selector>
          </View>

          <View style={styles.grupo}>
            <Label>Staff asignado</Label>
            <Selector
              label="staff"
              value={staffName}
              titulo="Staff"
              abierto={showStaffPicker}
              onAbrir={() => setShowStaffPicker(true)}
              onCerrar={() => setShowStaffPicker(false)}
            >
              <ScrollView style={styles.panelLista}>
                <Stagger style={styles.panelListaContenido}>
                  {(staff || []).map((s) => (
                    <PressableMotion
                      key={s.id}
                      gesto="sutil"
                      accessibilityLabel={s.name}
                      style={styles.opcion}
                      onPress={() => {
                        setStaffId(s.id);
                        setStaffName(s.name);
                        setShowStaffPicker(false);
                      }}
                    >
                      <Text style={styles.opcionTexto}>{s.name}</Text>
                      <Text style={styles.opcionSub}>
                        {s.role === "OWNER" ? "Laserista/Owner" : "Facialista"}
                      </Text>
                    </PressableMotion>
                  ))}
                </Stagger>
              </ScrollView>
            </Selector>
          </View>

          <View style={styles.grupo}>
            <Label>Servicios</Label>
            {(services || []).length === 0 ? (
              <Text style={styles.sinServicios}>
                No hay servicios de {type === "FACIAL" ? "facial" : "láser"} en el catálogo.
              </Text>
            ) : (
              <View style={styles.servicios}>
                {(services || []).map((s) => {
                  const elegido = serviceIds.includes(s.id);
                  return (
                    <PressableMotion
                      key={s.id}
                      gesto="sutil"
                      accessibilityLabel={s.name}
                      accessibilityState={{ selected: elegido }}
                      style={[styles.servicio, elegido && styles.servicioElegido]}
                      onPress={() => alternarServicio(s)}
                    >
                      <Ionicons
                        name={elegido ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={elegido ? Colors.primary : Colors.textMuted}
                      />
                      <Text style={[styles.servicioNombre, elegido && { color: Colors.primaryDark }]}>{s.name}</Text>
                      <Text style={styles.servicioMeta}>{s.durationMinutes ?? 60} min · ${s.price}</Text>
                    </PressableMotion>
                  );
                })}
              </View>
            )}
          </View>

          <CampoFecha etiqueta="Fecha" value={date} onChange={setDate} />
          <View style={styles.fila}>
            <CampoHora etiqueta="Hora inicio" value={startTime} onChange={alCambiarInicio} style={styles.mitad} />
            <CampoHora etiqueta="Hora fin" value={endTime} onChange={setEndTime} style={styles.mitad} />
          </View>
          <CampoTexto
            etiqueta="Notas (opcional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notas sobre la cita..."
            estiloCampo={styles.notas}
            multiline
          />

          <BotonPrimario
            titulo="Crear cita"
            style={styles.crear}
            cargando={createMutation.isPending}
            disabled={!clientId || !staffId}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              createMutation.mutate();
            }}
          />
        </Stagger>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  campos: { gap: Space.lg },
  grupo: { gap: 6 },
  label: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, marginLeft: Space.xs },

  ancla: { position: "relative" },
  selectorFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg - 2,
    paddingVertical: Space.md + 2,
  },
  selectorValor: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },
  panelSelector: { top: 56, left: 0, right: 0, maxHeight: 340 },
  buscador: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  panelLista: { maxHeight: 240 },
  panelListaContenido: { paddingHorizontal: Space.md, paddingBottom: Space.md, gap: Space.xs },
  opcion: { paddingVertical: Space.md, paddingHorizontal: Space.md, borderRadius: Radius.tile },
  opcionTexto: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },
  opcionSub: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 1 },

  fila: { flexDirection: "row", gap: Space.md },
  servicios: { gap: Space.xs },
  servicio: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    paddingVertical: Space.md - 2, paddingHorizontal: Space.md,
    borderRadius: Radius.tile, borderWidth: 1, borderColor: Colors.glass.strokeSoft,
  },
  servicioElegido: { borderColor: Colors.primary, backgroundColor: Colors.primary + "12" },
  servicioNombre: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  servicioMeta: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
  sinServicios: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textMuted, marginLeft: Space.xs },
  mitad: { flex: 1 },
  notas: { minHeight: 80, textAlignVertical: "top" },
  crear: { marginTop: Space.sm, paddingVertical: Space.lg },
});
