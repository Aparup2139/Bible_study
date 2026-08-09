import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'book' | 'video' | 'chat' | 'mic' | 'micOff' | 'plus' | 'church' | 'search' | 'eye'
  | 'play' | 'pause' | 'x' | 'back' | 'chevronDown' | 'chevronRight' | 'check' | 'star'
  | 'sun' | 'moon' | 'music' | 'cross' | 'sunrise' | 'camera' | 'pen' | 'film'
  | 'arrowRight' | 'send';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Thin line icons — 24×24 viewBox, stroke-based (matches the elegant design language). */
export function Icon({ name, size = 24, color = '#D3D5DA', strokeWidth = 1.5 }: Props) {
  const s = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  const wrap = (children: React.ReactNode) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">{children}</Svg>
  );

  switch (name) {
    case 'book':
      return wrap(<>
        <Path {...s} d="M12 6c-1.9-1.6-4.4-2-6.8-2v13.4c2.4 0 4.9.4 6.8 2 1.9-1.6 4.4-2 6.8-2V4c-2.4 0-4.9.4-6.8 2z" />
        <Path {...s} d="M12 6v13.4" />
      </>);
    case 'video':
      return wrap(<>
        <Rect {...s} x={2.5} y={7} width={13} height={10.5} rx={2.4} />
        <Path {...s} d="M15.5 10.8l6-3v9l-6-3" />
      </>);
    case 'chat':
      return wrap(<Path {...s} d="M21 11.6a8.4 8.4 0 0 1-8.5 8.3H4l2-3.2a8.4 8.4 0 1 1 15-5.1z" />);
    case 'mic':
      return wrap(<>
        <Rect {...s} x={9.2} y={2.8} width={5.6} height={11.2} rx={2.8} />
        <Path {...s} d="M5.5 11.2a6.5 6.5 0 0 0 13 0" />
        <Path {...s} d="M12 17.7v3.5" />
      </>);
    case 'micOff':
      return wrap(<>
        <Rect {...s} x={9.2} y={2.8} width={5.6} height={11.2} rx={2.8} />
        <Path {...s} d="M5.5 11.2a6.5 6.5 0 0 0 13 0" />
        <Path {...s} d="M12 17.7v3.5" />
        <Path {...s} d="M4.5 4.5l15 15" />
      </>);
    case 'plus':
      return wrap(<>
        <Path {...s} d="M12 5.5v13" />
        <Path {...s} d="M5.5 12h13" />
      </>);
    case 'church':
      return wrap(<>
        <Path {...s} d="M12 2.6v4.2" />
        <Path {...s} d="M9.9 4.7h4.2" />
        <Path {...s} d="M5.5 21.4v-8.2l6.5-4.4 6.5 4.4v8.2" />
        <Path {...s} d="M10 21.4v-3.8a2 2 0 0 1 4 0v3.8" />
      </>);
    case 'search':
      return wrap(<>
        <Circle {...s} cx={11} cy={11} r={6.4} />
        <Path {...s} d="M15.8 15.8L20.5 20.5" />
      </>);
    case 'eye':
      return wrap(<>
        <Path {...s} d="M2.5 12s3.5-6.2 9.5-6.2 9.5 6.2 9.5 6.2-3.5 6.2-9.5 6.2S2.5 12 2.5 12z" />
        <Circle {...s} cx={12} cy={12} r={2.4} />
      </>);
    case 'play':
      return wrap(<Path d="M8 5.8v12.4L18.5 12 8 5.8z" fill={color} />);
    case 'pause':
      return wrap(<>
        <Path {...s} strokeWidth={2.2} d="M9 6v12" />
        <Path {...s} strokeWidth={2.2} d="M15 6v12" />
      </>);
    case 'x':
      return wrap(<>
        <Path {...s} strokeWidth={1.7} d="M6 6l12 12" />
        <Path {...s} strokeWidth={1.7} d="M18 6L6 18" />
      </>);
    case 'back':
      return wrap(<>
        <Path {...s} strokeWidth={1.7} d="M19 12H5.5" />
        <Path {...s} strokeWidth={1.7} d="M11.5 6l-6 6 6 6" />
      </>);
    case 'chevronDown':
      return wrap(<Path {...s} strokeWidth={1.7} d="M6 9.5l6 6 6-6" />);
    case 'chevronRight':
      return wrap(<Path {...s} strokeWidth={1.7} d="M9 6l6 6-6 6" />);
    case 'check':
      return wrap(<Path {...s} strokeWidth={1.8} d="M5 12.5l4.5 4.5L19 7.5" />);
    case 'star':
      return wrap(<Path {...s} strokeWidth={1.4} d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.6l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.2z" />);
    case 'sun':
      return wrap(<>
        <Circle {...s} strokeWidth={1.6} cx={12} cy={12} r={4.2} />
        <Path {...s} strokeWidth={1.6} d="M12 2.5v2.4" /><Path {...s} strokeWidth={1.6} d="M12 19.1v2.4" />
        <Path {...s} strokeWidth={1.6} d="M2.5 12h2.4" /><Path {...s} strokeWidth={1.6} d="M19.1 12h2.4" />
        <Path {...s} strokeWidth={1.6} d="M5 5l1.7 1.7" /><Path {...s} strokeWidth={1.6} d="M17.3 17.3L19 19" />
        <Path {...s} strokeWidth={1.6} d="M19 5l-1.7 1.7" /><Path {...s} strokeWidth={1.6} d="M6.7 17.3L5 19" />
      </>);
    case 'moon':
      return wrap(<Path {...s} strokeWidth={1.6} d="M20 14.5A8.2 8.2 0 1 1 9.5 4 6.4 6.4 0 0 0 20 14.5z" />);
    case 'music':
      return wrap(<>
        <Circle {...s} strokeWidth={1.4} cx={8} cy={17.5} r={2.8} />
        <Path {...s} strokeWidth={1.4} d="M10.8 17.5V5.2l7.7-1.7v11.6" />
        <Circle {...s} strokeWidth={1.4} cx={15.7} cy={15.1} r={2.8} />
      </>);
    case 'cross':
      return wrap(<>
        <Path {...s} d="M12 4v16" />
        <Path {...s} d="M7 9h10" />
      </>);
    case 'sunrise':
      return wrap(<>
        <Circle {...s} cx={12} cy={12} r={4.2} />
        <Path {...s} d="M12 3v2.2" /><Path {...s} d="M12 18.8V21" />
        <Path {...s} d="M3 12h2.2" /><Path {...s} d="M18.8 12H21" />
      </>);
    case 'camera':
      return wrap(<>
        <Path {...s} strokeWidth={1.7} d="M4 8h3.2l1.6-2.2h6.4L16.8 8H20v11H4V8z" />
        <Circle {...s} strokeWidth={1.7} cx={12} cy={13} r={3.2} />
      </>);
    case 'pen':
      return wrap(<Path {...s} strokeWidth={1.6} d="M4.5 19.5l3.8-.9L19.5 7.4a2 2 0 0 0-2.9-2.9L5.4 15.7l-.9 3.8z" />);
    case 'film':
      return wrap(<>
        <Rect {...s} strokeWidth={1.4} x={3} y={5} width={18} height={15} rx={2.5} />
        <Path {...s} strokeWidth={1.4} d="M3 9.5h18" />
        <Path {...s} strokeWidth={1.4} d="M8 5l2.5 4.5" />
        <Path {...s} strokeWidth={1.4} d="M13.5 5L16 9.5" />
      </>);
    case 'arrowRight':
      return wrap(<>
        <Path {...s} strokeWidth={1.6} d="M5 12h13" />
        <Path {...s} strokeWidth={1.6} d="M13 6.5l5.5 5.5-5.5 5.5" />
      </>);
    case 'send':
      return wrap(<>
        <Path {...s} strokeWidth={1.8} d="M12 19V5.5" />
        <Path {...s} strokeWidth={1.8} d="M6.5 11L12 5.5l5.5 5.5" />
      </>);
    default:
      return wrap(null);
  }
}
