/**
 * Lo que el movimiento necesita saber del entorno: en qué plataforma corre y qué
 * prefiere el usuario.
 *
 * Aquí hay una restricción que condiciona todo el diseño: **esta app no tiene hoja de
 * estilos global**. `app/+html.tsx` está escrito pero Expo solo lo aplica con
 * `web.output: "static"` (deuda §19), así que no hay sitio donde poner un
 * `@media (prefers-reduced-motion: reduce)`. Las preferencias se leen en JS y se
 * aplican como estilo, una a una.
 *
 * `useMotionPreferences()` se llama desde cada superficie de vidrio, así que el estado
 * vive en un almacén de módulo y los componentes se suscriben con
 * `useSyncExternalStore`: una sola lectura del sistema, sin un `useEffect` por tarjeta.
 */
import { useMemo, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform, type TextStyle, type ViewStyle } from "react-native";
import { Curva } from "@/constants/motion";

/**
 * Si el movimiento se expresa como CSS (web) o con `Animated` (nativo).
 * Vive aquí y no en cada componente para que los tests puedan fijarlo:
 *   jest.mock("@/lib/motion", () => ({ ...jest.requireActual("@/lib/motion"), usaCSS: true }))
 */
export const usaCSS = Platform.OS === "web";

/**
 * Deja pasar propiedades de CSS que React Native no conoce pero react-native-web sí
 * compila (`animationKeyframes`, `transitionProperty`, `clipPath`, `backdropFilter`…).
 *
 * El cast es deliberado y está acotado a este helper: así queda un único sitio que
 * documenta por qué se miente al tipo, en vez de un `as any` suelto por componente.
 * **Estos estilos no se le pasan nunca a nativo**; la rama la decide `usaCSS`.
 *
 */
export function estiloWeb(estilo: Record<string, unknown>): ViewStyle {
  return estilo as unknown as ViewStyle;
}

/** Lo mismo para un estilo de texto (`<Text>` no admite un `ViewStyle`). */
export function estiloWebTexto(estilo: Record<string, unknown>): TextStyle {
  return estilo as unknown as TextStyle;
}

/**
 * Si las animaciones de `Animated` corren de verdad. **En jest no.**
 *
 * En el entorno de test, `requestAnimationFrame` es un `setTimeout(0)`, así que cada
 * animación en vuelo pone un temporizador de cero milisegundos por fotograma. Una
 * pantalla con una lista escalonada arranca diez a la vez, y entre todas no dejan
 * respirar a la cola: `waitFor` deja de recibir su turno y los tests empiezan a fallar
 * —o a colgarse, con un bucle infinito— por reloj y no por código. Se midió: con las
 * animaciones vivas, de tres pasadas de la suite, dos traían fallos distintos.
 *
 * Con esto apagado, la rama nativa se pinta en su estado final: el componente se monta
 * igual, el efecto se ejecuta igual y el valor se fija de golpe en vez de interpolarse.
 * Lo único que no se ejercita es el paso del tiempo, que no es lo que los tests de
 * pantalla comprueban.
 *
 * En web no aplica: allí el movimiento es CSS y no pasa por JavaScript.
 */
export const animacionesEnVivo = process.env.NODE_ENV !== "test";

/** `420` → `"420ms"`. */
export function ms(valor: number): string {
  return `${valor}ms`;
}

function soporta(propiedad: string, valor: string): boolean {
  const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
  if (!css || typeof css.supports !== "function") return false;
  try {
    return css.supports(propiedad, valor);
  } catch {
    return false;
  }
}

/**
 * Si el navegador entiende `linear(...)` como curva. Es el respaldo que la hoja de
 * referencia resolvía con `@supports`; sin hoja global, se resuelve aquí.
 */
export function soportaLinear(): boolean {
  return soporta("transition-timing-function", "linear(0, 1)");
}

/** Si hay `backdrop-filter`. En nativo lo pone `expo-blur`, así que se da por bueno. */
export function soportaDesenfoque(): boolean {
  if (!usaCSS) return true;
  return soporta("backdrop-filter", "blur(1px)") || soporta("-webkit-backdrop-filter", "blur(1px)");
}

let cacheLinear: boolean | null = null;

/**
 * La curva del resorte que entienda este navegador. `linear(...)` da el rebote de
 * verdad; donde no existe, el bezier de respaldo se le parece lo suficiente.
 * Se resuelve una vez: `CSS.supports` no cambia de opinión a mitad de sesión.
 */
export function curvaResorte(): string {
  if (cacheLinear === null) cacheLinear = soportaLinear();
  return cacheLinear ? Curva.resorteLinear : Curva.resorteBezier;
}

function consultaMedia(consulta: string): MediaQueryList | null {
  const w = globalThis as { matchMedia?: (c: string) => MediaQueryList };
  if (typeof w.matchMedia !== "function") return null;
  try {
    return w.matchMedia(consulta);
  } catch {
    return null;
  }
}

export type PreferenciasMovimiento = {
  /** `prefers-reduced-motion`. Nada se mueve: se pinta el estado final. */
  movimientoReducido: boolean;
  /** `prefers-reduced-transparency`. El vidrio pasa a superficie sólida. */
  transparenciaReducida: boolean;
  /** Si no lo hay, el vidrio también pasa a superficie sólida. */
  hayDesenfoque: boolean;
};

let preferencias: PreferenciasMovimiento = {
  movimientoReducido: false,
  transparenciaReducida: false,
  hayDesenfoque: true,
};

const oyentes = new Set<() => void>();
/**
 * Lo que hay que soltar cuando ya nadie escucha. **No es opcional**: una suscripción a
 * `AccessibilityInfo` que no se quita deja un handle abierto, y en jest eso significa
 * que cada archivo de test se queda esperando al cerrar. Medido: 300 s de suite contra
 * 31 s, y fallos intermitentes por reloj en tests que no tenían nada que ver.
 */
let suscripciones: (() => void)[] = [];

function aplicar(parcial: Partial<PreferenciasMovimiento>) {
  const siguiente = { ...preferencias, ...parcial };
  const cambio = (Object.keys(siguiente) as (keyof PreferenciasMovimiento)[]).some(
    (k) => siguiente[k] !== preferencias[k],
  );
  // Solo se notifica si cambia de verdad: si no, cada lectura del sistema
  // provocaría un render de todas las superficies de vidrio de la pantalla.
  if (!cambio) return;
  preferencias = siguiente;
  oyentes.forEach((f) => f());
}

function iniciar() {
  if (suscripciones.length > 0) return;

  aplicar({ hayDesenfoque: soportaDesenfoque() });

  // Movimiento reducido. En react-native-web `AccessibilityInfo` lo saca de
  // `matchMedia('(prefers-reduced-motion: reduce)')`; en nativo, del sistema.
  try {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => aplicar({ movimientoReducido: v }))
      .catch(() => {});
    const s = AccessibilityInfo.addEventListener("reduceMotionChanged", (v: boolean) =>
      aplicar({ movimientoReducido: v }),
    );
    suscripciones.push(() => s?.remove?.());
  } catch {
    // Entorno sin accesibilidad: se queda en "no reducido".
  }

  // Transparencia reducida. No existe en react-native-web, así que en web se
  // consulta directamente y en iOS se pregunta a `AccessibilityInfo`.
  const mq = consultaMedia("(prefers-reduced-transparency: reduce)");
  if (mq) {
    aplicar({ transparenciaReducida: mq.matches });
    const alCambiar = (e: MediaQueryListEvent) => aplicar({ transparenciaReducida: e.matches });
    mq.addEventListener?.("change", alCambiar);
    suscripciones.push(() => mq.removeEventListener?.("change", alCambiar));
  } else {
    const leerTransparencia = (
      AccessibilityInfo as { isReduceTransparencyEnabled?: () => Promise<boolean> }
    ).isReduceTransparencyEnabled;
    leerTransparencia?.()
      .then((v) => aplicar({ transparenciaReducida: v }))
      .catch(() => {});
  }

  // Si el entorno no ofrecía nada a lo que suscribirse, se marca igualmente como
  // iniciado para no reintentarlo en cada montaje.
  if (suscripciones.length === 0) suscripciones.push(() => {});
}

function detener() {
  suscripciones.forEach((quitar) => quitar());
  suscripciones = [];
}

function suscribir(oyente: () => void) {
  iniciar();
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
    // El último que se va apaga la luz: nada de escuchar al sistema cuando no queda
    // ni una superficie de vidrio montada.
    if (oyentes.size === 0) detener();
  };
}

function leer() {
  return preferencias;
}

/** Las tres preferencias, ya resueltas. Es estable entre renders mientras no cambien. */
export function useMotionPreferences(): PreferenciasMovimiento {
  return useSyncExternalStore(suscribir, leer, leer);
}

/**
 * Solo para los tests: fija las preferencias a mano y da el almacén por iniciado, para
 * que la lectura del sistema no las pise justo después.
 */
export function fijarPreferencias(valor: Partial<PreferenciasMovimiento>) {
  if (suscripciones.length === 0) suscripciones.push(() => {});
  aplicar(valor);
}

/** Solo para los tests: estado inicial y vuelta a leer del sistema. */
export function reiniciarPreferencias() {
  detener();
  cacheLinear = null;
  aplicar({ movimientoReducido: false, transparenciaReducida: false, hayDesenfoque: true });
}

let contador = 0;

/**
 * Relanza una animación de entrada en un nodo que no se destruye: devuelve una clave
 * nueva cada vez que cambia `clave`, para usarla como `key` y forzar el remontaje.
 *
 * En la hoja de referencia esto era quitar la clase, forzar un reflow y volver a
 * ponerla. En React el remontaje por `key` hace lo mismo sin tocar el DOM, así que el
 * truco del reflow no hace falta; este hook solo le pone nombre al patrón.
 */
export function useRelanzar(clave: unknown): string {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave ES la dependencia
  return useMemo(() => `mv-${(contador += 1)}`, [clave]);
}
