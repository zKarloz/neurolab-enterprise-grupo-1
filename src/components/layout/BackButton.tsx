import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { BackDestination } from './backNavigation'

interface BackButtonProps {
  destination: BackDestination
  className?: string
  style?: CSSProperties
}

/**
 * Retroceso contextual compartido.
 * En escritorio vive en el margen izquierdo y permanece fijo bajo el topbar;
 * en móvil se integra al topbar para no cubrir tablas ni campos de entrada.
 */
export function BackButton({ destination, className = '', style }: BackButtonProps) {
  return (
    <Link
      to={destination.to}
      aria-label={destination.label}
      title={destination.label}
      style={style}
      className={`nl-back-button grid size-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-sm transition-[background-color,box-shadow] duration-150 hover:bg-[var(--surface-muted)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] motion-reduce:transition-none print:hidden ${className}`}
    >
      <ArrowLeft size={19} strokeWidth={2} aria-hidden="true" />
    </Link>
  )
}
