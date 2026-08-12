export const Colors = {
  // Primary brand
  primary: '#D3D5DA',
  primaryDark: '#999BA1',
  primaryLight: '#F3F4F7',

  // Backgrounds
  background: '#000000',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceHighlight: '#222222',
  border: '#333333',
  borderLight: '#444444',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#888888',
  textDisabled: '#555555',

  // Status
  live: '#E67260',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',

  // Action button states
  actionActive: '#E67260',
  actionInactive: '#1a1a1a',

  // Overlays
  overlayDark: 'rgba(0,0,0,0.7)',
  overlayMedium: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(0,0,0,0.3)',

  // Chat
  chatBubble: '#1a1a1a',
  chatInput: '#0a0a0a',

  // Gradient stops
  gradientRedStart: '#100E0D',
  gradientRedEnd: '#3A2620',
} as const;

export type ColorKey = keyof typeof Colors;
