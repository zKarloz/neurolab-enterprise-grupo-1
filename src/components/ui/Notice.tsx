import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'
const icons = { error: AlertCircle, success: CheckCircle2, info: Info }

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = icons[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-relaxed">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
