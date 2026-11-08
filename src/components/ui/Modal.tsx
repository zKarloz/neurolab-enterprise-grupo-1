import { useEffect, useId, useRef } from 'react'
import type { PropsWithChildren } from 'react'
import { X } from 'lucide-react'

interface ModalProps extends PropsWithChildren {
  open: boolean
  title: string
  onClose: () => void
}

// <dialog> ofrece foco modal y Escape nativos, sin dependencia ni modal duplicado por módulo.
export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
    return () => { if (node.open) node.close() }
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-0 m-auto max-h-[min(90dvh,800px)] w-[min(95vw,580px)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-7">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Cerrar" className="rounded-lg p-2 hover:bg-[var(--surface-muted)]" onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </dialog>
  )
}
