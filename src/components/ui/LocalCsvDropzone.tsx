import { useEffect, useRef, useState, type DragEvent } from 'react'
import { UploadCloud } from 'lucide-react'
import { selectLocalCsv } from './csvFileSelection.ts'

interface LocalCsvDropzoneProps {
  id: string
  onFile: (file: File) => void | Promise<void>
  disabled?: boolean
  loading?: boolean
  /** Nota específica del importador, visible debajo de la zona de carga. */
  hint?: string
}

/** Carga CSV compartida: clic, teclado y arrastrar/soltar, sin transferir archivos a la red. */
export function LocalCsvDropzone({ id, onFile, disabled = false, loading = false, hint }: LocalCsvDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [selectionError, setSelectionError] = useState('')
  const dragDepth = useRef(0)
  const blocked = disabled || loading

  useEffect(() => {
    if (blocked) {
      dragDepth.current = 0
      setDragging(false)
    }
  }, [blocked])

  const acceptFiles = (files: File[]) => {
    if (blocked) return
    const selection = selectLocalCsv(files)
    if (!selection.ok) {
      setSelectionError(selection.error)
      return
    }
    setSelectionError('')
    void onFile(selection.file)
  }

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    if (!blocked) setDragging(true)
  }
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Evita que el navegador abra el archivo en lugar de importarlo.
    event.preventDefault()
    event.dataTransfer.dropEffect = blocked ? 'none' : 'copy'
  }
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragging(false)
    if (!blocked) acceptFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="space-y-2" onDragEnter={onDragEnter} onDragOver={onDragOver}
      onDragLeave={onDragLeave} onDrop={onDrop}>
      <input id={id} type="file" accept=".csv,text/csv" disabled={blocked} className="peer sr-only"
        aria-describedby={`${id}-hint${selectionError ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          acceptFiles(Array.from(event.currentTarget.files ?? []))
          // Permite seleccionar otra vez el mismo archivo después de un error o cambio de contenido.
          event.currentTarget.value = ''
        }} />
      <label htmlFor={id} aria-disabled={blocked}
        className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center text-sm font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] ${
          blocked ? 'cursor-not-allowed border-[var(--line)] bg-[var(--surface-muted)] opacity-60'
          : dragging ? 'cursor-copy border-[var(--focus)] bg-[var(--surface-muted)]'
          : 'cursor-pointer border-[var(--line)] bg-[var(--surface-muted)] hover:border-[var(--focus)]'
        }`}>
        <UploadCloud size={24} aria-hidden="true" />
        <span>{loading ? 'Leyendo y validando CSV…' : dragging ? 'Suelta el CSV para importarlo' : 'Arrastra y suelta un CSV aquí'}</span>
        <span className="text-xs font-normal text-[var(--muted)]">o haz clic para seleccionar un archivo de tu equipo</span>
      </label>
      <p id={`${id}-hint`} className="text-xs leading-5 text-[var(--muted)]">
        {hint ?? 'Solo archivos .csv. El contenido se procesa localmente en tu navegador.'}
      </p>
      {selectionError && <p id={`${id}-error`} role="alert" className="text-sm text-[var(--danger,var(--ink))]">{selectionError}</p>}
    </div>
  )
}
