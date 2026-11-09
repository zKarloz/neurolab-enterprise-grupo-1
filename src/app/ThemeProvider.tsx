import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { parseThemePreference, resolveTheme } from './themePreferences'
import type { ResolvedTheme, ThemeMode } from './themePreferences'

interface ThemeContextValue {
  /** Preferencia guardada: claro, oscuro o automático según el sistema. */
  theme: ThemeMode
  /** Tema realmente aplicado al documento. */
  resolvedTheme: ResolvedTheme
  setTheme: (next: ThemeMode) => void
  /** Compatibilidad con controles anteriores que alternan entre claro y oscuro. */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_KEY = 'neurolab:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try { return parseThemePreference(window.localStorage.getItem(THEME_KEY)) }
  catch { return 'light' }
}

function getSystemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [systemDark, setSystemDark] = useState(getSystemDark)
  const resolvedTheme = resolveTheme(theme, systemDark)

  useEffect(() => {
    // Escuchar el SO permite que "Sistema" cambie sin recargar NeuroLab.
    const media = window.matchMedia?.(DARK_QUERY)
    if (!media) return
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
    try { window.localStorage.setItem(THEME_KEY, theme) }
    catch { /* Bloqueo de storage: el selector funciona durante esta sesión. */ }
  }, [theme, resolvedTheme])

  // Conserva funcionando cualquier ThemeToggle utilizado fuera del encabezado.
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
  }, [resolvedTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme requiere ThemeProvider')
  return value
}
