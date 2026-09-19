/**
 * Los huecos que quedan hoy, por profesional (plan p008, sección 4).
 *
 * Es la pregunta de quien llama por teléfono ("¿tienes algo hoy?"), que antes se
 * contestaba mirando la Agenda y restando de cabeza. Tocar un hueco abre Nueva cita con
 * la profesional, el día y la hora ya puestos.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { PressableMotion } from "@/components/motion";
import { duracionTexto, type Hueco, type HuecosDelDia, type Profesional } from "@/lib/inicio";
import { NotaInicio, SeccionInicio } from "./SeccionInicio";

export function HuecosHoy({
  huecos,
  verNombre,
  onElegir,
}: {
  huecos: HuecosDelDia;
  /** Con varias profesionales hay que decir de quién es cada fila. */
  verNombre: boolean;
  onElegir: (profesional: Profesional, hueco: Hueco) => void;
}) {
  if (huecos.cerrado) {
    return (
      <SeccionInicio titulo="Huecos de hoy">
        <NotaInicio>Hoy el centro no abre.</NotaInicio>
      </SeccionInicio>
    );
  }
  if (huecos.terminado || huecos.porProfesional.length === 0) return null;

  return (
    <SeccionInicio titulo="Huecos de hoy" testID="inicio-huecos">
      <GlassCard radius={Radius.card}>
        <View style={estilos.dentro}>
          {huecos.porProfesional.map(({ profesional, huecos: libres }) => (
            <View key={profesional.id} style={estilos.profesional}>
              {verNombre && <Text style={estilos.nombre} numberOfLines={1}>{profesional.name}</Text>}
              {libres.length === 0 ? (
                <Text style={estilos.lleno}>Sin huecos</Text>
              ) : (
                <View style={estilos.tramos}>
                  {libres.map((h) => (
                    <PressableMotion
                      key={h.inicio}
                      gesto="escala"
                      onPress={() => onElegir(profesional, h)}
                      accessibilityLabel={`Agendar con ${profesional.name} a las ${h.inicio}`}
                      style={estilos.tramo}
                    >
                      <Text style={estilos.tramoHora}>{h.inicio} – {h.fin}</Text>
                      <Text style={estilos.tramoDuracion}>{duracionTexto(h.minutos)}</Text>
                    </PressableMotion>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </GlassCard>
    </SeccionInicio>
  );
}

const estilos = StyleSheet.create({
  dentro: { padding: Space.lg, gap: Space.md },
  profesional: { gap: Space.xs },
  nombre: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  lleno: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textMuted },
  tramos: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  tramo: {
    borderRadius: Radius.tile,
    backgroundColor: Colors.glass.fillPink,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  tramoHora: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primaryDark },
  tramoDuracion: { fontFamily: "Nunito_600SemiBold", fontSize: 11, color: Colors.textSecondary },
});
