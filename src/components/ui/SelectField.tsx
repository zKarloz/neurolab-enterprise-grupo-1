import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: readonly SelectOption[]
}

/** Selector nativo accesible con una flecha Lucide separada 16px del borde derecho. */
export function SelectField({ label, options, className = '', id, ...props }: SelectFieldProps) {
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>}
      <div className="relative">
        <select
          {...props}
          id={id}
          className="min-h-11 w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-4 pr-12 text-sm text-[var(--ink)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
      </div>
    </div>
  )
}
