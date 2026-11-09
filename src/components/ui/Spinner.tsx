import { LoaderCircle } from 'lucide-react'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps {
  size?: SpinnerSize
  /** Texto accesible y opcionalmente visible, p. ej. "Consultando usuarios…". */
  label?: string
  /** Centrar el indicador en una zona de contenido. */
  centered?: boolean
  className?: string
}

const iconSizes: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
}

/** Indicador ligero compartido; sin temporizadores ni dependencia externa. */
export function Spinner({ size = 'md', label = 'Cargando…', centered = false, className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 text-[var(--muted)] ${centered ? 'justify-center' : ''} ${className}`.trim()}
    >
      <LoaderCircle
        aria-hidden="true"
        className={`${iconSizes[size]} shrink-0 animate-spin motion-reduce:animate-none`}
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}
