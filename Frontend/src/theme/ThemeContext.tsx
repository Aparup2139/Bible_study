import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Palettes, type Palette } from './elegant';

interface ThemeCtx {
  c: Palette;
  isDark: boolean;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ c: Palettes.dark, isDark: true, toggle: () => {} });

/** Wrap the app (see app/_layout.tsx). Default is dark — black & gold. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const toggle = useCallback(() => setIsDark((d) => !d), []);
  const value = useMemo(
    () => ({ c: isDark ? Palettes.dark : Palettes.light, isDark, toggle }),
    [isDark, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
