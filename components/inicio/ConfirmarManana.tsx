/**
 * Las citas del siguiente día que abre el centro, para confirmarlas una a una (plan
 * p008, sección 5). El no-show es lo que más le cuesta a un centro así.
 *
 * WhatsApp abre el mensaje ya escrito; "Confirmar" lo marca una persona cuando la
 * clienta contesta. La app no lee WhatsApp.
 */
import React from "react";
import { Colors } from "@/constants/colors";
import { horaISO, type CitaInicio } from "@/lib/inicio";
import { AccionChip, FilaInicio, SeccionInicio, TarjetaLista, useVerMas } from "./SeccionInicio";

export function ConfirmarManana({
  titulo,
  citas,
  verProfesional,
  marcando,
  onConfirmar,
  onWhatsApp,
  onAbrir,
}: {
  /** "Confirmar mañana", "Confirmar el lunes". */
  titulo: string;
  citas: CitaInicio[];
  verProfesional: boolean;
  /** La cita cuya confirmación se está guardando. */
  marcando: string | null;
  onConfirmar: (cita: CitaInicio, confirmada: boolean) => void;
  onWhatsApp: (cita: CitaInicio) => void;
  onAbrir: (cita: CitaInicio) => void;
}) {
  const { visibles, boton } = useVerMas(citas);
  if (citas.length === 0) return null;

  const confirmadas = citas.filter((c) => c.confirmedAt).length;

  return (
    <SeccionInicio titulo={titulo} detalle={`${confirmadas} de ${citas.length} confirmadas`} testID="inicio-confirmar">
      <TarjetaLista>
        {visibles.map((cita) => {
          const nombre = cita.client?.fullName?.trim() || "Clienta";
          const confirmada = !!cita.confirmedAt;
          const detalle = [
            horaISO(cita.dateTimeStart),
            cita.type === "LASER" ? "Láser" : "Facial",
            verProfesional ? cita.staff?.name : null,
          ].filter(Boolean).join(" · ");

          return (
            <FilaInicio
              key={cita.id}
              icono={confirmada ? "checkmark-circle" : "help-circle-outline"}
              color={confirmada ? Colors.success : Colors.warning}
              titulo={nombre}
              detalle={detalle}
              onPress={() => onAbrir(cita)}
              accessibilityLabel={`Ver la cita de ${nombre}`}
              derecha={
                <>
                  {!!cita.client?.phone && (
                    <AccionChip
                      icono="logo-whatsapp"
                      color={Colors.success}
                      accessibilityLabel={`Escribir a ${nombre} por WhatsApp`}
                      onPress={() => onWhatsApp(cita)}
                    />
                  )}
                  {confirmada ? (
                    <AccionChip
                      icono="checkmark-done"
                      texto="Confirmada"
                      color={Colors.success}
                      disabled={marcando === cita.id}
                      accessibilityLabel={`Quitar la confirmación de ${nombre}`}
                      onPress={() => onConfirmar(cita, false)}
                    />
                  ) : (
                    <AccionChip
                      icono="checkmark"
                      texto="Confirmar"
                      disabled={marcando === cita.id}
                      accessibilityLabel={`Marcar confirmada la cita de ${nombre}`}
                      onPress={() => onConfirmar(cita, true)}
                    />
                  )}
                </>
              }
            />
          );
        })}
      </TarjetaLista>
      {boton}
    </SeccionInicio>
  );
}
