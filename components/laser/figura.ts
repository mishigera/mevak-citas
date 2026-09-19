/**
 * El dibujo del mapa láser: la silueta, la cara y dónde cae cada área.
 *
 * Solo geometría, sin React, para poder iterarla fuera de la app. Todo son caminos SVG
 * con coordenadas absolutas y solo `M`, `L`, `C`, `Q` y `Z`: así `espejo()` puede sacar
 * el lado derecho del izquierdo cambiando solo las x.
 *
 * Las zonas no siguen la anatomía por sí mismas: son formas generosas (un rectángulo que
 * cruza las dos piernas a la altura del muslo) recortadas por la parte del cuerpo que
 * les toca. Es el recorte el que hace que "muslo" sea exactamente el muslo.
 */

export type Vista = "frente" | "espalda" | "cara";

export type Recorte = "torso" | "piernas" | "cadera" | "cara";

export type Zona = {
  /** El `svgKey` del área en el catálogo. */
  clave: string;
  vistas: Vista[];
  formas: string[];
  recorte?: Recorte;
};

/** Ancho y alto del lienzo de cada vista. */
export const LIENZO: Record<Vista, { ancho: number; alto: number }> = {
  frente: { ancho: 200, alto: 430 },
  espalda: { ancho: 200, alto: 430 },
  cara: { ancho: 220, alto: 250 },
};

// --- Ayudas ------------------------------------------------------------------

/** El mismo camino reflejado sobre el eje vertical `x = eje`. */
export function espejo(d: string, eje: number): string {
  let esX = true;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const v = esX ? String(Math.round((2 * eje - Number(n)) * 100) / 100) : n;
    esX = !esX;
    return v;
  });
}

export function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
}

/** Elipse con cuatro curvas de Bézier, no con arcos: los arcos no se pueden reflejar con `espejo`. */
export function elipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  const ox = rx * k;
  const oy = ry * k;
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    `M${r(cx - rx)} ${r(cy)}`,
    `C${r(cx - rx)} ${r(cy - oy)} ${r(cx - ox)} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)}`,
    `C${r(cx + ox)} ${r(cy - ry)} ${r(cx + rx)} ${r(cy - oy)} ${r(cx + rx)} ${r(cy)}`,
    `C${r(cx + rx)} ${r(cy + oy)} ${r(cx + ox)} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)}`,
    `C${r(cx - ox)} ${r(cy + ry)} ${r(cx - rx)} ${r(cy + oy)} ${r(cx - rx)} ${r(cy)}`,
    "Z",
  ].join(" ");
}

const par = (izquierda: string, eje: number) => [izquierda, espejo(izquierda, eje)];

// --- El cuerpo (frente y espalda comparten silueta) ---------------------------

const EJE = 100;

// El brazo y el torso comparten el borde del hombro a la axila en vez de solaparse: si
// se solapan, el contorno de uno se ve a través del otro.
const BRAZO = "M66 80 C58 82 54 94 53 110 C51 130 49 150 48 168 C46 188 44 206 44 222 L55 222 C56 206 59 188 61 168 C63 150 66 130 70 111 C68 100 67 90 66 80 Z";
const MANO = "M44 222 C41 230 40 242 43 250 C45 256 51 257 54 252 C57 245 57 232 55 222 Z";
const PIERNA = "M63 212 C60 238 61 280 69 318 C71 336 67 352 71 372 C74 386 77 394 79 400 L90 400 C90 390 91 377 91 364 C92 348 89 334 90 318 C93 290 97 262 99 238 Z";
const PIE = "M79 400 C77 407 74 414 76 419 C78 422 90 422 92 419 C93 413 92 406 90 400 Z";
const CUELLO = "M93 46 C93 56 92 64 90 72 L110 72 C108 64 107 56 107 46 Z";
/** El cuello desde debajo de la barbilla: la zona no puede pintar sobre la cabeza. */
const CUELLO_VISIBLE = "M92.6 50 C92.4 58 91.8 65 90 72 L110 72 C108.2 65 107.6 58 107.4 50 Z";
const TORSO =
  "M90 70 C84 74 73 75 66 80 C67 90 68 100 70 111 C68 126 70 142 78 164 " +
  "C73 180 64 196 63 212 L100 238 L137 212 C136 196 127 180 122 164 " +
  "C130 142 132 126 130 111 C132 100 133 90 134 80 C127 75 116 74 110 70 Z";
/**
 * La cadera por detrás como una sola forma, de la cintura a medio muslo. No sirve unir
 * torso y piernas en el recorte: comparten un borde y el suavizado deja una costura
 * visible justo en medio de los glúteos.
 */
const CADERA =
  "M78 164 C73 180 64 196 63 212 C60 236 61 250 62 262 L97 262 C98 252 98.6 244 99 238 " +
  "L101 238 C101.4 244 102 252 103 262 L138 262 C139 250 140 236 137 212 C136 196 127 180 122 164 Z";
const CABEZA = elipse(100, 32, 15, 19);
/** El moño: basta para que la figura se lea como mujer sin tapar la nuca. */
const MONO = elipse(100, 12, 8, 6.5);

/** Las partes, en el orden en que se pintan: lo de atrás primero. */
export const PARTES_CUERPO = {
  brazos: par(BRAZO, EJE),
  manos: par(MANO, EJE),
  piernas: par(PIERNA, EJE),
  pies: par(PIE, EJE),
  cuello: [CUELLO],
  torso: [TORSO],
  mono: [MONO],
  cabeza: [CABEZA],
};

export const ORDEN_PARTES_CUERPO = ["brazos", "manos", "piernas", "pies", "cuello", "torso", "mono", "cabeza"] as const;

/** Trazos de detalle, sin relleno: lo que hace que se lea como un cuerpo y no como un contorno. */
export const DETALLES: Record<"frente" | "espalda", string[]> = {
  frente: [
    "M87 22 C92 17 108 17 113 22", // nacimiento del pelo
    ...par("M86 78 Q92 82 98 79", EJE), // clavículas
    ...par("M72 122 Q80 134 94 128", EJE), // pecho
    elipse(100, 176, 1.3, 2), // ombligo
    ...par("M73 318 Q79 322 85 318", EJE), // rodillas
  ],
  espalda: [
    "M100 80 L100 196", // columna
    ...par("M78 104 Q84 118 93 116", EJE), // omóplatos
    "M100 214 L100 238", // pliegue interglúteo
    ...par("M66 252 Q82 262 97 254", EJE), // pliegue del glúteo
    ...par("M72 322 Q79 318 86 322", EJE), // corvas
  ],
};

export const RECORTES_CUERPO: Record<Exclude<Recorte, "cara">, string[]> = {
  torso: [TORSO],
  piernas: par(PIERNA, EJE),
  cadera: [CADERA],
};

// --- La cara -----------------------------------------------------------------

const EJE_CARA = 110;

const OVALO =
  "M110 26 C72 26 50 56 50 104 C50 146 58 180 78 204 C90 218 100 226 110 226 " +
  "C120 226 130 218 142 204 C162 180 170 146 170 104 C170 56 148 26 110 26 Z";
const OREJA = "M52 104 C42 98 37 108 39 122 C41 136 46 144 55 142 Z";
// El borde de arriba queda detrás de la cara (el óvalo se pinta después) y el de abajo
// fuera del lienzo: el cuello no termina, se sale.
const CUELLO_CARA = "M86 200 C86 220 84 238 82 262 L138 262 C136 238 134 220 134 200 Z";

export const PARTES_CARA = {
  cuello: [CUELLO_CARA],
  orejas: par(OREJA, EJE_CARA),
  ovalo: [OVALO],
};

export const ORDEN_PARTES_CARA = ["cuello", "orejas", "ovalo"] as const;

export const DETALLES_CARA: string[] = [
  "M56 84 C66 54 88 42 110 42 C132 42 154 54 164 84", // nacimiento del pelo
  ...par("M72 98 Q85 90 99 96", EJE_CARA), // cejas
  ...par("M76 112 Q87 104 98 112 Q87 118 76 112 Z", EJE_CARA), // ojos
  "M110 110 C109 126 106 138 103 145 Q110 150 117 145", // nariz
  "M94 172 Q102 166 110 170 Q118 166 126 172", // labio superior
  "M94 172 Q110 180 126 172", // boca
  "M98 176 Q110 186 122 176", // labio inferior
];

export const RECORTE_CARA = [OVALO];

// --- Las zonas ---------------------------------------------------------------

/**
 * Cada área del catálogo y dónde se pinta. El orden es el de pintado: una zona que va
 * después queda encima y es la que recibe el toque. Un área puede salir dos veces, con
 * una forma distinta en cada vista.
 */
export const ZONAS: Zona[] = [
  // Cuerpo
  { clave: "cuello", vistas: ["frente"], formas: [CUELLO_VISIBLE] },
  { clave: "nuca", vistas: ["espalda"], formas: [CUELLO_VISIBLE] },
  // Sin recorte: la axila es justo donde se tocan brazo y torso, y un recorte de los dos
  // dejaría la misma costura que en la cadera.
  { clave: "axila", vistas: ["frente", "espalda"], formas: par(elipse(67, 114, 5, 8), EJE) },
  { clave: "espalda", vistas: ["espalda"], formas: [rect(50, 76, 100, 88)], recorte: "torso" },
  { clave: "brazos", vistas: ["frente", "espalda"], formas: par(BRAZO, EJE) },
  { clave: "abdomen", vistas: ["frente"], formas: [rect(60, 132, 80, 70)], recorte: "torso" },
  { clave: "linea_abdomen", vistas: ["frente"], formas: [rect(98, 180, 4, 26)], recorte: "torso" },
  { clave: "espalda_baja", vistas: ["espalda"], formas: [rect(50, 166, 100, 40)], recorte: "torso" },
  { clave: "area_bikini", vistas: ["frente"], formas: [rect(60, 205, 80, 36)], recorte: "torso" },
  { clave: "gluteos", vistas: ["espalda"], formas: par(elipse(81, 232, 21, 26), EJE), recorte: "cadera" },
  { clave: "linea_interglutea", vistas: ["espalda"], formas: [rect(98, 210, 4, 30)], recorte: "cadera" },
  { clave: "manos", vistas: ["frente", "espalda"], formas: par(MANO, EJE) },
  // Por detrás el muslo empieza bajo el pliegue del glúteo, no en la ingle.
  { clave: "muslo", vistas: ["frente"], formas: [rect(40, 214, 120, 103)], recorte: "piernas" },
  { clave: "muslo", vistas: ["espalda"], formas: [rect(40, 257, 120, 60)], recorte: "piernas" },
  { clave: "media_pierna", vistas: ["frente", "espalda"], formas: [rect(40, 320, 120, 80)], recorte: "piernas" },
  { clave: "pies", vistas: ["frente", "espalda"], formas: par(PIE, EJE) },

  // Cara. `media_cara` va primero: es la más grande y las demás se pintan encima.
  { clave: "media_cara", vistas: ["cara"], formas: [rect(40, 150, 140, 80)], recorte: "cara" },
  { clave: "frente", vistas: ["cara"], formas: ["M56 84 C66 54 88 42 110 42 C132 42 154 54 164 84 L164 89 L56 89 Z"], recorte: "cara" },
  { clave: "entrecejo", vistas: ["cara"], formas: [elipse(110, 100, 7, 6)] },
  { clave: "oidos", vistas: ["cara"], formas: par(OREJA, EJE_CARA) },
  { clave: "patillas", vistas: ["cara"], formas: par(rect(51, 98, 9, 34), EJE_CARA), recorte: "cara" },
  { clave: "mejillas", vistas: ["cara"], formas: par(elipse(80, 138, 17, 19), EJE_CARA) },
  { clave: "bigote", vistas: ["cara"], formas: [elipse(110, 159, 16, 6)] },
  { clave: "menton", vistas: ["cara"], formas: [elipse(110, 204, 20, 12)], recorte: "cara" },
];

/** El orden de las fichas en cada vista: de arriba abajo, como en la figura. */
export const ORDEN_FICHAS: Record<Vista, string[]> = {
  frente: ["cuello", "axila", "brazos", "abdomen", "linea_abdomen", "manos", "area_bikini", "muslo", "media_pierna", "pies"],
  espalda: ["nuca", "axila", "espalda", "brazos", "espalda_baja", "gluteos", "linea_interglutea", "manos", "muslo", "media_pierna", "pies"],
  cara: ["frente", "entrecejo", "oidos", "patillas", "mejillas", "bigote", "media_cara", "menton"],
};

/** Las vistas en las que sale un área, o `[]` si el dibujo no la conoce. */
export function vistasDe(clave: string): Vista[] {
  // Un área puede tener una forma por vista (el muslo): se juntan todas.
  const vistas = ZONAS.filter((z) => z.clave === clave).flatMap((z) => z.vistas);
  return (["frente", "espalda", "cara"] as Vista[]).filter((v) => vistas.includes(v));
}
