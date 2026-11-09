import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Check, ChevronDown, CircleUserRound, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react'
import { useTheme } from '../../app/ThemeProvider'
import type { ThemeMode } from '../../app/themePreferences'

interface UserMenuProps {
  displayName: string
  onSignOut: () => Promise<void>
}

const themeOptions = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

/** Menú único del encabezado: perfil, preferencias y salida. */
export function UserMenu({ displayName, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { theme, setTheme } = useTheme()
  const location = useLocation()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return

    // Cierre por clic externo y Escape; no hay listeners cuando el menú está oculto.
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function chooseTheme(next: ThemeMode) {
    setTheme(next)
    setOpen(false)
    trigger.current?.focus()
  }

  async function exit() {
    if (signingOut) return
    setSigningOut(true)
    setOpen(false)
    try { await onSignOut() }
    finally { setSigningOut(false) }
  }

  return (
    <div ref={container} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        disabled={signingOut}
        onClick={() => setOpen((previous) => !previous)}
        className="flex h-11 min-w-0 max-w-[230px] items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-left text-sm font-medium transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-60 sm:min-w-40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)] text-[var(--muted)]">
          <CircleUserRound size={19} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-[var(--muted)] transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* El panel permanece montado: la visibilidad se oculta al terminar la transición.
           Solo animamos opacidad y traslación para evitar saltos al cerrar. */}
      <div
        id={panelId}
        aria-hidden={!open}
        className={`absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-xl transform-gpu transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${open ? 'visible translate-y-0 opacity-100 ease-out' : 'invisible pointer-events-none -translate-y-1 opacity-0 ease-in'}`}
      >
        <div className="border-b border-[var(--line)] px-3 py-2">
          <p className="truncate text-sm font-semibold" title={displayName}>{displayName}</p>
          <p className="text-xs text-[var(--muted)]">Opciones de cuenta</p>
        </div>
        <NavLink
          to="/cuenta"
          onClick={() => setOpen(false)}
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          <UserRound size={17} aria-hidden="true" /> Cuenta
        </NavLink>
        <div className="my-2 border-t border-[var(--line)] px-3 pt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Tema</p>
          <div role="group" aria-label="Elegir apariencia" className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => chooseTheme(value)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${theme === value ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
              >
                <span className="relative">
                  <Icon size={17} aria-hidden="true" />
                  {theme === value && <Check size={10} aria-hidden="true" className="absolute -right-3 -top-1" />}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void exit()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-60"
          >
            <LogOut size={17} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
