import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

/** Pestañas compartidas, accesibles, con desplazamiento horizontal en móvil. */
export interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  items: readonly TabItem[]
  value: string
  onChange: (next: string) => void
  label: string
  idPrefix: string
}

export function Tabs({ items, value, onChange, label, idPrefix }: TabsProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    onChange(items[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-1">
      {items.map((tab, i) => (
        <button
          key={tab.id}
          ref={(element) => { buttons.current[i] = element }}
          id={`${idPrefix}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, i)}
          onClick={() => onChange(tab.id)}
          className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-sm font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)] sm:flex-1 ${value === tab.id ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
        >{tab.label}</button>
      ))}
    </div>
  )
}
