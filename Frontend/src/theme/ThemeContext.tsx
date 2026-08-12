import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Elev, Palettes, type Palette } from './elegant';

interface ThemeElev {
  card: typeof Elev.card | typeof Elev.cardLight;
  hero: typeof Elev.hero | typeof Elev.heroLight;
  chip: typeof Elev.chip | typeof Elev.chipLight;
}

interface ThemeCtx {
  c: Palette;
  isDark: boolean;
  toggle: () => void;
  elev: ThemeElev;
}

const darkElev: ThemeElev = { card: Elev.card, hero: Elev.hero, chip: Elev.chip };
const lightElev: ThemeElev = { card: Elev.cardLight, hero: Elev.heroLight, chip: Elev.chipLight };

const Ctx = createContext<ThemeCtx>({ c: Palettes.dark, isDark: true, toggle: () => {}, elev: darkElev });

/** Wrap the app (see app/_layout.tsx). Default is dark — black & rose-dawn silver. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const toggle = useCallback(() => setIsDark((d) => !d), []);
  const value = useMemo(
    () => ({
      c: isDark ? Palettes.dark : Palettes.light,
      isDark,
      toggle,
      elev: isDark ? darkElev : lightElev,
    }),
    [isDark, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
