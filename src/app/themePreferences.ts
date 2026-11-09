/** Preferencia explícita de apariencia. No contiene información sensible del usuario. */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Los valores previos (light/dark) siguen siendo compatibles; claro sigue por defecto. */
export function parseThemePreference(value: string | null): ThemeMode {
  return value === 'dark' || value === 'system' ? value : 'light'
}

/** Resolver el tema separadamente permite reaccionar a cambios de la preferencia del SO. */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode
}
