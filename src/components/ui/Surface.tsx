import type { PropsWithChildren } from 'react'

export function Surface({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] ${className}`}>{children}</section>
}
