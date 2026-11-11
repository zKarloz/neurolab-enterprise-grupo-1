import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../app/ThemeProvider'

/** Control legado reutilizable; el encabezado utiliza el selector completo en UserMenu. */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Activar modo oscuro' : 'Activar modo claro'}
      title={isLight ? 'Modo oscuro' : 'Modo claro'}
      className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
    >
      {isLight ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
    </button>
  )
}
