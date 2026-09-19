/**
 * Los dos campos que sustituyen al texto libre para fecha y hora.
 *
 * Antes se tecleaban a mano (`YYYY-MM-DD` y `HH:MM`, con teclado numérico) y nadie
 * validaba nada: una fecha mal escrita daba `NaN`, la detección de solapes se apagaba
 * en silencio —toda comparación con `NaN` es `false`— y la cita se guardaba en un día
 * que no existía, así que no aparecía en ninguna lista. Deuda §30.
 *
 * Aquí no hay forma de escribir una fecha inválida: se elige de una rejilla y de una
 * lista. El valor que sale sigue siendo `"YYYY-MM-DD"` y `"HH:MM"`, que es lo que ya
 * esperan las pantallas y el servidor.
 */
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassPopover, GlassSurface } from "@/components/glass";
import { PressableMotion } from "@/components/motion";
import { ahoraClave, claveDiaLocal, desdeClave } from "@/lib/fecha";

const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Primera y última hora que se pueden elegir, y el salto entre opciones. */
const HORA_MIN = 7;
const HORA_MAX = 21;
const PASO_MINUTOS = 15;

function Etiqueta({ children }: { children: string }) {
  return <Text style={estilos.etiqueta}>{children}</Text>;
}

/** La fila pulsable que abre el panel. Igual para los dos campos. */
function Disparador({
  valor,
  icono,
  accessibilityLabel,
  abierto,
  onPress,
}: {
  valor: string;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel: string;
  abierto: boolean;
  onPress: () => void;
}) {
  return (
    <PressableMotion
      gesto="sutil"
      // La etiqueta es fija y el valor va aparte: si el valor formara parte de la
      // etiqueta, cambiaría a cada selección y no habría forma estable de apuntar al
      // control — ni para un lector de pantalla ni para un test.
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: valor }}
      accessibilityHasPopup
      accessibilityState={{ expanded: abierto }}
      onPress={onPress}
    >
      <GlassSurface radius={Radius.tile} style={estilos.fila}>
        <Ionicons name={icono} size={16} color={Colors.primary} />
        <Text style={estilos.valor} numberOfLines={1}>{valor}</Text>
        <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
      </GlassSurface>
    </PressableMotion>
  );
}

/** Por debajo de este ancho la fecha va abreviada: "Hoy, 18 sep" en vez de la larga. */
const ANCHO_FECHA_CORTA = 240;

function textoFecha(clave: string, corta = false): string {
  const d = desdeClave(clave);
  if (Number.isNaN(d.getTime())) return clave;
  const hoy = clave === ahoraClave();
  if (corta) {
    const cuerpo = `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    return hoy ? `Hoy, ${cuerpo}` : `${DIAS[d.getDay()]} ${cuerpo}`;
  }
  const cuerpo = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return hoy ? `Hoy, ${cuerpo}` : cuerpo;
}

export function CampoFecha({
  etiqueta,
  value,
  onChange,
  style,
  testID,
}: {
  etiqueta?: string;
  value: string;
  onChange: (clave: string) => void;
  style?: object;
  testID?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [angosto, setAngosto] = useState(false);
  const refAncla = useRef<View | null>(null);
  const [mesVisible, setMesVisible] = useState(() => {
    const d = desdeClave(value || ahoraClave());
    return Number.isNaN(d.getTime()) ? desdeClave(ahoraClave()) : d;
  });

  const celdas = useMemo(() => {
    const año = mesVisible.getFullYear();
    const mes = mesVisible.getMonth();
    const primerDia = new Date(año, mes, 1).getDay();
    const dias = new Date(año, mes + 1, 0).getDate();
    const resultado: ({ clave: string; dia: number } | null)[] = [];
    for (let i = 0; i < primerDia; i++) resultado.push(null);
    for (let d = 1; d <= dias; d++) {
      resultado.push({ clave: claveDiaLocal(new Date(año, mes, d)), dia: d });
    }
    return resultado;
  }, [mesVisible]);

  const moverMes = (delta: number) => {
    const d = new Date(mesVisible);
    d.setMonth(d.getMonth() + delta);
    setMesVisible(d);
  };

  const hoy = ahoraClave();

  return (
    <View style={[estilos.contenedor, style]} testID={testID}>
      {!!etiqueta && <Etiqueta>{etiqueta}</Etiqueta>}
      <View
        ref={refAncla}
        style={estilos.ancla}
        // Para acortar la fecha cuando el campo va en media columna (Bloqueos).
        onLayout={(e: LayoutChangeEvent) => setAngosto(e.nativeEvent.layout.width < ANCHO_FECHA_CORTA)}
      >
        <Disparador
          valor={value ? textoFecha(value, angosto) : "Elegir fecha"}
          icono="calendar-outline"
          accessibilityLabel={etiqueta || "Elegir fecha"}
          abierto={abierto}
          onPress={() => setAbierto(true)}
        />
        <GlassPopover
          visible={abierto}
          onClose={() => setAbierto(false)}
          titulo="Elegir fecha"
          origen="arriba-izquierda"
          diametroOrigen={52}
          anclaRef={refAncla}
          // Siete columnas de días no caben en media columna: el calendario pide su sitio.
          anchoMinimo={300}
          style={estilos.panelFecha}
        >
          <View style={estilos.panelInterior}>
            <View style={estilos.navMes}>
              <PressableMotion gesto="sutil" accessibilityLabel="Mes anterior" onPress={() => moverMes(-1)} style={estilos.navBoton}>
                <Ionicons name="chevron-back" size={18} color={Colors.primaryDark} />
              </PressableMotion>
              <Text style={estilos.navTexto} accessibilityLabel={`Mes visible: ${mesVisible.getFullYear()}-${String(mesVisible.getMonth() + 1).padStart(2, "0")}`}>
                {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
              </Text>
              <PressableMotion gesto="sutil" accessibilityLabel="Mes siguiente" onPress={() => moverMes(1)} style={estilos.navBoton}>
                <Ionicons name="chevron-forward" size={18} color={Colors.primaryDark} />
              </PressableMotion>
            </View>

            <View style={estilos.cabeceraDias}>
              {DIAS.map((d) => (
                <Text key={d} style={estilos.cabeceraDia}>{d}</Text>
              ))}
            </View>

            <View style={estilos.rejilla}>
              {celdas.map((celda, i) => {
                if (!celda) return <View key={`hueco-${i}`} style={estilos.celda} />;
                const elegido = celda.clave === value;
                const esHoy = celda.clave === hoy;
                return (
                  <PressableMotion
                    key={celda.clave}
                    gesto="sutil"
                    accessibilityLabel={`${celda.dia}`}
                    accessibilityState={{ selected: elegido }}
                    style={[estilos.celda, elegido && estilos.celdaElegida, !elegido && esHoy && estilos.celdaHoy]}
                    onPress={() => {
                      onChange(celda.clave);
                      setAbierto(false);
                    }}
                  >
                    <Text style={[estilos.celdaTexto, elegido && estilos.celdaTextoElegido]}>{celda.dia}</Text>
                  </PressableMotion>
                );
              })}
            </View>
          </View>
        </GlassPopover>
      </View>
    </View>
  );
}

export function CampoHora({
  etiqueta,
  value,
  onChange,
  style,
  testID,
}: {
  etiqueta?: string;
  value: string;
  onChange: (hora: string) => void;
  style?: object;
  testID?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const refAncla = useRef<View | null>(null);
  const refLista = useRef<ScrollView | null>(null);

  const horas = useMemo(() => {
    const salida: string[] = [];
    for (let h = HORA_MIN; h <= HORA_MAX; h++) {
      for (let m = 0; m < 60; m += PASO_MINUTOS) {
        salida.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return salida;
  }, []);

  return (
    <View style={[estilos.contenedor, style]} testID={testID}>
      {!!etiqueta && <Etiqueta>{etiqueta}</Etiqueta>}
      <View ref={refAncla} style={estilos.ancla}>
        <Disparador
          valor={value || "Elegir hora"}
          icono="time-outline"
          accessibilityLabel={etiqueta || "Elegir hora"}
          abierto={abierto}
          onPress={() => setAbierto(true)}
        />
        <GlassPopover
          visible={abierto}
          onClose={() => setAbierto(false)}
          titulo={etiqueta || "Elegir hora"}
          origen="arriba-izquierda"
          diametroOrigen={52}
          anclaRef={refAncla}
          style={estilos.panelHora}
        >
          <ScrollView ref={refLista} style={estilos.listaHoras} showsVerticalScrollIndicator={false}>
            <View style={estilos.listaInterior}>
              {horas.map((h) => {
                const elegida = h === value;
                return (
                  <View
                    key={h}
                    // La lista abre en la hora elegida y no en las 07:00: son 57 opciones
                    // y quien agenda lo hace veinte veces al día.
                    onLayout={
                      elegida
                        ? (e: LayoutChangeEvent) =>
                            refLista.current?.scrollTo({ y: Math.max(e.nativeEvent.layout.y - 60, 0), animated: false })
                        : undefined
                    }
                  >
                    <PressableMotion
                      gesto="sutil"
                      accessibilityLabel={h}
                      accessibilityState={{ selected: elegida }}
                      style={[estilos.opcionHora, elegida && estilos.opcionHoraElegida]}
                      onPress={() => {
                        onChange(h);
                        setAbierto(false);
                      }}
                    >
                      <Text style={[estilos.opcionHoraTexto, elegida && estilos.opcionHoraTextoElegida]}>{h}</Text>
                    </PressableMotion>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </GlassPopover>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { gap: 6 },
  etiqueta: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: Space.xs,
  },
  ancla: { position: "relative" },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  valor: { flex: 1, fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },

  // En web el panel se coloca solo pegado al campo (`anclaRef`); `top/left/right` solo
  // valen para nativo, donde no hay portal.
  panelFecha: { top: 54, left: 0, right: 0, maxHeight: 380 },
  panelHora: { top: 54, left: 0, right: 0, maxHeight: 300 },
  panelInterior: { paddingHorizontal: Space.md, paddingBottom: Space.md, gap: Space.sm },

  navMes: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBoton: { padding: Space.xs },
  navTexto: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: Colors.text,
    textTransform: "capitalize",
  },

  cabeceraDias: { flexDirection: "row" },
  cabeceraDia: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
  },
  rejilla: { flexDirection: "row", flexWrap: "wrap" },
  celda: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.tile,
  },
  celdaElegida: { backgroundColor: Colors.primary },
  celdaHoy: { borderWidth: 1, borderColor: Colors.primary + "60" },
  celdaTexto: { fontFamily: "Nunito_600SemiBold", fontSize: 14, color: Colors.text },
  celdaTextoElegido: { color: "#fff", fontFamily: "Nunito_800ExtraBold" },

  listaHoras: { maxHeight: 240 },
  listaInterior: { paddingHorizontal: Space.md, paddingBottom: Space.md, gap: 2 },
  opcionHora: { paddingVertical: Space.sm + 2, paddingHorizontal: Space.md, borderRadius: Radius.tile },
  opcionHoraElegida: { backgroundColor: Colors.primary + "22" },
  opcionHoraTexto: { fontFamily: "Nunito_600SemiBold", fontSize: 15, color: Colors.text },
  opcionHoraTextoElegida: { color: Colors.primaryDark, fontFamily: "Nunito_800ExtraBold" },
});
