/**
 * Clientas con sesiones de paquete pagadas y ninguna cita por delante (plan p008,
 * sección 6). Es dinero que ya entró y un servicio que el centro debe: si nadie la
 * llama, no vuelve. Primero las que llevan más tiempo sin venir.
 */
import React from "react";
import { Colors } from "@/constants/colors";
import { haceCuanto } from "@/lib/inicio";
import { AccionChip, FilaInicio, SeccionInicio, TarjetaLista, useVerMas } from "./SeccionInicio";

/** Lo que devuelve `GET /api/client-packages/idle`. */
export type PaqueteSinAgendar = {
  id: string;
  clientId: string;
  totalSessions: number;
  remainingSessions: number;
  startDate: string;
  client: { id: string; fullName: string; phone?: string | null };
  package?: { name?: string | null } | null;
  lastVisit: string | null;
};

export function ParaReagendar({
  paquetes,
  hoy,
  onAbrir,
  onWhatsApp,
  onAgendar,
}: {
  paquetes: PaqueteSinAgendar[];
  hoy: string;
  onAbrir: (clienteId: string) => void;
  onWhatsApp: (p: PaqueteSinAgendar) => void;
  onAgendar: (p: PaqueteSinAgendar) => void;
}) {
  const { visibles, boton } = useVerMas(paquetes);
  if (paquetes.length === 0) return null;

  return (
    <SeccionInicio titulo="Para reagendar" detalle={String(paquetes.length)} testID="inicio-reagendar">
      <TarjetaLista>
        {visibles.map((p) => {
          const nombre = p.client.fullName;
          const visita = p.lastVisit ? `vino ${haceCuanto(p.lastVisit, hoy)}` : "aún no ha venido";
          return (
            <FilaInicio
              key={p.id}
              icono="refresh-circle-outline"
              color={Colors.secondary}
              titulo={nombre}
              detalle={`Le quedan ${p.remainingSessions} de ${p.totalSessions} · ${visita}`}
              onPress={() => onAbrir(p.client.id)}
              accessibilityLabel={`Ver la ficha de ${nombre}`}
              derecha={
                <>
                  {!!p.client.phone && (
                    <AccionChip
                      icono="logo-whatsapp"
                      color={Colors.success}
                      accessibilityLabel={`Escribir a ${nombre} para reagendar`}
                      onPress={() => onWhatsApp(p)}
                    />
                  )}
                  <AccionChip
                    icono="add"
                    texto="Agendar"
                    accessibilityLabel={`Agendar a ${nombre}`}
                    onPress={() => onAgendar(p)}
                  />
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
