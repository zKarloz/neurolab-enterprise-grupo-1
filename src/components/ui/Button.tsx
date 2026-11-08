import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'solid' | 'outline' | 'ghost'
interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: Variant
  busy?: boolean
}

const variantClasses: Record<Variant, string> = {
  solid: 'bg-[var(--ink)] text-[var(--surface)] hover:opacity-90',
  outline: 'border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]',
  ghost: 'hover:bg-[var(--surface-muted)]',
}

export function Button({ children, variant = 'solid', busy = false, disabled, className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={busy || disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
