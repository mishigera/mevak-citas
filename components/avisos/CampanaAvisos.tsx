/**
 * La campana y su panel de avisos.
 *
 * La campana es una esfera de vidrio rosa; al pulsarla el panel **no aparece**, sino que
 * crece desde ese mismo círculo con un resorte y al cerrar colapsa hacia él. Toda esa
 * mecánica vive en `GlassPopover`; aquí se decide qué se cuenta dentro.
 *
 * Los avisos salen de datos que la app ya carga (`components/avisos/calcular.ts`) y no
 * hay sondeo: nada de `setInterval`. Al abrir el panel se piden otra vez las tres
 * consultas, que es justo cuando importa que estén frescas, y el resto del tiempo se
 * refrescan con el resto de la app.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { Blur, Radius, Space } from "@/constants/theme";
import { Curva } from "@/constants/motion";
import { estiloWeb, ms, usaCSS, useMotionPreferences } from "@/lib/motion";
import { useBreakpoint } from "@/lib/responsive";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/auth";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { GlassPopover } from "@/components/glass/GlassPopover";
import { Flotar, PressableMotion, Pop, Stagger } from "@/components/motion";
import { ShimmerTarjeta } from "@/components/motion/Shimmer";
import { agruparPorDia, calcularAvisos, type Aviso, type BloqueoAviso, type CitaAviso, type PagoAviso } from "./calcular";
import { useAvisosLeidos } from "./leidos";
import { ahoraClave } from "@/lib/fecha";

const DIAMETRO = 44;
/** Cuánto tarda un aviso recién visto en apagar su punto. */
const MARCAR_TRAS = 1200;

const web = StyleSheet.create({
  // La campana suena cuando llega algo nuevo: rotación amortiguada, no un meneo suelto.
  sonando: estiloWeb({
    animationKeyframes: [
      {
        "0%": { transform: [{ rotate: "0deg" }] },
        "12%": { transform: [{ rotate: "16deg" }] },
        "26%": { transform: [{ rotate: "-14deg" }] },
        "40%": { transform: [{ rotate: "10deg" }] },
        "54%": { transform: [{ rotate: "-7deg" }] },
        "68%": { transform: [{ rotate: "4deg" }] },
        "82%": { transform: [{ rotate: "-2deg" }] },
        "100%": { transform: [{ rotate: "0deg" }] },
      },
    ],
    animationDuration: ms(900),
    animationTimingFunction: Curva.suave,
    // Pivota desde el yugo, no desde el centro: una campana cuelga.
    transformOrigin: "50% 12%",
  }),
  // El punto de "sin leer" late por sombra, que no repinta el layout.
  latido: estiloWeb({
    animationKeyframes: [
      { "0%": { boxShadow: `0 0 0 0 ${Colors.glass.shadowCssStrong}` }, "70%": { boxShadow: `0 0 0 5px rgba(140,84,104,0)` }, "100%": { boxShadow: `0 0 0 0 rgba(140,84,104,0)` } },
    ],
    animationDuration: ms(2400),
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
  }),
  puntoApagado: estiloWeb({
    transform: [{ scale: 0 }],
    opacity: 0,
    transitionProperty: "transform, opacity",
    transitionDuration: ms(450),
    transitionTimingFunction: Curva.suave,
  }),
  punto: estiloWeb({
    transitionProperty: "transform, opacity",
    transitionDuration: ms(450),
    transitionTimingFunction: Curva.suave,
  }),
});

export function CampanaAvisos() {
  const { user, isOwner } = useAuth();
  const layout = useBreakpoint();
  const { movimientoReducido } = useMotionPreferences();
  const [abierto, setAbierto] = useState(false);
  const refCampana = useRef<View | null>(null);
  const hoy = ahoraClave();

  // Misma clave que usa la pantalla de inicio: si ya cargó las citas de hoy, esto no
  // dispara una segunda petición.
  const citas = useQuery<CitaAviso[]>({
    queryKey: ["/api/appointments", hoy],
    queryFn: async () => (await apiRequest("GET", `/api/appointments?date=${hoy}`)).json(),
    enabled: !!user,
  });

  // Las tres consultas traen su `queryFn` explícita aunque el cliente global ya tenga
  // una por defecto: así la campana funciona igual montada en cualquier sitio, y los
  // tests no dependen de qué cliente le toque.
  const pagos = useQuery<PagoAviso[]>({
    queryKey: ["/api/payments/pending-facialist"],
    queryFn: async () => (await apiRequest("GET", "/api/payments/pending-facialist")).json(),
    enabled: !!user && isOwner,
  });

  const bloqueos = useQuery<BloqueoAviso[]>({
    queryKey: ["/api/blocks"],
    queryFn: async () => (await apiRequest("GET", "/api/blocks")).json(),
    enabled: !!user,
  });

  const avisos = useMemo(
    () =>
      calcularAvisos({
        citas: citas.data ?? [],
        pagos: pagos.data ?? [],
        bloqueos: bloqueos.data ?? [],
      }),
    [citas.data, pagos.data, bloqueos.data],
  );

  const ids = useMemo(() => avisos.map((a) => a.id), [avisos]);
  const { estaLeido, marcarTodos, sinLeer } = useAvisosLeidos(ids);
  const grupos = useMemo(() => agruparPorDia(avisos), [avisos]);
  const cargando = citas.isLoading || bloqueos.isLoading;

  // Se dan por vistos con un respiro: si se marcaran al abrir, el punto se apagaría
  // antes de que diese tiempo a verlo.
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(marcarTodos, MARCAR_TRAS);
    return () => clearTimeout(t);
  }, [abierto, marcarTodos]);

  // Que suene cuando el número de no leídos crece, y solo entonces.
  const [sonando, setSonando] = useState(false);
  const anteriores = useRef(sinLeer);
  useEffect(() => {
    if (sinLeer > anteriores.current) {
      setSonando(true);
      const t = setTimeout(() => setSonando(false), 1200);
      anteriores.current = sinLeer;
      return () => clearTimeout(t);
    }
    anteriores.current = sinLeer;
  }, [sinLeer]);

  const alternar = useCallback(() => {
    Haptics.selectionAsync();
    setAbierto((v) => {
      if (!v) {
        citas.refetch();
        bloqueos.refetch();
        if (isOwner) pagos.refetch();
      }
      return !v;
    });
  }, [citas, bloqueos, pagos, isOwner]);

  const abrirAviso = useCallback((aviso: Aviso) => {
    setAbierto(false);
    if (aviso.ruta) router.push(aviso.ruta as never);
  }, []);

  if (!user) return null;

  const anchoPanel = Math.min(360, Math.max(260, layout.width - layout.gutter * 2));

  return (
    <View style={estilos.ancla}>
      <PressableMotion
        gesto="escala"
        onPress={alternar}
        accessibilityLabel={sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : "Avisos"}
        accessibilityHasPopup
        accessibilityState={{ expanded: abierto }}
        hitSlop={8}
        testID="campana-avisos"
        style={estilos.campanaBoton}
      >
        <View ref={refCampana}>
          <GlassSurface
            tone="pink"
            intensity={Blur.control}
            radius={DIAMETRO / 2}
            style={[estilos.campana, { width: DIAMETRO, height: DIAMETRO }]}
          >
            <View style={usaCSS && sonando && !movimientoReducido ? web.sonando : undefined}>
              <Ionicons
                name={sinLeer > 0 ? "notifications" : "notifications-outline"}
                size={20}
                color={Colors.primaryDark}
              />
            </View>
          </GlassSurface>
        </View>

        {sinLeer > 0 && (
          /* Recrear el nodo al cambiar el número es lo que relanza su `pop`. */
          <Pop key={sinLeer} style={estilos.insignia}>
            <Text style={estilos.insigniaTexto}>{sinLeer > 9 ? "9+" : sinLeer}</Text>
          </Pop>
        )}
      </PressableMotion>

      <GlassPopover
        visible={abierto}
        onClose={() => setAbierto(false)}
        titulo="Avisos"
        origen="arriba-derecha"
        diametroOrigen={DIAMETRO}
        refOrigen={refCampana}
        // Anclado a la campana: en el teléfono el panel se salía por la izquierda, la
        // tira de días de Inicio se pintaba encima y tocar fuera no lo cerraba. Mismo
        // fallo y mismo arreglo que los campos de formulario (ver `GlassPopover`).
        anclaRef={refCampana}
        anchoMinimo={anchoPanel}
        testID="panel-avisos"
        style={[estilos.panel, { width: anchoPanel }]}
      >
        <ScrollView style={estilos.lista} contentContainerStyle={estilos.listaContenido}>
          {cargando ? (
            <View style={estilos.cargando}>
              <ShimmerTarjeta />
              <ShimmerTarjeta lineas={1} />
            </View>
          ) : avisos.length === 0 ? (
            <View style={estilos.vacio}>
              <Flotar>
                <Ionicons name="sparkles-outline" size={34} color={Colors.primary} />
              </Flotar>
              <Text style={estilos.vacioTitulo}>Todo en orden</Text>
              <Text style={estilos.vacioTexto}>No hay nada que requiera tu atención.</Text>
            </View>
          ) : (
            grupos.map((grupo) => (
              <View key={grupo.clave}>
                <Text style={estilos.dia}>{grupo.etiqueta}</Text>
                <Stagger style={estilos.grupo}>
                  {grupo.avisos.map((aviso) => (
                    <FilaAviso
                      key={aviso.id}
                      aviso={aviso}
                      leido={estaLeido(aviso.id)}
                      onPress={() => abrirAviso(aviso)}
                    />
                  ))}
                </Stagger>
              </View>
            ))
          )}
        </ScrollView>
      </GlassPopover>
    </View>
  );
}

function FilaAviso({ aviso, leido, onPress }: { aviso: Aviso; leido: boolean; onPress: () => void }) {
  return (
    <PressableMotion gesto="sutil" onPress={onPress} accessibilityLabel={aviso.titulo} style={estilos.fila}>
      {/* Casi opaca a propósito: sobre el vidrio del panel, una tarjeta también
          translúcida deja el texto ilegible en cuanto detrás hay una foto. */}
      <GlassSurface tone="strong" intensity={Blur.card} radius={Radius.tile} style={estilos.filaFondo}>
        <View style={[estilos.icono, { backgroundColor: aviso.color + "22" }]}>
          <Ionicons name={aviso.icono as never} size={18} color={aviso.color} />
        </View>
        <View style={estilos.filaTextos}>
          <Text style={estilos.filaTitulo} numberOfLines={1}>
            {aviso.titulo}
          </Text>
          <Text style={estilos.filaDetalle} numberOfLines={2}>
            {aviso.detalle}
          </Text>
        </View>
        <View
          style={[
            estilos.punto,
            usaCSS && (leido ? web.puntoApagado : [web.punto, web.latido]),
            !usaCSS && leido && estilos.puntoOculto,
          ]}
        />
      </GlassSurface>
    </PressableMotion>
  );
}

const estilos = StyleSheet.create({
  ancla: { position: "relative" },
  campanaBoton: { borderRadius: DIAMETRO / 2 },
  campana: { alignItems: "center", justifyContent: "center" },
  insignia: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  insigniaTexto: { color: "#fff", fontSize: 10, fontFamily: "Nunito_800ExtraBold" },

  panel: { top: DIAMETRO + Space.sm, right: 0, maxHeight: 420 },
  lista: { maxHeight: 360 },
  listaContenido: { paddingHorizontal: Space.md, paddingBottom: Space.md, gap: Space.sm },
  grupo: { gap: Space.sm },
  dia: {
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },

  fila: { borderRadius: Radius.tile },
  filaFondo: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.md },
  icono: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  filaTextos: { flex: 1, minWidth: 0 },
  filaTitulo: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  filaDetalle: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  puntoOculto: { opacity: 0 },

  cargando: { gap: Space.sm, paddingTop: Space.sm },
  vacio: { alignItems: "center", gap: Space.sm, paddingVertical: Space.xl },
  vacioTitulo: { fontFamily: "Nunito_800ExtraBold", fontSize: 15, color: Colors.text },
  vacioTexto: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
});

export default CampanaAvisos;
