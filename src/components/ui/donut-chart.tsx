import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export interface DonutSegment {
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  trackColor: string;
  children?: React.ReactNode;
  /** When provided, each ring segment becomes tappable (index into `segments`). */
  onPressSegment?: (index: number) => void;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Segmented ring chart with a content slot in the middle. */
export function DonutChart({
  segments,
  size = 190,
  strokeWidth = 22,
  trackColor,
  children,
  onPressSegment,
}: DonutChartProps) {
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const gapDeg = segments.length > 1 ? 2.5 : 0;

  let cursor = 0;
  const arcs = total > 0
    ? segments.map((seg, i) => {
        if (seg.value <= 0) return null;
        const sweep = (seg.value / total) * 360;
        const start = cursor + gapDeg / 2;
        const end = cursor + Math.max(sweep - gapDeg / 2, 0.5);
        cursor += sweep;
        return (
          <Path
            key={i}
            d={arcPath(c, c, r, start, Math.min(end, 359.9))}
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            onPress={onPressSegment ? () => onPressSegment(i) : undefined}
          />
        );
      })
    : null;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {arcs}
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
