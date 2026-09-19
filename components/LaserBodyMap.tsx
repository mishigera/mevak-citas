/**
 * El mapa de áreas láser: la figura para ver dónde, y fichas con el nombre para tocar.
 *
 * Antes eran tres figuras apretadas en una fila, con etiquetas de línea que se salían
 * del dibujo ("es", "frent", "bigo") y zonas de 12×8 imposibles de acertar con el dedo
 * (p006). Ahora:
 *
 * - En el teléfono se ve una vista a la vez (Frente, Espalda, Cara) a todo el ancho, y
 *   el segmentado dice cuántas áreas hay marcadas en cada una.
 * - Desde tableta, las tres lado a lado.
 * - Los nombres van en fichas bajo la figura. Tocar la ficha o la zona hace lo mismo; la
 *   ficha es el blanco fiable para las zonas chicas (entrecejo, línea de abdomen).
 *
 * El dibujo vive en `components/laser/figura.ts`.
 */
import React, { useId, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { ClipPath, Defs, Path } from "react-native-svg";
import { Colors } from "@/constants/colors";
import { GlassSegmented } from "@/components/glass";
import { PressableMotion } from "@/components/motion";
import { useBreakpoint } from "@/lib/responsive";
import {
  DETALLES,
  DETALLES_CARA,
  LIENZO,
  ORDEN_FICHAS,
  ORDEN_PARTES_CARA,
  ORDEN_PARTES_CUERPO,
  PARTES_CARA,
  PARTES_CUERPO,
  RECORTE_CARA,
  RECORTES_CUERPO,
  ZONAS,
  vistasDe,
  type Vista,
} from "@/components/laser/figura";

type LaserAreaItem = {
  id: string;
  name: string;
  svgKey: string;
  bodySide?: "front" | "back" | "both";
};

type Props = {
  areas: LaserAreaItem[];
  selectedSvgKeys: string[];
  onToggleArea?: (svgKey: string) => void;
  readOnly?: boolean;
  title?: string;
};

const VISTAS: { valor: Vista; nombre: string }[] = [
  { valor: "frente", nombre: "Frente" },
  { valor: "espalda", nombre: "Espalda" },
  { valor: "cara", nombre: "Cara" },
];

/** Alto de la figura: en el teléfono va sola y puede ser grande; en columnas, más contenida. */
const ALTO: Record<"sola" | "columna", Record<Vista, number>> = {
  sola: { frente: 400, espalda: 400, cara: 290 },
  columna: { frente: 360, espalda: 360, cara: 230 },
};

/** Las áreas que se ven en una vista, en el orden de la figura, de arriba abajo. */
function areasDeVista(areas: LaserAreaItem[], vista: Vista): LaserAreaItem[] {
  const porClave = new Map(areas.map((a) => [a.svgKey, a]));
  const enOrden = ORDEN_FICHAS[vista].map((k) => porClave.get(k)).filter(Boolean) as LaserAreaItem[];
  // Un área que el dibujo no conoce no puede quedarse sin ficha: va al frente, al final.
  if (vista === "frente") {
    enOrden.push(...areas.filter((a) => vistasDe(a.svgKey).length === 0));
  }
  return enOrden;
}

function vistaDe(svgKey: string): Vista {
  return vistasDe(svgKey)[0] ?? "frente";
}

function Figura({
  vista,
  alto,
  disponibles,
  marcadas,
  onToggle,
}: {
  vista: Vista;
  alto: number;
  disponibles: Set<string>;
  marcadas: Set<string>;
  onToggle?: (svgKey: string) => void;
}) {
  // Los `id` de los recortes son globales en la página web: con dos mapas a la vista
  // (la ficha y el paquete que se vende) no pueden repetirse.
  const prefijo = `mapa${useId().replace(/[^a-zA-Z0-9]/g, "")}${vista}`;
  const esCara = vista === "cara";
  const { ancho, alto: altoLienzo } = LIENZO[vista];

  const partes = esCara
    ? ORDEN_PARTES_CARA.flatMap((k) => PARTES_CARA[k])
    : ORDEN_PARTES_CUERPO.flatMap((k) => PARTES_CUERPO[k]);
  const detalles = esCara ? DETALLES_CARA : DETALLES[vista];
  const recortes: Record<string, string[]> = esCara ? { cara: RECORTE_CARA } : RECORTES_CUERPO;
  const zonas = ZONAS.filter((z) => z.vistas.includes(vista) && disponibles.has(z.clave));
  const editable = !!onToggle;

  return (
    <Svg width="100%" height={alto} viewBox={`0 0 ${ancho} ${altoLienzo}`} testID={`figura-${vista}`}>
      <Defs>
        {Object.entries(recortes).map(([nombre, caminos]) => (
          <ClipPath key={nombre} id={`${prefijo}-${nombre}`}>
            {caminos.map((d, i) => <Path key={i} d={d} />)}
          </ClipPath>
        ))}
      </Defs>

      {/* Cada parte con su relleno y su contorno, de atrás adelante: lo que queda
          detrás de otra parte no se ve, como el borde del cuello bajo la barbilla. */}
      {partes.map((d, i) => (
        <Path
          key={`parte-${i}`}
          d={d}
          fill={Colors.surface}
          stroke={Colors.laser.linea}
          strokeOpacity={0.7}
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      ))}

      {zonas.map((zona) => {
        const marcada = marcadas.has(zona.clave);
        const recorte = zona.recorte ? `url(#${prefijo}-${zona.recorte})` : undefined;
        return zona.formas.map((d, i) => (
          <Path
            key={`${zona.clave}-${i}`}
            testID={`zona-${zona.clave}`}
            d={d}
            clipPath={recorte}
            fill={marcada ? Colors.laser.zona : "transparent"}
            stroke={marcada ? Colors.laser.linea : editable ? Colors.primary : "none"}
            strokeOpacity={marcada ? 0.9 : 0.45}
            strokeWidth={marcada ? 1.2 : 0.8}
            strokeDasharray={marcada ? undefined : "2 2.5"}
            onPress={onToggle ? () => onToggle(zona.clave) : undefined}
          />
        ));
      })}

      {detalles.map((d, i) => (
        <Path
          key={`detalle-${i}`}
          d={d}
          fill="none"
          stroke={Colors.laser.linea}
          strokeOpacity={0.45}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

function Ficha({
  area,
  marcada,
  onPress,
}: {
  area: LaserAreaItem;
  marcada: boolean;
  onPress?: () => void;
}) {
  if (!onPress) {
    return (
      <View style={[styles.ficha, styles.fichaMarcada]}>
        <Text style={[styles.fichaTexto, styles.fichaTextoMarcada]}>{area.name}</Text>
      </View>
    );
  }
  return (
    <PressableMotion
      gesto="sutil"
      accessibilityLabel={area.name}
      accessibilityState={{ selected: marcada }}
      style={[styles.ficha, marcada && styles.fichaMarcada]}
      onPress={onPress}
    >
      <Text style={[styles.fichaTexto, marcada && styles.fichaTextoMarcada]}>{area.name}</Text>
    </PressableMotion>
  );
}

export function LaserBodyMap({ areas, selectedSvgKeys, onToggleArea, readOnly = false, title = "Monito de áreas" }: Props) {
  const { isCompact } = useBreakpoint();
  const editable = !readOnly && !!onToggleArea;
  const onToggle = editable ? onToggleArea : undefined;

  const disponibles = useMemo(() => new Set(areas.map((a) => a.svgKey)), [areas]);
  const marcadas = useMemo(
    () => new Set(selectedSvgKeys.filter((k) => disponibles.has(k))),
    [selectedSvgKeys, disponibles],
  );

  // Se abre en la primera vista que tenga algo marcado: en la cita de una clienta de
  // cara, lo que importa es la cara.
  const [vista, setVista] = useState<Vista>(() => {
    const primera = selectedSvgKeys.find((k) => disponibles.has(k));
    return primera ? vistaDe(primera) : "frente";
  });

  const cuantasEn = (v: Vista) => areasDeVista(areas, v).filter((a) => marcadas.has(a.svgKey)).length;

  // En solo lectura las fichas son las áreas marcadas, en el orden en que llegan.
  const porClave = new Map(areas.map((a) => [a.svgKey, a]));
  const marcadasEnOrden = selectedSvgKeys
    .filter((k, i) => marcadas.has(k) && selectedSvgKeys.indexOf(k) === i)
    .map((k) => porClave.get(k)!);

  const fichasDe = (v: Vista) =>
    areasDeVista(areas, v).map((area) => (
      <Ficha
        key={area.id}
        area={area}
        marcada={marcadas.has(area.svgKey)}
        onPress={() => onToggle?.(area.svgKey)}
      />
    ));

  const total = marcadas.size;

  return (
    <View style={styles.wrapper}>
      <View style={styles.cabecera}>
        <Text style={styles.title}>{title}</Text>
        {total > 0 && <Text style={styles.cuenta}>{total === 1 ? "1 área" : `${total} áreas`}</Text>}
      </View>
      {editable && <Text style={styles.hint}>Toca una zona del dibujo o su nombre para marcarla.</Text>}

      {isCompact ? (
        <>
          <GlassSegmented
            options={VISTAS.map((v) => {
              const n = cuantasEn(v.valor);
              return { value: v.valor, label: n ? `${v.nombre} (${n})` : v.nombre };
            })}
            value={vista}
            onChange={setVista}
            testID="vistas-mapa"
          />
          <View style={styles.lienzo}>
            <Figura
              vista={vista}
              alto={ALTO.sola[vista]}
              disponibles={disponibles}
              marcadas={marcadas}
              onToggle={onToggle}
            />
          </View>
          {editable && <View style={styles.fichas}>{fichasDe(vista)}</View>}
        </>
      ) : (
        <View style={styles.columnas}>
          {VISTAS.map((v) => (
            <View key={v.valor} style={styles.columna}>
              <Text style={styles.columnaTitulo}>
                {v.nombre}
                {cuantasEn(v.valor) > 0 && <Text style={styles.columnaCuenta}>{`  ${cuantasEn(v.valor)}`}</Text>}
              </Text>
              <View style={styles.lienzo}>
                <Figura
                  vista={v.valor}
                  alto={ALTO.columna[v.valor]}
                  disponibles={disponibles}
                  marcadas={marcadas}
                  onToggle={onToggle}
                />
              </View>
              {editable && <View style={styles.fichas}>{fichasDe(v.valor)}</View>}
            </View>
          ))}
        </View>
      )}

      {!editable && (
        marcadasEnOrden.length ? (
          <View style={styles.fichas}>
            {marcadasEnOrden.map((area) => <Ficha key={area.id} area={area} marcada />)}
          </View>
        ) : (
          <Text style={styles.vacio}>Sin áreas seleccionadas</Text>
        )
      )}
      {editable && total === 0 && <Text style={styles.vacio}>Sin áreas seleccionadas</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    color: Colors.text,
    flexShrink: 1,
  },
  cuenta: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: Colors.primaryDark,
  },
  hint: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  lienzo: {
    paddingVertical: 8,
    alignItems: "center",
  },
  columnas: {
    flexDirection: "row",
    gap: 16,
  },
  columna: {
    flex: 1,
    gap: 6,
  },
  columnaTitulo: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  columnaCuenta: {
    color: Colors.primaryDark,
  },
  fichas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ficha: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.glass.fillStrong,
  },
  fichaMarcada: {
    backgroundColor: Colors.laser.zona,
    borderColor: Colors.primary,
  },
  fichaTexto: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  fichaTextoMarcada: {
    color: Colors.primaryDark,
  },
  vacio: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});
