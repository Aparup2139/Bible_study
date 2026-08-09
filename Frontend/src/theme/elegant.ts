export interface Palette {
  canvas: string; bg: string; sheet: string;
  surface: string; surface2: string;
  hairline: string; hairlineSoft: string;
  gold: string; goldBright: string; goldDeep: string; goldSoft: string; onGold: string;
  hope: string; hopeBright: string; hopeSoft: string; hopeBorder: string; hopeBorderSoft: string; onHope: string;
  ink: string; ink2: string; ink3: string;
  live: string; input: string; grabber: string;
}

export const Palettes: { dark: Palette; light: Palette } = {
  dark: {
    canvas: '#080707', bg: '#100E0D', sheet: 'rgba(19,17,16,0.92)',
    surface: 'rgba(255,255,255,0.07)', surface2: 'rgba(255,255,255,0.12)',
    hairline: 'rgba(206,207,212,0.30)', hairlineSoft: 'rgba(206,207,212,0.16)',
    gold: '#D3D5DA', goldBright: '#F3F4F7', goldDeep: '#999BA1', goldSoft: 'rgba(211,213,218,0.13)', onGold: '#121011',
    hope: '#EDB4AA', hopeBright: '#F8DDD6', hopeSoft: 'rgba(235,178,168,0.18)',
    hopeBorder: 'rgba(242,199,190,0.42)', hopeBorderSoft: 'rgba(242,199,190,0.26)', onHope: '#2A1512',
    ink: '#F7F6F6', ink2: '#C9CACE', ink3: '#93949A',
    live: '#E67260', input: 'rgba(255,255,255,0.09)', grabber: 'rgba(255,255,255,0.22)',
  },
  light: {
    canvas: '#F5F1EC', bg: '#FDFAF7', sheet: 'rgba(254,252,250,0.94)',
    surface: 'rgba(255,255,255,0.5)', surface2: 'rgba(255,255,255,0.8)',
    hairline: 'rgba(110,102,100,0.24)', hairlineSoft: 'rgba(110,102,100,0.12)',
    gold: '#6F6F75', goldBright: '#9A9AA0', goldDeep: '#4A4A50', goldSoft: 'rgba(111,111,117,0.12)', onGold: '#FDFAF7',
    hope: '#A6635A', hopeBright: '#C78D82', hopeSoft: 'rgba(166,99,90,0.14)',
    hopeBorder: 'rgba(166,99,90,0.36)', hopeBorderSoft: 'rgba(166,99,90,0.22)', onHope: '#FDF6F3',
    ink: '#211F1F', ink2: '#5E5B5B', ink3: '#969092',
    live: '#B44A3C', input: 'rgba(255,255,255,0.78)', grabber: 'rgba(48,45,44,0.2)',
  },
};

/** Custom fonts: never combine with fontWeight (breaks on Android). */
export const Fonts = {
  serif: 'CormorantGaramond_600SemiBold',
  serifMed: 'CormorantGaramond_500Medium',
  serifItalic: 'CormorantGaramond_500Medium_Italic',
  sansLight: 'Outfit_300Light',
  sans: 'Outfit_400Regular',
  sansMed: 'Outfit_500Medium',
  sansSemi: 'Outfit_600SemiBold',
} as const;

/** Deep tones stay constant across themes (video/hero surfaces). */
export const Deep = {
  heroStops: ['#0D0C0C', '#171415', '#281C1A', '#432C26'] as const,
  heroLocations: [0, 0.44, 0.74, 1] as const,
  chatHeaderStops: ['#100E0D', '#1A1615', '#2E201C'] as const,
  bannerStops: ['#100E0D', '#1A1615', '#3A2620'] as const,
  onDeep: '#F6F4F3',
  onDeepSoft: 'rgba(243,241,240,0.72)',
  onDeepFaint: 'rgba(243,241,240,0.68)',
  goldOnDeep: '#F8DDD6', // rose light on deep surfaces (export name kept for call sites)
  chipOnDeep: 'rgba(17,14,14,0.32)',
  chipBorderOnDeep: 'rgba(242,199,190,0.30)',
  liveOnDeep: '#E67260',
  glow: 'rgba(244,196,186,0.32)', // dawn glow (VideoHero halo)
};

/** Per-stream thumbnail gradients keyed by thumbnailEmoji (fallback: first). */
export const ThumbGradients: Record<string, readonly [string, string, string]> = {
  '🎵': ['#151313', '#211A1A', '#3F2822'],
  '⛪': ['#100F0F', '#1F1817', '#452C25'],
  '📖': ['#131211', '#221B1A', '#3A251D'],
  '🙌': ['#111010', '#1D1716', '#4A2F23'],
};
export const DefaultThumbGradient = ThumbGradients['⛪'];

export const Radii = { sm: 14, md: 16, lg: 18, xl: 20, xxl: 22, pill: 999 } as const;

/** 3-D glass elevation. Spread into style objects; do not re-declare per screen. */
export const Elev = {
  // Cards, tiles, chat panels, search bars (on-palette surfaces)
  card: {
    shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  // Hero / large panels
  hero: {
    shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  // Small floating chips/buttons (send, glass circles)
  chip: {
    shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Light-mode variants: same geometry, softer warm shadow
  cardLight: {
    shadowColor: '#604038', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  heroLight: {
    shadowColor: '#604038', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  chipLight: {
    shadowColor: '#604038', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;
