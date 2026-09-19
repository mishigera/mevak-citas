/**
 * El diálogo de vidrio donde salen todos los `alerta()` de la app.
 *
 * Se monta una sola vez, en `app/_layout.tsx`, y se engancha a `lib/alerta.ts` al
 * montarse. Es un `GlassPopover` centrado, como los paneles del detalle de cita: fondo
 * que cierra al tocar fuera, Escape en web, foco al botón de cerrar al abrir.
 *
 * Cerrar sin elegir (fondo, Escape, la ✕) equivale al botón `cancel`. Si no hay y el
 * aviso tiene un solo botón, a ese: es un "Aceptar", y a veces su `onPress` es lo que
 * navega (crear clienta → vuelve a la lista). Con varios botones y ninguno `cancel`,
 * cerrar solo cierra.
 *
 * Si llegan dos avisos seguidos salen uno detrás de otro, en orden.
 */
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type AlertButton } from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassPopover } from "@/components/glass";
import { PressableMotion } from "@/components/motion";
import { conectarDialogo, type Aviso } from "@/lib/alerta";

/** Ancho máximo del diálogo en pantallas grandes. */
const ANCHO_MAXIMO = 400;

function botonAlCerrar(aviso: Aviso): AlertButton | undefined {
  return aviso.botones.find((b) => b.style === "cancel") ?? (aviso.botones.length === 1 ? aviso.botones[0] : undefined);
}

export function DialogoAlerta() {
  const [cola, setCola] = useState<Aviso[]>([]);
  // El último que se enseñó, para que el panel no se quede vacío mientras se cierra.
  const [ultimo, setUltimo] = useState<Aviso | null>(null);
  const { width, height } = useWindowDimensions();
  const actual = cola[0];
  const respondido = useRef(false);

  useEffect(() => conectarDialogo((aviso) => setCola((c) => [...c, aviso])), []);

  useEffect(() => {
    if (actual) {
      setUltimo(actual);
      respondido.current = false;
    }
  }, [actual]);

  const responder = (boton?: AlertButton) => {
    // Un doble toque o el cierre por navegar no pueden disparar dos respuestas.
    if (!actual || respondido.current) return;
    respondido.current = true;
    setCola((c) => c.slice(1));
    boton?.onPress?.();
  };

  const aviso = actual ?? ultimo;
  const ancho = Math.min(width - Space.lg * 2, ANCHO_MAXIMO);
  const posicion = { top: Math.round(height * 0.28), left: Math.round((width - ancho) / 2), width: ancho };

  return (
    <GlassPopover
      visible={!!actual}
      onClose={() => actual && responder(botonAlCerrar(actual))}
      titulo={aviso?.titulo}
      origen="centro"
      style={[styles.panel, posicion]}
    >
      {aviso && (
        <View style={styles.cuerpo} testID="dialogo-alerta">
          {!!aviso.mensaje && <Text style={styles.mensaje}>{aviso.mensaje}</Text>}
          <View style={[styles.botonera, aviso.botones.length > 2 && styles.botoneraVertical]}>
            {aviso.botones.map((boton, i) => {
              const esCancelar = boton.style === "cancel";
              const esDestructivo = boton.style === "destructive";
              return (
                <PressableMotion
                  key={`${boton.text}-${i}`}
                  gesto="sutil"
                  accessibilityLabel={boton.text}
                  style={[
                    styles.boton,
                    esCancelar ? styles.botonCancelar : esDestructivo ? styles.botonDestructivo : styles.botonPrincipal,
                  ]}
                  onPress={() => responder(boton)}
                >
                  <Text style={[styles.botonTexto, esCancelar && styles.botonTextoCancelar]}>{boton.text}</Text>
                </PressableMotion>
              );
            })}
          </View>
        </View>
      )}
    </GlassPopover>
  );
}

const styles = StyleSheet.create({
  panel: { maxHeight: 420 },
  cuerpo: { paddingHorizontal: Space.lg, paddingBottom: Space.lg, gap: Space.lg },
  mensaje: { fontFamily: "Nunito_400Regular", fontSize: 15, lineHeight: 21, color: Colors.textSecondary },
  botonera: { flexDirection: "row", gap: Space.sm },
  botoneraVertical: { flexDirection: "column" },
  boton: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: Space.md,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  botonPrincipal: { backgroundColor: Colors.primary },
  botonDestructivo: { backgroundColor: Colors.error },
  botonCancelar: { backgroundColor: Colors.glass.fillStrong, borderWidth: 1, borderColor: Colors.border },
  botonTexto: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.surface },
  botonTextoCancelar: { color: Colors.textSecondary },
});
