import type { InputHTMLAttributes, ReactNode } from 'react'

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  hint?: string
  endSlot?: ReactNode
}

export function InputField({ label, id, hint, endSlot, className = '', ...props }: InputFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--ink)]">{label}</label>
      <div className="relative">
        <input
          {...props}
          id={id}
          className={`w-full min-h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 pr-12 text-sm text-[var(--ink)] outline-none transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--focus)] ${className}`}
        />
        {endSlot && <div className="absolute right-2 top-1/2 -translate-y-1/2">{endSlot}</div>}
      </div>
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  )
}
