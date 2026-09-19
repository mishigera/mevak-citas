/**
 * Inicio: el tablero de hoy (plan p008).
 *
 * Antes era el modo "Día" de la Agenda con una tira de días encima. Ahora dice, a cada
 * una de las tres, qué pasa ahora, qué sigue y qué hay que hacer hoy. Otros días están
 * en la Agenda.
 *
 * Cada sección vive en `components/inicio/` y las cuentas en `lib/inicio.ts`; aquí solo
 * se piden los datos y se decide qué ve cada rol:
 *
 * | Sección          | Dueña          | Recepción      | Facialista |
 * |------------------|----------------|----------------|------------|
 * | Ahora/siguiente  | todo el centro | todo el centro | las suyas  |
 * | Por atender      | + liquidar     | sin dinero     | lo suyo    |
 * | Hoy              | + lo cobrado   | sin dinero     | lo suyo    |
 * | Huecos           | todas          | todas          | los suyos  |
 * | Cumpleaños       | sí             | sí             | sí         |
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Linking, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { Space } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useBreakpoint } from "@/lib/responsive";
import { apiRequest, getErrorMessage } from "@/lib/query-client";
import { alerta } from "@/lib/alerta";
import { claveDiaLocal } from "@/lib/fecha";
import { enlaceWhatsApp, textoCumpleanos } from "@/lib/whatsapp";
import {
  ahoraYSiguiente, citasVisibles, cumpleanosProximos, huecosLibres, resumenDelDia,
  type BloqueoInicio, type CitaInicio, type ClienteCumple, type Cumpleanos as Cumple,
  type HorarioDia, type Hueco, type Profesional,
} from "@/lib/inicio";
import { calcularAvisos, type PagoAviso } from "@/components/avisos/calcular";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassIconButton } from "@/components/glass";
import { AhoraYSiguiente } from "@/components/inicio/AhoraYSiguiente";
import { Cumpleanos } from "@/components/inicio/Cumpleanos";
import { HuecosHoy } from "@/components/inicio/HuecosHoy";
import { PorAtender, avisosPorAtender } from "@/components/inicio/PorAtender";
import { ResumenHoy, type CajaDia } from "@/components/inicio/ResumenHoy";
import { NotaInicio, SeccionInicio } from "@/components/inicio/SeccionInicio";
import { useReloj } from "@/components/inicio/useReloj";

/**
 * El `QueryClient` global no refresca nunca solo (`staleTime: Infinity`). Un tablero que
 * la recepcionista deja abierto toda la mañana, mientras la facialista marca llegadas
 * desde su teléfono, tiene que volver a preguntar. Solo mientras está a la vista.
 */
const REFRESCO_MS = 60_000;

// Constantes de módulo, no `= []`: un array nuevo en cada render dispara los `useMemo`
// que dependen de él (deuda §18).
const SIN_CITAS: CitaInicio[] = [];
const SIN_BLOQUEOS: BloqueoInicio[] = [];
const SIN_PAGOS: PagoAviso[] = [];
const SIN_HORARIO: HorarioDia[] = [];
const SIN_STAFF: Profesional[] = [];
const SIN_CLIENTES: ClienteCumple[] = [];

async function pedir<T>(ruta: string): Promise<T> {
  return (await apiRequest("GET", ruta)).json();
}

export default function HomeScreen() {
  const { user, isOwner } = useAuth();
  const qc = useQueryClient();
  const { isExpanded } = useBreakpoint();
  const ahora = useReloj();
  const hoy = claveDiaLocal(ahora);
  const rol = user?.role;
  const esFacialista = rol === "FACIALIST";

  const [enfocada, setEnfocada] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const intervalo = enfocada ? REFRESCO_MS : false;

  // Las claves son las mismas que usan la campana, la Agenda, Reportes y Nueva cita:
  // si una ya lo cargó, aquí no se vuelve a pedir.
  const citasQ = useQuery<CitaInicio[]>({
    queryKey: ["/api/appointments", hoy],
    queryFn: () => pedir(`/api/appointments?date=${hoy}`),
    enabled: !!user,
    refetchInterval: intervalo,
  });
  const bloqueosQ = useQuery<BloqueoInicio[]>({
    queryKey: ["/api/blocks"],
    queryFn: () => pedir("/api/blocks"),
    enabled: !!user,
    refetchInterval: intervalo,
  });
  const pagosQ = useQuery<PagoAviso[]>({
    queryKey: ["/api/payments/pending-facialist"],
    queryFn: () => pedir("/api/payments/pending-facialist"),
    enabled: !!user && isOwner,
    refetchInterval: intervalo,
  });
  const cajaQ = useQuery<CajaDia>({
    queryKey: ["/api/reports/income", `date=${hoy}`],
    queryFn: () => pedir(`/api/reports/income?date=${hoy}`),
    enabled: !!user && isOwner,
    refetchInterval: intervalo,
  });
  const horarioQ = useQuery<HorarioDia[]>({
    queryKey: ["/api/center-hours"],
    queryFn: () => pedir("/api/center-hours"),
    enabled: !!user,
  });
  const staffQ = useQuery<Profesional[]>({
    queryKey: ["/api/users/staff"],
    queryFn: () => pedir("/api/users/staff"),
    enabled: !!user,
  });
  const clientesQ = useQuery<ClienteCumple[]>({
    queryKey: ["/api/clients"],
    queryFn: () => pedir("/api/clients"),
    enabled: !!user,
  });

  const todasLasCitas = citasQ.data ?? SIN_CITAS;
  const bloqueos = bloqueosQ.data ?? SIN_BLOQUEOS;
  const pagos = pagosQ.data ?? SIN_PAGOS;
  const horario = horarioQ.data ?? SIN_HORARIO;
  const staff = staffQ.data ?? SIN_STAFF;
  const clientes = clientesQ.data ?? SIN_CLIENTES;

  const citas = useMemo(() => citasVisibles(todasLasCitas, rol, user?.id), [todasLasCitas, rol, user?.id]);
  const datosAhora = useMemo(() => ahoraYSiguiente(citas, ahora), [citas, ahora]);
  const resumen = useMemo(() => resumenDelDia(citas), [citas]);

  const avisos = useMemo(() => {
    // A la facialista le importan sus bloqueos y los del centro, no los de la dueña.
    const suyos = esFacialista ? bloqueos.filter((b) => b.userId === null || b.userId === user?.id) : bloqueos;
    return avisosPorAtender(calcularAvisos({ citas, pagos: isOwner ? pagos : SIN_PAGOS, bloqueos: suyos, ahora }));
  }, [citas, pagos, bloqueos, isOwner, esFacialista, user?.id, ahora]);

  const huecos = useMemo(() => {
    const profesionales = esFacialista ? staff.filter((p) => p.id === user?.id) : staff;
    return huecosLibres({ dia: hoy, ahora, horario, profesionales, citas: todasLasCitas, bloqueos });
  }, [esFacialista, staff, user?.id, hoy, ahora, horario, todasLasCitas, bloqueos]);

  const cumpleanos = useMemo(() => cumpleanosProximos(clientes, hoy), [clientes, hoy]);

  /**
   * Lo que cambia a lo largo del día. `refetchQueries` se salta las consultas
   * desactivadas, así que a quien no es la dueña no se le piden pagos ni caja.
   */
  const refrescarDia = useCallback(
    () => Promise.all(
      [["/api/appointments", hoy], ["/api/blocks"], ["/api/payments/pending-facialist"], ["/api/reports/income", `date=${hoy}`]]
        .map((queryKey) => qc.refetchQueries({ queryKey, type: "active" })),
    ),
    [qc, hoy],
  );

  // Al volver a la pestaña, datos frescos; al irse, se deja de preguntar. La primera
  // vez no: las consultas acaban de salir y se pedirían dos veces.
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      if (primeraVez.current) primeraVez.current = false;
      else refrescarDia();
      return () => setEnfocada(false);
    }, [refrescarDia]),
  );

  const onRefresh = useCallback(async () => {
    setRefrescando(true);
    await Promise.all([
      refrescarDia(),
      qc.refetchQueries({ queryKey: ["/api/center-hours"], type: "active" }),
      qc.refetchQueries({ queryKey: ["/api/users/staff"], type: "active" }),
      qc.refetchQueries({ queryKey: ["/api/clients"], type: "active" }),
    ]);
    setRefrescando(false);
  }, [refrescarDia, qc]);

  const llegada = useMutation({
    mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/appointments/${id}`, { status: "ARRIVED" })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => alerta("No se pudo marcar la llegada", getErrorMessage(err)),
  });

  const abrirCita = useCallback((cita: CitaInicio) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/appointment/${cita.id}`);
  }, []);

  const agendarEnHueco = useCallback((profesional: Profesional, hueco: Hueco) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const params: Record<string, string> = { staffId: profesional.id, staffName: profesional.name, date: hoy, hora: hueco.inicio };
    // La dueña es la laserista y la facialista hace faciales: se propone el tipo, y en
    // Nueva cita se puede cambiar.
    if (profesional.role === "OWNER") params.type = "LASER";
    if (profesional.role === "FACIALIST") params.type = "FACIAL";
    router.push({ pathname: "/appointment/new", params });
  }, [hoy]);

  const felicitar = useCallback((c: Cumple) => {
    const enlace = enlaceWhatsApp(c.cliente.phone, textoCumpleanos({ nombre: c.cliente.fullName }));
    if (!enlace) {
      alerta("Sin teléfono válido", "La ficha de la clienta no tiene un teléfono al que escribir.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(enlace).catch(() => alerta("Error", "No se pudo abrir WhatsApp."));
  }, []);

  const fecha = ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  const operacion = (
    <>
      {citasQ.isError ? (
        <SeccionInicio titulo="Ahora">
          <NotaInicio>No se pudieron cargar las citas de hoy. Desliza hacia abajo para reintentar.</NotaInicio>
        </SeccionInicio>
      ) : (
        <AhoraYSiguiente
          datos={datosAhora}
          ahora={ahora}
          cargando={citasQ.isLoading}
          verProfesional={!esFacialista}
          totalHoy={resumen.total}
          marcando={llegada.isPending ? (llegada.variables ?? null) : null}
          onLlego={(cita) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            llegada.mutate(cita.id);
          }}
          onAbrir={abrirCita}
          onVerAgenda={() => router.navigate("/(tabs)/calendar")}
        />
      )}
      <PorAtender avisos={avisos} onAbrir={(ruta) => router.push(ruta as Href)} />
      <ResumenHoy
        resumen={resumen}
        caja={isOwner ? cajaQ.data : undefined}
        onVerCorte={isOwner ? () => router.push("/admin/reports") : undefined}
      />
      <HuecosHoy huecos={huecos} verNombre={!esFacialista} onElegir={agendarEnHueco} />
    </>
  );

  const hayAdelanto = cumpleanos.length > 0;
  const adelanto = (
    <Cumpleanos
      cumpleanos={cumpleanos}
      hoy={hoy}
      onAbrir={(id) => router.push(`/client/${id}`)}
      onFelicitar={felicitar}
    />
  );

  return (
    <Screen
      avisos
      title={`Hola, ${user?.name?.split(" ")[0] ?? ""}`}
      subtitle={`Hoy, ${fecha}`}
      action={
        <GlassIconButton
          name="add"
          variant="primary"
          accessibilityLabel="Nueva cita"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/appointment/new");
          }}
        />
      }
    >
      <ScreenScroll
        testID="inicio"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {isExpanded && hayAdelanto ? (
          <View style={styles.columnas}>
            <View style={styles.columna}>{operacion}</View>
            <View style={styles.columna}>{adelanto}</View>
          </View>
        ) : (
          <View style={styles.pila}>
            {operacion}
            {adelanto}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pila: { gap: Space.xl },
  columnas: { flexDirection: "row", alignItems: "flex-start", gap: Space.xl },
  columna: { flex: 1, minWidth: 0, gap: Space.xl },
});
