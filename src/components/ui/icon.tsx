import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'chart'
  | 'target'
  | 'wallet'
  | 'plus'
  | 'search'
  | 'trash'
  | 'close'
  | 'chevron-right'
  | 'chevron-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'spark'
  | 'check';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Minimal hand-rolled stroke icon set, 24x24 viewBox. */
export function Icon({ name, size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path {...p} d="M4 10.5 12 3.5 20 10.5" />
          <Path {...p} d="M6 9.5 V20 H18 V9.5" />
          <Path {...p} d="M10 20 V14.5 H14 V20" />
        </>
      )}
      {name === 'chart' && (
        <>
          <Path {...p} d="M4 20 V13" />
          <Path {...p} d="M10 20 V8" />
          <Path {...p} d="M16 20 V11" />
          <Path {...p} d="M22 20 V5" />
        </>
      )}
      {name === 'target' && (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Circle {...p} cx={12} cy={12} r={5} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect {...p} x={3} y={6} width={18} height={14} rx={3} />
          <Path {...p} d="M3 10 H21" />
          <Circle cx={17} cy={15} r={1.4} fill={color} />
        </>
      )}
      {name === 'plus' && (
        <>
          <Line {...p} x1={12} y1={5} x2={12} y2={19} />
          <Line {...p} x1={5} y1={12} x2={19} y2={12} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...p} cx={11} cy={11} r={7} />
          <Line {...p} x1={20} y1={20} x2={16} y2={16} />
        </>
      )}
      {name === 'trash' && (
        <>
          <Path {...p} d="M4 7 H20" />
          <Path {...p} d="M9 7 V5 a1.5 1.5 0 0 1 1.5 -1.5 h3 A1.5 1.5 0 0 1 15 5 V7" />
          <Path {...p} d="M6.5 7 L7.5 20 H16.5 L17.5 7" />
          <Line {...p} x1={10} y1={11} x2={10} y2={16} />
          <Line {...p} x1={14} y1={11} x2={14} y2={16} />
        </>
      )}
      {name === 'close' && (
        <>
          <Line {...p} x1={6} y1={6} x2={18} y2={18} />
          <Line {...p} x1={18} y1={6} x2={6} y2={18} />
        </>
      )}
      {name === 'chevron-right' && <Path {...p} d="M9 5 L16 12 L9 19" />}
      {name === 'chevron-left' && <Path {...p} d="M15 5 L8 12 L15 19" />}
      {name === 'arrow-up' && (
        <>
          <Line {...p} x1={12} y1={19} x2={12} y2={6} />
          <Path {...p} d="M6.5 11 L12 5.5 L17.5 11" />
        </>
      )}
      {name === 'arrow-down' && (
        <>
          <Line {...p} x1={12} y1={5} x2={12} y2={18} />
          <Path {...p} d="M6.5 13 L12 18.5 L17.5 13" />
        </>
      )}
      {name === 'spark' && (
        <>
          <Path {...p} d="M12 3 L13.8 9.2 L20 11 L13.8 12.8 L12 19 L10.2 12.8 L4 11 L10.2 9.2 Z" />
          <Circle cx={19} cy={4.5} r={1.2} fill={color} />
        </>
      )}
      {name === 'check' && <Path {...p} d="M5 12.5 L10 17.5 L19 7" />}
    </Svg>
  );
}
