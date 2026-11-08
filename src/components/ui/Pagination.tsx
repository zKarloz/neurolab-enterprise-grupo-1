import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

// Paginación compartida de listados pequeños; no simula datos ni depende del módulo.
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Paginación" className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-[var(--muted)]">Página {page} de {pages} · {total} registros</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={17} /></Button>
        <Button type="button" variant="outline" disabled={page === pages} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente"><ChevronRight size={17} /></Button>
      </div>
    </nav>
  )
}
