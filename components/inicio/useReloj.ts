import { useEffect, useState } from "react";

/**
 * La hora de ahora, que se renueva sola cada `cadaMs`. Es lo que hace avanzar "termina
 * en 25 min" y lo que cambia el día a medianoche sin tener que salir de la pantalla.
 */
export function useReloj(cadaMs = 60_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
