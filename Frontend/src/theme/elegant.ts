export interface Palette {
  canvas: string; bg: string; sheet: string;
  surface: string; surface2: string;
  hairline: string; hairlineSoft: string;
  gold: string; goldBright: string; goldDeep: string; goldSoft: string; onGold: string;
  ink: string; ink2: string; ink3: string;
  live: string; input: string; grabber: string;
}

export const Palettes: { dark: Palette; light: Palette } = {
  dark: {
    canvas: '#070605', bg: '#0C0A07', sheet: 'rgba(16,13,9,0.96)',
    surface: 'rgba(244,232,205,0.05)', surface2: 'rgba(244,232,205,0.09)',
    hairline: 'rgba(208,172,110,0.26)', hairlineSoft: 'rgba(208,172,110,0.13)',
    gold: '#C9A257', goldBright: '#E8CB8F', goldDeep: '#93702F', goldSoft: 'rgba(201,162,87,0.13)', onGold: '#1B1204',
    ink: '#F2EADA', ink2: '#C3B89F', ink3: '#8E8570',
    live: '#E06A50', input: 'rgba(244,232,205,0.06)', grabber: 'rgba(244,232,205,0.22)',
  },
  light: {
    canvas: '#ECE9E1', bg: '#F8F4EB', sheet: 'rgba(250,246,238,0.98)',
    surface: 'rgba(255,255,255,0.6)', surface2: 'rgba(255,255,255,0.92)',
    hairline: 'rgba(150,120,60,0.3)', hairlineSoft: 'rgba(150,120,60,0.16)',
    gold: '#997330', goldBright: '#B8934B', goldDeep: '#7C5D25', goldSoft: 'rgba(153,115,48,0.12)', onGold: '#FBF6EA',
    ink: '#282316', ink2: '#6B6350', ink3: '#98917E',
    live: '#BC5238', input: 'rgba(255,255,255,0.78)', grabber: 'rgba(60,50,30,0.2)',
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
  heroStops: ['#131020', '#1C1420', '#2A1B1A', '#3B2815'] as const,
  heroLocations: [0, 0.44, 0.74, 1] as const,
  chatHeaderStops: ['#14101E', '#1E1520', '#2C1D18'] as const,
  bannerStops: ['#14101E', '#1E1520', '#30200F'] as const,
  onDeep: '#F5EFDF',
  onDeepSoft: 'rgba(242,234,218,0.72)',
  onDeepFaint: 'rgba(242,234,218,0.68)',
  goldOnDeep: '#E8CB8F',
  chipOnDeep: 'rgba(14,11,7,0.55)',
  chipBorderOnDeep: 'rgba(232,203,143,0.32)',
  liveOnDeep: '#E06A50',
};

/** Per-stream thumbnail gradients keyed by thumbnailEmoji (fallback: first). */
export const ThumbGradients: Record<string, readonly [string, string, string]> = {
  '🎵': ['#1B1430', '#2A1A2E', '#4A2C20'],
  '⛪': ['#241417', '#33201A', '#59401F'],
  '📖': ['#101822', '#1C2430', '#3A3222'],
  '🙌': ['#131A14', '#1F2A1E', '#3E3A1F'],
};
export const DefaultThumbGradient = ThumbGradients['⛪'];

export const Radii = { sm: 14, md: 16, lg: 18, xl: 20, xxl: 22, pill: 999 } as const;
