const PRIMARY = "#c18297";
const PRIMARY_DARK = "#8C5468";
const PRIMARY_LIGHT = "#EDD5DC";
const SECONDARY = "#8E7FA0";
const ACCENT = "#D4956A";
const BACKGROUND = "#FFFFFF";
const SURFACE = "#FFFFFF";
const SURFACE_2 = "#FFFFFF";
const TEXT = "#2C1F1F";
const TEXT_SECONDARY = "#7A6464";
const TEXT_MUTED = "#B8A6A6";
const BORDER = "#E8D8D0";
const SUCCESS = "#5BAD8F";
const WARNING = "#D4875A";
const ERROR = "#C95C5C";
const SCHEDULED = "#7B9FDE";
const ARRIVED = "#5BAD8F";
const NO_SHOW = "#C95C5C";
const DONE = "#B8A6A6";
const CANCELLED = "#C95C5C";

// --- Vidrio -----------------------------------------------------------------
// Rellenos translúcidos, no opacos: el panel toma el color de lo que tiene detrás.
// Los rgba salen de los hex de marca de arriba (193,130,151 = PRIMARY).
const GLASS_FILL = "rgba(255,255,255,0.55)";
const GLASS_FILL_STRONG = "rgba(255,255,255,0.72)";
const GLASS_FILL_SOFT = "rgba(255,255,255,0.40)";
const GLASS_FILL_PINK = "rgba(193,130,151,0.16)";
const GLASS_FILL_PINK_STRONG = "rgba(193,130,151,0.30)";
// El filo claro del borde superior: el reflejo especular que hace que se lea como vidrio.
const GLASS_STROKE = "rgba(255,255,255,0.70)";
const GLASS_STROKE_SOFT = "rgba(193,130,151,0.18)";
// Rellenos opacos de respaldo: cuando el navegador no tiene `backdrop-filter` o el
// usuario pide menos transparencia, el vidrio deja de serlo y pasa a superficie sólida.
const GLASS_FILL_SOLID = "rgba(251,243,246,0.98)";
const GLASS_FILL_SOLID_STRONG = "rgba(253,249,250,0.99)";
// Y el estado activo, que sin translucidez tiene que seguir leyéndose como activo.
const GLASS_FILL_PINK_SOLID = "#F4E6EB";
const GLASS_FILL_PINK_SOLID_STRONG = PRIMARY_LIGHT;
// La sombra como cadena de CSS, para el `box-shadow` que transiciona en hover.
// Son los mismos 140,84,104 de PRIMARY_DARK.
const GLASS_SHADOW_CSS = "rgba(140,84,104,0.16)";
const GLASS_SHADOW_CSS_STRONG = "rgba(140,84,104,0.26)";
// Esqueleto de carga: barrido claro sobre un gris rosado muy tenue.
const SKELETON_BASE = "rgba(140,84,104,0.07)";
const SKELETON_SHINE = "rgba(140,84,104,0.16)";

// --- Mapa láser ------------------------------------------------------------
// Una zona marcada es PRIMARY al 55% sobre blanco, pero opaca: con alfa, dos zonas que
// se tocan (glúteos y muslo) se ven más oscuras donde se solapan.
const LASER_ZONA = "#DDBAC6";
const LASER_LINEA = PRIMARY_DARK;

// --- Fondo ambiental --------------------------------------------------------
// Sin esto el vidrio no tiene nada que refractar y un panel translúcido sobre
// blanco es indistinguible de un panel blanco.
const AMBIENT_TOP = "#FFFFFF";
const AMBIENT_MID = "#FDF6F8";
const AMBIENT_BOTTOM = "#F7EAF0";
const AMBIENT_BLOB_PRIMARY = PRIMARY;
const AMBIENT_BLOB_SECONDARY = SECONDARY;
const AMBIENT_BLOB_ACCENT = ACCENT;

export const Colors = {
  primary: PRIMARY,
  primaryDark: PRIMARY_DARK,
  primaryLight: PRIMARY_LIGHT,
  secondary: SECONDARY,
  accent: ACCENT,
  background: BACKGROUND,
  surface: SURFACE,
  surface2: SURFACE_2,
  text: TEXT,
  textSecondary: TEXT_SECONDARY,
  textMuted: TEXT_MUTED,
  border: BORDER,
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
  statusColors: {
    SCHEDULED: SCHEDULED,
    ARRIVED: ARRIVED,
    NO_SHOW: NO_SHOW,
    DONE: DONE,
    CANCELLED: CANCELLED,
  },
  glass: {
    fill: GLASS_FILL,
    fillStrong: GLASS_FILL_STRONG,
    fillSoft: GLASS_FILL_SOFT,
    fillPink: GLASS_FILL_PINK,
    fillPinkStrong: GLASS_FILL_PINK_STRONG,
    stroke: GLASS_STROKE,
    strokeSoft: GLASS_STROKE_SOFT,
    shadow: PRIMARY_DARK,
    fillSolid: GLASS_FILL_SOLID,
    fillSolidStrong: GLASS_FILL_SOLID_STRONG,
    fillPinkSolid: GLASS_FILL_PINK_SOLID,
    fillPinkSolidStrong: GLASS_FILL_PINK_SOLID_STRONG,
    shadowCss: GLASS_SHADOW_CSS,
    shadowCssStrong: GLASS_SHADOW_CSS_STRONG,
    skeleton: SKELETON_BASE,
    skeletonShine: SKELETON_SHINE,
  },
  laser: {
    zona: LASER_ZONA,
    linea: LASER_LINEA,
  },
  ambient: {
    top: AMBIENT_TOP,
    mid: AMBIENT_MID,
    bottom: AMBIENT_BOTTOM,
    blobPrimary: AMBIENT_BLOB_PRIMARY,
    blobSecondary: AMBIENT_BLOB_SECONDARY,
    blobAccent: AMBIENT_BLOB_ACCENT,
    transparent: "rgba(255,255,255,0)",
  },
  light: {
    tint: PRIMARY,
    tabIconDefault: TEXT_MUTED,
    tabIconSelected: PRIMARY,
  },
};

export default Colors;
