/**
 * Qué está pasando en las cabinas y quién viene después (plan p008, sección 1).
 *
 * Es lo primero que se ve al abrir la app, así que dice lo que haría falta preguntar en
 * voz alta: a quién se atiende, cuánto le falta, quién es la siguiente y si ya llegó.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { GlassCard } from "@/components/glass";
import { CargandoLista } from "@/components/Estados";
import { PressableMotion } from "@/components/motion";
import {
  duracionTexto, horaISO, minutosEntre,
  type AhoraYSiguiente as Datos, type CitaInicio,
} from "@/lib/inicio";
import { AccionChip, NotaInicio, SeccionInicio } from "./SeccionInicio";

type Props = {
  datos: Datos;
  ahora: Date;
  cargando: boolean;
  /** Recepción y la dueña ven todo el centro: hace falta decir de quién es cada cita. */
  verProfesional: boolean;
  /** Cuántas hay hoy en total, para distinguir "no hay citas" de "ya no quedan". */
  totalHoy: number;
  /** La cita cuya llegada se está guardando. */
  marcando: string | null;
  onLlego: (cita: CitaInicio) => void;
  onAbrir: (cita: CitaInicio) => void;
  onVerAgenda: () => void;
};

const ESTADO: Record<string, { texto: string; color: string }> = {
  SCHEDULED: { texto: "Sin marcar la llegada", color: Colors.warning },
  ARRIVED: { texto: "Llegó", color: Colors.statusColors.ARRIVED },
  DONE: { texto: "Cobrada", color: Colors.textSecondary },
};

function TipoCita({ tipo }: { tipo?: string }) {
  const esLaser = tipo === "LASER";
  const color = esLaser ? Colors.secondary : Colors.accent;
  return (
    <View style={[estilos.tipo, { backgroundColor: color + "28" }]}>
      <Text style={[estilos.tipoTexto, { color }]}>{esLaser ? "Láser" : "Facial"}</Text>
    </View>
  );
}

function Detalle({ cita, verProfesional }: { cita: CitaInicio; verProfesional: boolean }) {
  const servicios = (cita.services ?? []).map((s) => s?.name).filter(Boolean).join(" · ");
  const partes = [servicios, verProfesional ? cita.staff?.name : null].filter(Boolean);
  if (partes.length === 0) return null;
  return <Text style={estilos.detalle} numberOfLines={2}>{partes.join(" — ")}</Text>;
}

/** Los botones de una cita según su estado. Cobrar se hace en el detalle, donde está el formulario. */
function Acciones({ cita, marcando, onLlego, onAbrir }: Pick<Props, "marcando" | "onLlego" | "onAbrir"> & { cita: CitaInicio }) {
  const nombre = cita.client?.fullName?.trim() || "la clienta";
  return (
    <View style={estilos.acciones}>
      {cita.status === "SCHEDULED" && (
        <AccionChip
          icono="checkmark-circle"
          texto="Llegó"
          color={Colors.success}
          disabled={marcando === cita.id}
          accessibilityLabel={`Marcar que llegó ${nombre}`}
          onPress={() => onLlego(cita)}
        />
      )}
      {cita.status === "ARRIVED" ? (
        <AccionChip icono="card-outline" texto="Cobrar" accessibilityLabel={`Cobrar a ${nombre}`} onPress={() => onAbrir(cita)} />
      ) : (
        <AccionChip icono="open-outline" texto="Ver cita" accessibilityLabel={`Ver la cita de ${nombre}`} onPress={() => onAbrir(cita)} />
      )}
    </View>
  );
}

function TarjetaCita({
  cita,
  etiqueta,
  destacada,
  verProfesional,
  ...acciones
}: Pick<Props, "marcando" | "onLlego" | "onAbrir" | "verProfesional"> & {
  cita: CitaInicio;
  /** "Termina en 25 min", "En 1 h". */
  etiqueta: string;
  destacada?: boolean;
}) {
  const estado = ESTADO[cita.status];
  return (
    <GlassCard tone={destacada ? "pink" : "neutral"} radius={Radius.card} testID={`inicio-cita-${cita.id}`}>
      <View style={estilos.tarjeta}>
        <View style={estilos.filaHora}>
          <Text style={estilos.hora}>
            {horaISO(cita.dateTimeStart)} – {horaISO(cita.dateTimeEnd)}
          </Text>
          <TipoCita tipo={cita.type} />
          <Text style={estilos.etiqueta} numberOfLines={1}>{etiqueta}</Text>
        </View>
        <Text style={estilos.cliente} numberOfLines={1}>{cita.client?.fullName || "Clienta"}</Text>
        <Detalle cita={cita} verProfesional={verProfesional} />
        <View style={estilos.pie}>
          {estado ? (
            <Text style={[estilos.estado, { color: estado.color }]}>{estado.texto}</Text>
          ) : <View />}
          <Acciones cita={cita} {...acciones} />
        </View>
      </View>
    </GlassCard>
  );
}

export function AhoraYSiguiente({
  datos,
  ahora,
  cargando,
  verProfesional,
  totalHoy,
  onVerAgenda,
  ...acciones
}: Props) {
  if (cargando) {
    return (
      <SeccionInicio titulo="Ahora">
        <CargandoLista filas={2} />
      </SeccionInicio>
    );
  }

  const { enCurso, siguiente, despues } = datos;

  if (enCurso.length === 0 && !siguiente) {
    return (
      <SeccionInicio titulo="Ahora">
        <NotaInicio>{totalHoy > 0 ? "Ya no quedan citas hoy." : "Hoy no hay citas."}</NotaInicio>
      </SeccionInicio>
    );
  }

  return (
    <>
      {enCurso.length > 0 && (
        <SeccionInicio titulo="Ahora" detalle={enCurso.length > 1 ? `${enCurso.length} en curso` : undefined}>
          {enCurso.map((cita) => (
            <TarjetaCita
              key={cita.id}
              cita={cita}
              destacada
              etiqueta={`Termina en ${duracionTexto(minutosEntre(ahora, new Date(cita.dateTimeEnd)))}`}
              verProfesional={verProfesional}
              {...acciones}
            />
          ))}
        </SeccionInicio>
      )}

      {siguiente && (
        <SeccionInicio titulo="Siguiente" detalle={horaISO(siguiente.dateTimeStart)}>
          <TarjetaCita
            cita={siguiente}
            etiqueta={`En ${duracionTexto(minutosEntre(ahora, new Date(siguiente.dateTimeStart)))}`}
            verProfesional={verProfesional}
            {...acciones}
          />
          {despues > 0 && (
            <PressableMotion gesto="sutil" onPress={onVerAgenda} accessibilityLabel="Ver la agenda de hoy" style={estilos.mas}>
              <Text style={estilos.masTexto}>
                Y {despues} {despues === 1 ? "cita más" : "citas más"} hoy · Ver agenda
              </Text>
            </PressableMotion>
          )}
        </SeccionInicio>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { padding: Space.lg, gap: Space.xs },
  filaHora: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  hora: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.text },
  etiqueta: { flex: 1, textAlign: "right", fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primaryDark },
  tipo: { borderRadius: Radius.control, paddingHorizontal: Space.sm, paddingVertical: 2 },
  tipoTexto: { fontFamily: "Nunito_700Bold", fontSize: 10 },
  cliente: { fontFamily: "Nunito_800ExtraBold", fontSize: 19, color: Colors.text, marginTop: 2 },
  detalle: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary },
  pie: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Space.sm, marginTop: Space.sm, flexWrap: "wrap" },
  estado: { fontFamily: "Nunito_700Bold", fontSize: 12 },
  acciones: { flexDirection: "row", gap: Space.sm, marginLeft: "auto" },
  mas: { alignItems: "center", paddingVertical: Space.xs },
  masTexto: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.primaryDark },
});
