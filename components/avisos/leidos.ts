/**
 * Qué avisos ya se vieron.
 *
 * Es **local al dispositivo**: no hay tabla de notificaciones ni endpoint que guarde
 * esto, y este plan no añade ninguno. Vive en `AsyncStorage`, al lado del token de
 * sesión, con la misma vida que él.
 *
 * El estado vive en un almacén de módulo, no en cada componente, porque las cuatro
 * pestañas montan su propia campana y se quedan montadas: con estado local, marcar
 * como leído en una dejaría a las otras tres enseñando la insignia vieja.
 *
 * Al guardar se podan los ids que ya no existen: si no, la lista crecería para siempre
 * con avisos de citas de hace meses.
 */
import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CLAVE = "avisos_leidos";

export async function cargarLeidos(): Promise<string[]> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    const valor: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function guardarLeidos(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch {
    // Si el almacenamiento falla, lo peor que pasa es que el punto vuelva a salir.
  }
}

let leidos: string[] = [];
let cargado = false;
const oyentes = new Set<() => void>();

function notificar() {
  oyentes.forEach((f) => f());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  if (!cargado) {
    cargado = true;
    cargarLeidos().then((ids) => {
      if (ids.length === 0) return;
      leidos = ids;
      notificar();
    });
  }
  return () => {
    oyentes.delete(oyente);
  };
}

const leer = () => leidos;

/** Solo para los tests. */
export function __reiniciarLeidos() {
  leidos = [];
  cargado = false;
  notificar();
}

export function useAvisosLeidos(idsVigentes: string[]) {
  const vistos = useSyncExternalStore(suscribir, leer, leer);

  const estaLeido = useCallback((id: string) => vistos.includes(id), [vistos]);

  const marcarTodos = useCallback(() => {
    const union = new Set([...leidos, ...idsVigentes]);
    const podados = idsVigentes.filter((id) => union.has(id));
    const igual = podados.length === leidos.length && podados.every((id) => leidos.includes(id));
    if (igual) return;
    leidos = podados;
    guardarLeidos(podados);
    notificar();
  }, [idsVigentes]);

  const sinLeer = idsVigentes.filter((id) => !vistos.includes(id)).length;

  return { leidos: vistos, estaLeido, marcarTodos, sinLeer };
}
