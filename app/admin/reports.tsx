/**
 * Ingresos: el corte del día y el resumen del mes.
 *
 * El corte del día es lo que se mira al cerrar, así que es lo primero que sale. Y va
 * desglosado por método porque la pregunta real no es "cuánto entró" sino "cuánto
 * tiene que haber en el cajón".
 */
import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSegmented, GlassSurface } from "@/components/glass";
import { Stagger } from "@/components/motion";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { ahoraClave, desdeClave, sumarDias } from "@/lib/fecha";
import { fetch } from "expo/fetch";

type Periodo = "dia" | "mes";

type Informe = {
  total: number;
  ownerNet: number;
  facialistNet: number;
  count: number;
  porMetodo?: { CASH: number; CARD: number; INCLUDED: number };
  porConcepto?: { CITA: number; PAQUETE: number };
  pendienteFacialista?: number;
};

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "mes", label: "Mes" },
];

function monthName(month: number) {
  return new Date(2024, month - 1, 1).toLocaleString("es-MX", { month: "long" });
}

function dinero(n = 0) {
  return `$${n.toLocaleString("es-MX")}`;
}

/** Una cifra con su etiqueta. El bloque que se repite en todo el corte. */
function Cifra({
  etiqueta,
  cantidad,
  icono,
  color,
}: {
  etiqueta: string;
  cantidad: number;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
}) {
  return (
    <GlassCard radius={Radius.card} style={styles.cifraTarjeta}>
      <View style={styles.cifraInterior}>
        <View style={[styles.cifraIcono, { backgroundColor: color + "18" }]}>
          <Ionicons name={icono} size={20} color={color} />
        </View>
        <Text style={styles.cifraEtiqueta}>{etiqueta}</Text>
        <Text style={[styles.cifraCantidad, { color }]}>{dinero(cantidad)}</Text>
      </View>
    </GlassCard>
  );
}

export default function ReportsScreen() {
  const now = new Date();
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [dia, setDia] = useState(ahoraClave());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const consulta = periodo === "dia" ? `date=${dia}` : `month=${month}&year=${year}`;

  const { data, isLoading } = useQuery<Informe>({
    queryKey: ["/api/reports/income", consulta],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/reports/income?${consulta}`, base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      return res.json() as Promise<Informe>;
    },
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const etiquetaDia = (() => {
    if (dia === ahoraClave()) return "Hoy";
    return desdeClave(dia).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  })();

  const etiqueta = periodo === "dia" ? etiquetaDia : `${monthName(month)} ${year}`;

  return (
    <Screen
      title={periodo === "dia" ? "Corte del día" : "Ingresos del mes"}
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
      below={
        <View style={styles.controles}>
          <GlassSegmented options={PERIODOS} value={periodo} onChange={setPeriodo} />
          <GlassSurface radius={Radius.control} style={styles.navMes}>
            <GlassIconButton
              name="chevron-back"
              diameter={36}
              size={20}
              accessibilityLabel={periodo === "dia" ? "Día anterior" : "Mes anterior"}
              onPress={() => (periodo === "dia" ? setDia((d) => sumarDias(d, -1)) : prevMonth())}
            />
            <Text style={styles.mesEtiqueta}>{etiqueta}</Text>
            <GlassIconButton
              name="chevron-forward"
              diameter={36}
              size={20}
              accessibilityLabel={periodo === "dia" ? "Día siguiente" : "Mes siguiente"}
              onPress={() => (periodo === "dia" ? setDia((d) => sumarDias(d, 1)) : nextMonth())}
            />
          </GlassSurface>
        </View>
      }
    >
      <ScreenScroll contentStyle={styles.columna}>
        {isLoading ? (
          <CargandoLista filas={3} />
        ) : (
          /* La clave del periodo hace que las cifras vuelvan a entrar al cambiarlo:
             el nodo no se destruye solo, hay que recrearlo para relanzar la entrada. */
          <Stagger key={consulta} style={styles.columna}>
            <View style={styles.tarjetaPrincipal}>
              <Text style={styles.principalEtiqueta}>Ingreso total</Text>
              <Text style={styles.principalCantidad}>{dinero(data?.total)}</Text>
              <Text style={styles.principalCuenta}>{data?.count || 0} cobros registrados</Text>
            </View>

            <Text style={styles.seccion}>En qué forma entró</Text>
            <View style={styles.reparto}>
              <Cifra etiqueta="Efectivo" cantidad={data?.porMetodo?.CASH || 0} icono="cash-outline" color={Colors.success} />
              <Cifra etiqueta="Tarjeta" cantidad={data?.porMetodo?.CARD || 0} icono="card-outline" color={Colors.secondary} />
            </View>

            <Text style={styles.seccion}>De dónde vino</Text>
            <View style={styles.reparto}>
              <Cifra etiqueta="Citas" cantidad={data?.porConcepto?.CITA || 0} icono="calendar-outline" color={Colors.primary} />
              <Cifra etiqueta="Paquetes vendidos" cantidad={data?.porConcepto?.PAQUETE || 0} icono="cube-outline" color={Colors.secondary} />
            </View>

            <Text style={styles.seccion}>Cómo se reparte</Text>
            <View style={styles.reparto}>
              <Cifra etiqueta="Dueña / Laserista" cantidad={data?.ownerNet || 0} icono="flower-outline" color={Colors.primary} />
              <Cifra etiqueta="Facialista" cantidad={data?.facialistNet || 0} icono="sparkles-outline" color={Colors.accent} />
            </View>

            {!!data?.pendienteFacialista && (
              <GlassCard radius={Radius.card} style={styles.pendiente}>
                <View style={styles.pendienteInterior}>
                  <Ionicons name="alert-circle-outline" size={20} color={Colors.warning} />
                  <Text style={styles.pendienteTexto}>
                    Falta liquidar {dinero(data.pendienteFacialista)} a la facialista
                  </Text>
                </View>
              </GlassCard>
            )}

            {(!data || data.count === 0) && (
              <EstadoVacio
                icono="bar-chart-outline"
                titulo="Sin datos"
                texto={`No hay cobros registrados en ${periodo === "dia" ? etiquetaDia.toLowerCase() : etiqueta}`}
              />
            )}
          </Stagger>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columna: { gap: Space.lg },
  controles: { gap: Space.sm },
  navMes: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  mesEtiqueta: {
    flex: 1,
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    color: Colors.text,
    textTransform: "capitalize",
    textAlign: "center",
  },
  tarjetaPrincipal: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.panel,
    padding: Space.xl,
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  principalEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)" },
  principalCantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 48, color: "#fff", marginVertical: 4 },
  principalCuenta: { fontFamily: "Nunito_400Regular", fontSize: 13, color: "rgba(255,255,255,0.7)" },

  seccion: {
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: Space.xs,
    marginBottom: -Space.sm,
  },
  reparto: { flexDirection: "row", gap: Space.md },
  cifraTarjeta: { flex: 1 },
  cifraInterior: { padding: Space.lg, alignItems: "center", gap: Space.sm },
  cifraIcono: { width: 40, height: 40, borderRadius: Radius.tile, justifyContent: "center", alignItems: "center" },
  cifraEtiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  cifraCantidad: { fontFamily: "Nunito_800ExtraBold", fontSize: 22 },

  pendiente: { borderColor: Colors.warning + "50" },
  pendienteInterior: { flexDirection: "row", alignItems: "center", gap: Space.sm, padding: Space.lg },
  pendienteTexto: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.text },
});
