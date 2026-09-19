/**
 * Lo que pide que alguien haga algo hoy (plan p008, sección 2).
 *
 * Son los mismos avisos que calcula la campana (`components/avisos/calcular.ts`), pero a
 * la vista: quién espera, qué cita terminó sin cerrar, qué bloqueos hay, qué falta por
 * liquidar. Menos "cita en N min", que ya la cuenta "Siguiente".
 */
import React from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { Aviso } from "@/components/avisos/calcular";
import { FilaInicio, SeccionInicio, TarjetaLista, useVerMas } from "./SeccionInicio";

export function avisosPorAtender(avisos: Aviso[]): Aviso[] {
  return avisos.filter((a) => a.tipo !== "PROXIMA");
}

export function PorAtender({ avisos, onAbrir }: { avisos: Aviso[]; onAbrir: (ruta: string) => void }) {
  const { visibles, boton } = useVerMas(avisos);
  if (avisos.length === 0) return null;

  return (
    <SeccionInicio titulo="Por atender" detalle={String(avisos.length)} testID="inicio-por-atender">
      <TarjetaLista>
        {visibles.map((aviso) => (
          <FilaInicio
            key={aviso.id}
            icono={aviso.icono as React.ComponentProps<typeof Ionicons>["name"]}
            color={aviso.color}
            titulo={aviso.titulo}
            detalle={aviso.detalle}
            onPress={aviso.ruta ? () => onAbrir(aviso.ruta!) : undefined}
          />
        ))}
      </TarjetaLista>
      {boton}
    </SeccionInicio>
  );
}
