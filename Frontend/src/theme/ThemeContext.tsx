import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Palettes, type Palette } from './elegant';

interface ThemeCtx {
  c: Palette;
  isDark: boolean;
  toggle: () => void;
  elev: { card: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number } } };
}

const Ctx = createContext<ThemeCtx>({ c: Palettes.dark, isDark: true, toggle: () => {}, elev: { card: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } } });

/** Wrap the app (see app/_layout.tsx). Default is dark — black & gold. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const toggle = useCallback(() => setIsDark((d) => !d), []);
  const value = useMemo(
    () => ({ c: isDark ? Palettes.dark : Palettes.light, isDark, toggle, elev: { card: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } } }),
    [isDark, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
