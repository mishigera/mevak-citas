/**
 * Lo que no es color: radios, desenfoques, espaciado y alturas del chrome.
 *
 * El color vive en `constants/colors.ts` y solo ahi (convencion del repo). Aqui se
 * importa unicamente para la sombra, que necesita un color para existir.
 */
import { Colors } from "@/constants/colors";

/**
 * Radios generosos, al estilo de las referencias de iOS: los controles son
 * pildoras completas y los paneles casi lo parecen.
 */
export const Radius = {
  control: 999,
  tile: 18,
  card: 22,
  panel: 28,
  bar: 30,
} as const;

/**
 * Intensidad del desenfoque que se le pasa a `BlurView`. En web se traduce a
 * `backdrop-filter: blur(intensidad * 0.2 px)`, así que 80 son 16 px de desenfoque.
 */
export const Blur = {
  bar: 80,
  panel: 60,
  card: 40,
  control: 70,
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Alturas del chrome flotante. El contenido se desplaza por debajo, así que estos
 * números son también el padding que necesita cada scroll.
 * Sustituyen al 67 mágico que repetian las cuatro pestañas.
 */
export const Chrome = {
  headerCompact: 60,
  headerExpanded: 72,
  /** Alto de la píldora flotante de pestañas, sin contar su separacion del borde. */
  tabBar: 64,
  /** Separacion de la píldora respecto al borde inferior. */
  tabBarInset: 14,
  /** Ancho del riel vertical en iPad apaisado. */
  railWidth: 92,
  railInset: 16,
} as const;

/**
 * Opacidad de las manchas del fondo. En SVG la opacidad va aparte del color
 * (`stopOpacity`), por eso no esta en `colors.ts`.
 * Son deliberadamente bajas: el fondo tiene que dar color al vidrio, no competir
 * con el contenido.
 */
export const AmbientOpacity = {
  primary: 0.3,
  secondary: 0.22,
  accent: 0.18,
} as const;

/** Sombra rosada, ancha y muy suave: levanta el vidrio sin ensuciarlo. */
export const GlassShadow = {
  shadowColor: Colors.glass.shadow,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.1,
  shadowRadius: 24,
  elevation: 6,
} as const;

/** Sombra corta para elementos pequeños (botones circulares, pulgar del segmentado). */
export const GlassShadowSoft = {
  shadowColor: Colors.glass.shadow,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.12,
  shadowRadius: 10,
  elevation: 3,
} as const;
