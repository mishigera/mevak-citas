/**
 * Las clientas que cumplen años esta semana (plan p008, sección 8), con un WhatsApp de
 * felicitación ya escrito. Solo salen las que tienen la fecha de nacimiento capturada.
 */
import React from "react";
import { Colors } from "@/constants/colors";
import { nombreDia, type Cumpleanos as Cumple } from "@/lib/inicio";
import { AccionChip, FilaInicio, SeccionInicio, TarjetaLista, useVerMas } from "./SeccionInicio";

/** "Hoy cumple 36", "El lunes cumple 29"; sin año creíble, "Mañana es su cumpleaños". */
function cuando(c: Cumple, hoy: string): string {
  const dia = nombreDia(c.dia, hoy);
  const Dia = `${dia.charAt(0).toUpperCase()}${dia.slice(1)}`;
  return c.edad ? `${Dia} cumple ${c.edad}` : `${Dia} es su cumpleaños`;
}

export function Cumpleanos({
  cumpleanos,
  hoy,
  onAbrir,
  onFelicitar,
}: {
  cumpleanos: Cumple[];
  hoy: string;
  onAbrir: (clienteId: string) => void;
  onFelicitar: (c: Cumple) => void;
}) {
  const { visibles, boton } = useVerMas(cumpleanos);
  if (cumpleanos.length === 0) return null;

  return (
    <SeccionInicio titulo="Cumpleaños" detalle="Esta semana" testID="inicio-cumpleanos">
      <TarjetaLista>
        {visibles.map((c) => (
          <FilaInicio
            key={c.cliente.id}
            icono={c.enDias === 0 ? "gift" : "gift-outline"}
            color={c.enDias === 0 ? Colors.primary : Colors.accent}
            titulo={c.cliente.fullName}
            detalle={cuando(c, hoy)}
            onPress={() => onAbrir(c.cliente.id)}
            derecha={
              c.cliente.phone ? (
                <AccionChip
                  icono="logo-whatsapp"
                  color={Colors.success}
                  accessibilityLabel={`Felicitar a ${c.cliente.fullName} por WhatsApp`}
                  onPress={() => onFelicitar(c)}
                />
              ) : undefined
            }
          />
        ))}
      </TarjetaLista>
      {boton}
    </SeccionInicio>
  );
}
