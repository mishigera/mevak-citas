import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Ellipse, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Colors } from "@/constants/colors";

type LaserAreaItem = {
  id: string;
  name: string;
  svgKey: string;
  bodySide: "front" | "back" | "both";
};

type ZoneDef = {
  keys: string[];
  panel: "body" | "face";
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
};

type Props = {
  areas: LaserAreaItem[];
  selectedSvgKeys: string[];
  onToggleArea?: (svgKey: string) => void;
  readOnly?: boolean;
  title?: string;
};

const ZONES: ZoneDef[] = [
  { keys: ["cuello"], panel: "body", shape: "rect", x: 78, y: 66, width: 24, height: 8, rx: 3 },
  { keys: ["nuca"], panel: "body", shape: "rect", x: 248, y: 66, width: 24, height: 8, rx: 3 },
  { keys: ["axila", "axilas"], panel: "body", shape: "rect", x: 50, y: 123, width: 13, height: 15, rx: 4 },
  { keys: ["axila", "axilas"], panel: "body", shape: "rect", x: 117, y: 123, width: 13, height: 15, rx: 4 },
  { keys: ["brazos"], panel: "body", shape: "rect", x: 37, y: 138, width: 12, height: 88, rx: 6 },
  { keys: ["brazos"], panel: "body", shape: "rect", x: 131, y: 138, width: 12, height: 88, rx: 6 },
  { keys: ["abdomen"], panel: "body", shape: "rect", x: 71, y: 145, width: 38, height: 56, rx: 8 },
  { keys: ["linea_abdomen"], panel: "body", shape: "rect", x: 88, y: 145, width: 4, height: 56, rx: 2 },
  { keys: ["manos"], panel: "body", shape: "ellipse", x: 40, y: 228, width: 12, height: 18 },
  { keys: ["manos"], panel: "body", shape: "ellipse", x: 140, y: 228, width: 12, height: 18 },
  { keys: ["muslo", "piernas_completas"], panel: "body", shape: "rect", x: 64, y: 236, width: 20, height: 92, rx: 10 },
  { keys: ["muslo", "piernas_completas"], panel: "body", shape: "rect", x: 96, y: 236, width: 20, height: 92, rx: 10 },
  { keys: ["area_bikini", "bikini_clasico", "bikini_completo"], panel: "body", shape: "ellipse", x: 90, y: 218, width: 42, height: 16 },
  { keys: ["media_pierna", "medias_piernas"], panel: "body", shape: "rect", x: 66, y: 288, width: 14, height: 64, rx: 8 },
  { keys: ["media_pierna", "medias_piernas"], panel: "body", shape: "rect", x: 100, y: 288, width: 14, height: 64, rx: 8 },
  { keys: ["pies"], panel: "body", shape: "ellipse", x: 70, y: 364, width: 18, height: 10 },
  { keys: ["pies"], panel: "body", shape: "ellipse", x: 110, y: 364, width: 18, height: 10 },
  { keys: ["espalda", "espalda_completa"], panel: "body", shape: "rect", x: 236, y: 98, width: 48, height: 74, rx: 10 },
  { keys: ["espalda_baja", "espalda_alta"], panel: "body", shape: "rect", x: 239, y: 176, width: 42, height: 34, rx: 8 },
  { keys: ["linea_interglutea"], panel: "body", shape: "rect", x: 258, y: 211, width: 4, height: 24, rx: 2 },
  { keys: ["gluteos"], panel: "body", shape: "ellipse", x: 260, y: 228, width: 62, height: 30 },
  { keys: ["frente"], panel: "face", shape: "ellipse", x: 130, y: 92, width: 76, height: 28 },
  { keys: ["entrecejo"], panel: "face", shape: "rect", x: 124, y: 123, width: 12, height: 8, rx: 4 },
  { keys: ["mejillas"], panel: "face", shape: "ellipse", x: 95, y: 172, width: 30, height: 40 },
  { keys: ["mejillas"], panel: "face", shape: "ellipse", x: 165, y: 172, width: 30, height: 40 },
  { keys: ["media_cara"], panel: "face", shape: "ellipse", x: 130, y: 195, width: 56, height: 32 },
  { keys: ["menton"], panel: "face", shape: "ellipse", x: 130, y: 231, width: 38, height: 20 },
  { keys: ["oidos"], panel: "face", shape: "ellipse", x: 70, y: 153, width: 12, height: 26 },
  { keys: ["oidos"], panel: "face", shape: "ellipse", x: 190, y: 153, width: 12, height: 26 },
  { keys: ["patillas"], panel: "face", shape: "rect", x: 79, y: 152, width: 8, height: 30, rx: 4 },
  { keys: ["patillas"], panel: "face", shape: "rect", x: 173, y: 152, width: 8, height: 30, rx: 4 },
  { keys: ["bigote", "labio_superior"], panel: "face", shape: "ellipse", x: 130, y: 177, width: 34, height: 10 },
];

function isZoneSelected(zone: ZoneDef, selectedSvgKeys: string[]) {
  return zone.keys.some((key) => selectedSvgKeys.includes(key));
}

function getActiveZoneKey(zone: ZoneDef, availableKeys: Set<string>) {
  return zone.keys.find((key) => availableKeys.has(key)) || zone.keys[0];
}

function zoneEnabled(zone: ZoneDef, availableKeys: Set<string>) {
  return zone.keys.some((key) => availableKeys.has(key));
}

function getPaint(selected: boolean, enabled: boolean) {
  if (!enabled) {
    return {
      fill: "transparent",
      stroke: Colors.border + "55",
      strokeWidth: 0.9,
    };
  }
  return {
    fill: selected ? Colors.secondary + "88" : "transparent",
    stroke: selected ? Colors.secondary : Colors.border,
    strokeWidth: selected ? 2.2 : 1.1,
  };
}

function FemaleSilhouette({ centerX, side }: { centerX: number; side: "front" | "back" }) {
  const skinFill = Colors.surface;
  return (
    <>
      <Circle cx={centerX} cy="42" r="24" fill={skinFill} stroke={Colors.text} strokeWidth="1.5" />
      <Path
        d={`M${centerX - 30} 74 C${centerX - 42} 98 ${centerX - 37} 122 ${centerX - 30} 136 C${centerX - 27} 168 ${centerX - 32} 196 ${centerX - 20} 210 C${centerX - 16} 216 ${centerX - 10} 220 ${centerX - 6} 222 L${centerX - 6} 236 L${centerX - 16} 236 L${centerX - 16} 356 L${centerX - 6} 356 L${centerX - 2} 236 L${centerX + 2} 236 L${centerX + 6} 356 L${centerX + 16} 356 L${centerX + 16} 236 L${centerX + 6} 236 L${centerX + 6} 222 C${centerX + 10} 220 ${centerX + 16} 216 ${centerX + 20} 210 C${centerX + 32} 196 ${centerX + 27} 168 ${centerX + 30} 136 C${centerX + 37} 122 ${centerX + 42} 98 ${centerX + 30} 74 Z`}
        fill={skinFill}
        stroke={Colors.text}
        strokeWidth="1.5"
      />
      {side === "back" && <Line x1={centerX} y1="102" x2={centerX} y2="210" stroke={Colors.textMuted} strokeWidth="1" />}
    </>
  );
}

function BodySvg({
  availableKeys,
  selectedSvgKeys,
  onToggleArea,
  readOnly,
}: {
  availableKeys: Set<string>;
  selectedSvgKeys: string[];
  onToggleArea?: (svgKey: string) => void;
  readOnly: boolean;
}) {
  return (
    <View style={styles.bodyCol}>
      <Svg width="100%" height={390} viewBox="0 0 350 390">
        <FemaleSilhouette centerX={90} side="front" />
        <FemaleSilhouette centerX={260} side="back" />

        {ZONES.filter((z) => z.panel === "body").map((zone, index) => {
          const enabled = zoneEnabled(zone, availableKeys);
          const selected = isZoneSelected(zone, selectedSvgKeys);
          const paint = getPaint(selected, enabled);
          const keyToToggle = getActiveZoneKey(zone, availableKeys);
          const onPress = readOnly || !onToggleArea || !enabled ? undefined : () => onToggleArea(keyToToggle);

          if (zone.shape === "rect") {
            return (
              <Rect
                key={`${zone.keys.join("_")}-${index}`}
                id={keyToToggle}
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={zone.rx || 0}
                fill={paint.fill}
                stroke={paint.stroke}
                strokeWidth={paint.strokeWidth}
                onPress={onPress}
              />
            );
          }

          return (
            <Ellipse
              key={`${zone.keys.join("_")}-${index}`}
              id={keyToToggle}
              cx={zone.x}
              cy={zone.y}
              rx={zone.width / 2}
              ry={zone.height / 2}
              fill={paint.fill}
              stroke={paint.stroke}
              strokeWidth={paint.strokeWidth}
              onPress={onPress}
            />
          );
        })}

        <Line x1="48" y1="70" x2="18" y2="70" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="6" y="73" fontSize="12" fill={Colors.textSecondary}>cuello</SvgText>
        <Line x1="118" y1="130" x2="156" y2="130" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="160" y="133" fontSize="12" fill={Colors.textSecondary}>axila</SvgText>
        <Line x1="49" y1="162" x2="5" y2="162" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="2" y="166" fontSize="12" fill={Colors.textSecondary}>brazos</SvgText>
        <Line x1="73" y1="173" x2="8" y2="198" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="2" y="202" fontSize="12" fill={Colors.textSecondary}>abdomen</SvgText>
        <Line x1="44" y1="227" x2="6" y2="238" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="2" y="242" fontSize="12" fill={Colors.textSecondary}>manos</SvgText>
        <Line x1="63" y1="268" x2="12" y2="286" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="2" y="290" fontSize="12" fill={Colors.textSecondary}>muslo</SvgText>
        <Line x1="108" y1="218" x2="156" y2="260" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="160" y="265" fontSize="12" fill={Colors.textSecondary}>área bikini</SvgText>
        <Line x1="114" y1="322" x2="158" y2="322" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="160" y="325" fontSize="12" fill={Colors.textSecondary}>media pierna</SvgText>
        <Line x1="70" y1="364" x2="18" y2="364" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="2" y="368" fontSize="12" fill={Colors.textSecondary}>pies</SvgText>
        <Line x1="272" y1="70" x2="304" y2="70" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="308" y="73" fontSize="12" fill={Colors.textSecondary}>nuca</SvgText>
        <Line x1="281" y1="135" x2="336" y2="135" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="340" y="138" fontSize="12" fill={Colors.textSecondary}>espalda</SvgText>
        <Line x1="281" y1="186" x2="336" y2="186" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="340" y="189" fontSize="12" fill={Colors.textSecondary}>espalda baja</SvgText>
        <Line x1="261" y1="222" x2="336" y2="222" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="340" y="225" fontSize="12" fill={Colors.textSecondary}>lír</SvgText>
        <Line x1="290" y1="228" x2="336" y2="248" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="340" y="252" fontSize="12" fill={Colors.textSecondary}>gl</SvgText>
      </Svg>
    </View>
  );
}

function FaceSvg({
  availableKeys,
  selectedSvgKeys,
  onToggleArea,
  readOnly,
}: {
  availableKeys: Set<string>;
  selectedSvgKeys: string[];
  onToggleArea?: (svgKey: string) => void;
  readOnly: boolean;
}) {
  return (
    <View style={styles.faceCol}>
      <Svg width="100%" height={390} viewBox="0 0 260 390">
        <Path d="M130 40 C84 40 58 70 58 120 L58 180 C58 234 92 278 130 278 C168 278 202 234 202 180 L202 120 C202 70 176 40 130 40 Z" fill={Colors.surface} stroke={Colors.text} strokeWidth="1.6" />
        <Path d="M89 74 C98 60 114 52 130 52 C146 52 162 60 171 74" fill="none" stroke={Colors.textMuted} strokeWidth="1" />
        <Path d="M101 140 C110 134 120 132 130 132 C140 132 150 134 159 140" fill="none" stroke={Colors.text} strokeWidth="1.4" />
        <Path d="M130 146 C128 160 126 175 130 188" fill="none" stroke={Colors.text} strokeWidth="1.4" />
        <Path d="M110 202 C122 214 138 214 150 202" fill="none" stroke={Colors.text} strokeWidth="1.4" />

        {ZONES.filter((z) => z.panel === "face").map((zone, index) => {
          const enabled = zoneEnabled(zone, availableKeys);
          const selected = isZoneSelected(zone, selectedSvgKeys);
          const paint = getPaint(selected, enabled);
          const keyToToggle = getActiveZoneKey(zone, availableKeys);
          const onPress = readOnly || !onToggleArea || !enabled ? undefined : () => onToggleArea(keyToToggle);

          if (zone.shape === "rect") {
            return (
              <Rect
                key={`${zone.keys.join("_")}-${index}`}
                id={keyToToggle}
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx={zone.rx || 0}
                fill={paint.fill}
                stroke={paint.stroke}
                strokeWidth={paint.strokeWidth}
                onPress={onPress}
              />
            );
          }

          return (
            <Ellipse
              key={`${zone.keys.join("_")}-${index}`}
              id={keyToToggle}
              cx={zone.x}
              cy={zone.y}
              rx={zone.width / 2}
              ry={zone.height / 2}
              fill={paint.fill}
              stroke={paint.stroke}
              strokeWidth={paint.strokeWidth}
              onPress={onPress}
            />
          );
        })}

        <Line x1="124" y1="125" x2="24" y2="125" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="4" y="128" fontSize="12" fill={Colors.textSecondary}>entrecejo</SvgText>
        <Line x1="95" y1="172" x2="24" y2="172" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="4" y="176" fontSize="12" fill={Colors.textSecondary}>mejillas</SvgText>
        <Line x1="116" y1="196" x2="24" y2="196" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="4" y="200" fontSize="12" fill={Colors.textSecondary}>media cara</SvgText>
        <Line x1="128" y1="232" x2="24" y2="232" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="4" y="236" fontSize="12" fill={Colors.textSecondary}>mentón</SvgText>
        <Line x1="158" y1="92" x2="236" y2="92" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="238" y="95" fontSize="12" fill={Colors.textSecondary}>frent</SvgText>
        <Line x1="188" y1="153" x2="236" y2="153" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="238" y="156" fontSize="12" fill={Colors.textSecondary}>oído</SvgText>
        <Line x1="181" y1="167" x2="236" y2="167" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="238" y="170" fontSize="12" fill={Colors.textSecondary}>pati</SvgText>
        <Line x1="147" y1="177" x2="236" y2="177" stroke={Colors.textMuted} strokeWidth="1" />
        <SvgText x="238" y="180" fontSize="12" fill={Colors.textSecondary}>bigo</SvgText>
      </Svg>
    </View>
  );
}

export function LaserBodyMap({ areas, selectedSvgKeys, onToggleArea, readOnly = false, title = "Monito de áreas" }: Props) {
  const availableKeys = useMemo(() => new Set(areas.map((area) => area.svgKey)), [areas]);

  const selectedNames = useMemo(() => {
    const byKey = new Map(areas.map((area) => [area.svgKey, area.name]));
    return selectedSvgKeys.map((key) => byKey.get(key)).filter(Boolean) as string[];
  }, [areas, selectedSvgKeys]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      {!readOnly && <Text style={styles.hint}>Toca un área para seleccionar o quitar.</Text>}

      <View style={styles.mapRow}>
        <BodySvg
          availableKeys={availableKeys}
          selectedSvgKeys={selectedSvgKeys}
          onToggleArea={onToggleArea}
          readOnly={readOnly}
        />
        <FaceSvg
          availableKeys={availableKeys}
          selectedSvgKeys={selectedSvgKeys}
          onToggleArea={onToggleArea}
          readOnly={readOnly}
        />
      </View>

      <Text style={styles.selectedText}>
        {selectedNames.length ? `Seleccionadas: ${selectedNames.join(", ")}` : "Sin áreas seleccionadas"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  title: {
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  hint: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  mapRow: {
    flexDirection: "row",
    gap: 10,
  },
  bodyCol: {
    flex: 2.2,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 6,
  },
  faceCol: {
    flex: 1.2,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 6,
  },
  selectedText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
